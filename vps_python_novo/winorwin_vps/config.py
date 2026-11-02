"""Configuracao lida de variaveis de ambiente e do arquivo .env local.

Nenhum login, senha ou chave fica escrito no codigo.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass, field
from pathlib import Path

PASTA = Path(__file__).resolve().parent.parent


def carregar_env(caminho: Path | None = None) -> None:
    """Le KEY=VALOR do .env sem sobrescrever variaveis ja definidas."""
    caminho = caminho or (PASTA / ".env")
    if not caminho.exists():
        return
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        k, v = linha.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"'))


def _mapa(texto: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for par in texto.split(","):
        if ":" in par:
            a, b = par.split(":", 1)
            if a.strip() and b.strip():
                out[a.strip().upper()] = b.strip()
    return out


def impressao_chave(token: str) -> str:
    """Identificador seguro da chave: so o fim do SHA-256, nunca a chave."""
    return hashlib.sha256(token.encode()).hexdigest()[-8:] if token else "sem-chave"


@dataclass
class Config:
    relay_url: str = "https://win-or-win.lovable.app/api/public/topstep-vps/observacoes/"
    token: str = field(default="", repr=False)
    mt5_terminal: str = ""
    simbolos: dict[str, str] = field(default_factory=lambda: {"MGC": "GOLD", "MNQ": "US100Cash"})
    magic: int = 26110225
    card_max_age_ms: int = 20000
    position_max_age_ms: int = 8000
    clock_max_drift_ms: int = 5000
    poll_ms: int = 700
    desvio_max_pontos: int = 30
    estado_arquivo: str = str(PASTA / "dados" / "estado.json")
    log_arquivo: str = str(PASTA / "dados" / "executor.log")

    @classmethod
    def do_ambiente(cls) -> "Config":
        carregar_env()
        c = cls()
        e = os.environ
        c.relay_url = e.get("WOW_RELAY_URL", c.relay_url)
        c.token = e.get("WOW_VPS_TOKEN", "")
        c.mt5_terminal = e.get("MT5_TERMINAL", "")
        if e.get("MAPA_SIMBOLOS"):
            c.simbolos = _mapa(e["MAPA_SIMBOLOS"])
        c.magic = int(e.get("MT5_MAGIC", c.magic))
        c.card_max_age_ms = int(e.get("CARD_MAX_AGE_MS", c.card_max_age_ms))
        c.position_max_age_ms = int(e.get("POSITION_MAX_AGE_MS", c.position_max_age_ms))
        c.clock_max_drift_ms = int(e.get("CLOCK_MAX_DRIFT_MS", c.clock_max_drift_ms))
        c.poll_ms = max(300, int(e.get("POLL_MS", c.poll_ms)))
        c.desvio_max_pontos = int(e.get("MT5_DEVIATION", c.desvio_max_pontos))
        return c
