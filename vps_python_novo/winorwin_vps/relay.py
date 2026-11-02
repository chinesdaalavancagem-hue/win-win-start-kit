"""Cliente do relay Win or Win (somente GET). Nunca registra a chave."""
from __future__ import annotations

import email.utils
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class RespostaRelay:
    ok: bool
    http: int | None
    motivo: str  # OK, HTTP_401, HTTP_xxx, SEM_CONEXAO, NAO_JSON, FORMATO_INVALIDO, MODO_INVALIDO, ORDERS_ENABLED_INESPERADO
    eventos: list[dict] = field(default_factory=list)
    next_cursor: int | None = None
    relay_version: Any = None
    mode: Any = None
    desvio_relogio_ms: int | None = None  # hora VPS - hora servidor
    latencia_ms: int = 0
    erro_servidor: str | None = None


class _SemRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):  # noqa: D401
        return None


def _abrir_padrao(req: urllib.request.Request, timeout: float):
    opener = urllib.request.build_opener(_SemRedirect)
    return opener.open(req, timeout=timeout)


def validar_corpo(d: Any) -> tuple[bool, str]:
    if not isinstance(d, dict):
        return False, "FORMATO_INVALIDO"
    if d.get("ok") is not True:
        return False, "FORMATO_INVALIDO"
    if d.get("mode") != "OBSERVACAO_SEM_ORDENS":
        return False, "MODO_INVALIDO"
    if d.get("orders_enabled") is not False:
        return False, "ORDERS_ENABLED_INESPERADO"
    ev = d.get("events")
    if not isinstance(ev, list) or len(ev) > 30:
        return False, "FORMATO_INVALIDO"
    return True, "OK"


class RelayClient:
    def __init__(self, url: str, token: str, abrir: Callable | None = None,
                 relogio: Callable[[], float] = time.time):
        if not url.startswith("https://"):
            raise ValueError("relay precisa ser HTTPS")
        self.url = url if url.endswith("/") else url + "/"
        self._token = token
        self._abrir = abrir or _abrir_padrao
        self._relogio = relogio

    def buscar(self, after: int = 0, timeout: float = 8.0) -> RespostaRelay:
        req = urllib.request.Request(
            f"{self.url}?after={int(after)}",
            headers={"Authorization": "Bearer " + self._token, "Accept": "application/json"},
        )
        t0 = self._relogio()
        try:
            r = self._abrir(req, timeout)
            status, headers, corpo = r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            status, headers, corpo = e.code, e.headers, e.read() if e.fp else b""
        except Exception:
            return RespostaRelay(False, None, "SEM_CONEXAO")
        t1 = self._relogio()
        lat = int((t1 - t0) * 1000)
        desvio = None
        data_hdr = headers.get("Date") if headers else None
        if data_hdr:
            try:
                srv = email.utils.parsedate_to_datetime(data_hdr).timestamp()
                # Date tem resolucao de 1 s; compara com o meio da requisicao.
                desvio = int(((t0 + t1) / 2 - srv) * 1000)
            except Exception:
                desvio = None
        try:
            d = json.loads(corpo or b"null")
        except Exception:
            return RespostaRelay(False, status, f"HTTP_{status}" if status != 200 else "NAO_JSON",
                                 desvio_relogio_ms=desvio, latencia_ms=lat)
        if status != 200:
            err = d.get("error") if isinstance(d, dict) else None
            return RespostaRelay(False, status, f"HTTP_{status}", desvio_relogio_ms=desvio,
                                 latencia_ms=lat, erro_servidor=str(err) if err else None)
        ok, motivo = validar_corpo(d)
        return RespostaRelay(
            ok, status, motivo,
            eventos=d.get("events") if ok else [],
            next_cursor=d.get("next_cursor") if isinstance(d, dict) else None,
            relay_version=d.get("relay_version") if isinstance(d, dict) else None,
            mode=d.get("mode") if isinstance(d, dict) else None,
            desvio_relogio_ms=desvio, latencia_ms=lat,
        )
