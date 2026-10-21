#!/usr/bin/env python3
"""Backup criptografado fora da aplicacao; nao executa automaticamente.

Requer: Python 3.11+, pg_dump, age e acesso administrativo ao PostgreSQL
e Storage privados. Uso: python3 scripts/backup_telegram.py --check ou --run
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
import io
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

BUCKET = "downloads"
MAX_TELEGRAM_BYTES = 49 * 1024 * 1024
CHUNK = 1024 * 1024


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Variavel obrigatoria ausente: {name}")
    return value


def require_tools() -> None:
    for name in ("pg_dump", "age"):
        if not shutil.which(name):
            raise RuntimeError(f"Programa obrigatorio nao encontrado: {name}")


def configuration() -> dict[str, str]:
    require_tools()
    recipient = env("BACKUP_AGE_RECIPIENT")
    if not recipient.startswith("age1"):
        raise RuntimeError("BACKUP_AGE_RECIPIENT deve ser uma chave publica age1...")
    chat_id = env("BACKUP_TELEGRAM_CHAT_ID")
    if chat_id != "-1003826563115":
        raise RuntimeError("Chat ID nao confere com o canal privado autorizado")
    keys = ["PGHOST", "PGUSER", "PGDATABASE", "PGPASSWORD",
            "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
            "BACKUP_TELEGRAM_BOT_TOKEN"]
    cfg = {k: env(k) for k in keys}
    cfg["BACKUP_AGE_RECIPIENT"] = recipient
    cfg["BACKUP_TELEGRAM_CHAT_ID"] = chat_id
    parsed = urllib.parse.urlsplit(cfg["SUPABASE_URL"])
    if parsed.scheme != "https" or not parsed.hostname:
        raise RuntimeError("SUPABASE_URL deve ser HTTPS")
    return cfg


def storage_request(cfg: dict[str, str], method: str, endpoint: str,
                    body: bytes | None = None):
    url = cfg["SUPABASE_URL"].rstrip("/") + endpoint
    token = cfg["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": token, "Authorization": "Bearer " + token}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    return urllib.request.urlopen(request, timeout=90)


def object_names(cfg: dict[str, str], prefix: str = ""):
    """Storage list retorna entradas diretas e subpastas; pagina resultados."""
    offset = 0
    while True:
        body = json.dumps({"prefix": prefix, "limit": 100, "offset": offset,
                           "sortBy": {"column": "name", "order": "asc"}}).encode()
        endpoint = "/storage/v1/object/list/" + urllib.parse.quote(BUCKET)
        with storage_request(cfg, "POST", endpoint, body) as response:
            entries = json.load(response)
        if not isinstance(entries, list):
            raise RuntimeError("Listagem do Storage invalida")
        for entry in entries:
            name = entry.get("name", "")
            if not isinstance(name, str) or name in ("", ".", "..") or "/" in name:
                raise RuntimeError("Nome invalido na listagem do Storage")
            full_name = prefix + name
            if entry.get("id") is None:
                yield from object_names(cfg, full_name + "/")
            else:
                yield full_name
        if len(entries) < 100:
            break
        offset += len(entries)


def encrypt_database(cfg: dict[str, str], destination: pathlib.Path) -> None:
    pg_env = os.environ.copy()
    pg_env.update({key: cfg[key] for key in ("PGHOST", "PGUSER", "PGDATABASE", "PGPASSWORD")})
    # Credentials are inherited via environment; they never appear in argv.
    pg = subprocess.Popen(
        ["pg_dump", "--format=custom", "--no-owner", "--no-acl",
         "--schema=public", "--schema=auth", "--schema=storage", "--file=-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=pg_env)
    assert pg.stdout is not None
    with destination.open("wb") as output:
        age = subprocess.Popen(
            ["age", "-r", cfg["BACKUP_AGE_RECIPIENT"]],
            stdin=pg.stdout, stdout=output, stderr=subprocess.PIPE)
        pg.stdout.close()
        _, age_error = age.communicate()
    pg_error = pg.stderr.read() if pg.stderr else b""
    pg_status = pg.wait()
    if pg_status != 0 or age.returncode != 0 or destination.stat().st_size == 0:
        # Do not display raw stderr (may contain credentials, hostnames, SQL).
        raise RuntimeError("Falha no pg_dump ou na criptografia age")


def encrypt_storage(cfg: dict[str, str], destination: pathlib.Path) -> int:
    names = list(object_names(cfg))
    with destination.open("wb") as output:
        age = subprocess.Popen(["age", "-r", cfg["BACKUP_AGE_RECIPIENT"]],
                               stdin=subprocess.PIPE, stdout=output,
                               stderr=subprocess.PIPE)
        assert age.stdin is not None
        try:
            # Streaming tar->age: nao grava objetos em texto claro em disco.
            with tarfile.open(fileobj=age.stdin, mode="w|") as archive:
                for name in names:
                    endpoint = "/storage/v1/object/" + urllib.parse.quote(BUCKET) + "/" + urllib.parse.quote(name, safe="/")
                    with storage_request(cfg, "GET", endpoint) as response:
                        size = response.headers.get("Content-Length")
                        if size is None:
                            raise RuntimeError("Objeto sem Content-Length: nao e seguro continuar")
                        info = tarfile.TarInfo(name=name)
                        info.size = int(size)
                        info.mode = 0o600
                        info.mtime = int(time.time())
                        archive.addfile(info, response)
        except Exception:
            age.stdin.close()
            age.wait()
            raise
        age.stdin.close()
        age.wait()
    if age.returncode != 0 or not destination.stat().st_size:
        raise RuntimeError("Falha ao criptografar arquivos do Storage")
    return len(names)


def sha256_file(path: pathlib.Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(CHUNK), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def telegram_document(cfg: dict[str, str], path: pathlib.Path) -> None:
    size = path.stat().st_size
    if size > MAX_TELEGRAM_BYTES:
        raise RuntimeError("Arquivo supera o limite conservador de 49 MiB do bot Telegram")
    token = cfg["BACKUP_TELEGRAM_BOT_TOKEN"]
    boundary = "wow-backup-" + os.urandom(10).hex()
    crlf = b"\r\n"
    header = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n"
              f"{cfg['BACKUP_TELEGRAM_CHAT_ID']}\r\n"
              f"--{boundary}\r\nContent-Disposition: form-data; name=\"document\"; "
              f"filename=\"{path.name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
    trailer = (f"\r\n--{boundary}--\r\n").encode()
    conn = http.client.HTTPSConnection("api.telegram.org", timeout=180)
    try:
        conn.putrequest("POST", "/bot" + token + "/sendDocument")
        conn.putheader("Content-Type", "multipart/form-data; boundary=" + boundary)
        conn.putheader("Content-Length", str(len(header) + size + len(trailer)))
        conn.endheaders()
        conn.send(header)
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(CHUNK), b""):
                conn.send(chunk)
        conn.send(trailer)
        response = conn.getresponse()
        # Never print responses: Telegram may include sensitive details.
        result = json.loads(response.read())
        if response.status != 200 or result.get("ok") is not True:
            raise RuntimeError("Telegram nao confirmou recebimento do arquivo")
    finally:
        conn.close()


def execute(cfg: dict[str, str]) -> None:
    # Nenhuma exportacao real e permitida antes de validar chave + destino.
    with tempfile.TemporaryDirectory(prefix="wow-secure-backup-") as temp:
        directory = pathlib.Path(temp)
        os.chmod(directory, 0o700)
        db = directory / "win-or-win-postgres.dump.age"
        files = directory / "win-or-win-storage.tar.age"
        encrypt_database(cfg, db)
        count = encrypt_storage(cfg, files)
        items = [db, files]
        manifest = {
            "version": 1,
            "storage_bucket": BUCKET,
            "storage_file_count": count,
            "encrypted_files": [{"name": p.name, "bytes": p.stat().st_size,
                                 "sha256": sha256_file(p)} for p in items],
        }
        info = directory / "win-or-win-manifest.json"
        info.write_text(json.dumps(manifest, indent=2) + "\n")
        os.chmod(info, 0o600)
        items.append(info)
        for p in items:
            telegram_document(cfg, p)
    print("OK: 3 arquivos enviados ao canal; nenhum dado em claro foi salvo no disco.")
    print("ATENCAO: backup ainda requer teste de restauracao isolada.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="Confere dependencias sem rede")
    group.add_argument("--run", action="store_true", help="Exporta, cifra e envia ao canal")
    args = parser.parse_args()
    try:
        cfg = configuration()
        if args.check:
            print("OK: configuracao e executaveis verificados; nenhum dado acessado.")
        else:
            execute(cfg)
        return 0
    except Exception as exc:
        # Nao vazar senha de banco, token ou dados de objetos em excecoes.
        print("ERRO: " + (str(exc) if isinstance(exc, RuntimeError) else
                          "falha de rede/IO; confira configuracao sem divulgar secrets"), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
