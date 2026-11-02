"""Diagnostico v4 (SOMENTE LEITURA). Nao envia ordens. Nao exibe a chave.

Mostra: HTTPS/status, 401, quantidade de eventos, ids/ordem, cursor,
formato, relogio (header Date), contas/ativos/bancas, pares e idades,
e o motivo preciso de cada reprovacao. Tambem confere o MT5 (DEMO,
Algo Trading, simbolos). Uso: python diagnostico_v4.py [--sem-mt5]

O relatorio final e exibido no console E gravado pelo proprio Python em
dados/diagnostico_ultimo.txt (UTF-8). A chave nunca e gravada.
"""
from __future__ import annotations

import getpass
import sys
import time
import traceback
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

from winorwin_vps.config import Config  # noqa: E402
from winorwin_vps.diagnostico import Relatorio, diagnosticar  # noqa: E402

ARQUIVO_RELATORIO = RAIZ / "dados" / "diagnostico_ultimo.txt"


def progresso_console(msg: str) -> None:
    print("  ...", msg, flush=True)


def montar_texto(rel: Relatorio, cabecalho: str) -> str:
    linhas = [cabecalho, *rel.linhas, "",
              "Par v4 recente e ordenado: " + ("CONFIRMADO" if rel.par_ok else "NAO CONFIRMADO"),
              "MT5 DEMO pronto: " + ("SIM" if rel.mt5_ok else "NAO"),
              "RESULTADO: " + ("APROVADO" if rel.aprovado else "REPROVADO - " + ", ".join(rel.falhas))]
    return "\n".join(linhas) + "\n"


def sanitizar(texto: str, segredos: list[str]) -> str:
    for s in segredos:
        if s:
            texto = texto.replace(s, "[CHAVE_OCULTA]")
    return texto


def gravar_relatorio(texto: str, destino: Path = ARQUIVO_RELATORIO) -> Path:
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(".tmp")
    tmp.write_text(texto, encoding="utf-8")
    tmp.replace(destino)
    return destino


def executar(cfg: Config, relay, mt5, destino: Path = ARQUIVO_RELATORIO,
             agora_ms=lambda: int(time.time() * 1000), progresso=progresso_console, **kw) -> int:
    cab = "Diagnostico Win or Win v4 - " + time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    print(cab, flush=True)
    print("Consultando relay (ate ~40 s)...", flush=True)
    try:
        rel = diagnosticar(cfg, relay, mt5, agora_ms, progresso=progresso, **kw)
    except Exception as e:  # falha controlada: mostra o erro util, sem a chave
        rel = Relatorio()
        rel.falha("ERRO_INTERNO", f"{type(e).__name__}: {e}")
        rel.linhas.append(traceback.format_exc())
    texto = sanitizar(montar_texto(rel, cab), [cfg.token])
    print(texto, flush=True)
    try:
        caminho = gravar_relatorio(texto, destino)
        print(f"Relatorio salvo em {caminho} (sem a chave).", flush=True)
    except OSError as e:
        print(f"AVISO: nao foi possivel salvar o relatorio: {e}", flush=True)
    return 0 if rel.aprovado else 1


def main() -> int:
    cfg = Config.do_ambiente()
    if not cfg.token:
        cfg.token = getpass.getpass("Cole a chave VPS (nao aparece na tela): ").strip()
    from winorwin_vps.mt5_adapter import MT5Real
    from winorwin_vps.relay import RelayClient
    mt5 = None if "--sem-mt5" in sys.argv else MT5Real(cfg.mt5_terminal, cfg.magic)
    return executar(cfg, RelayClient(cfg.relay_url, cfg.token), mt5)


if __name__ == "__main__":
    raise SystemExit(main())
