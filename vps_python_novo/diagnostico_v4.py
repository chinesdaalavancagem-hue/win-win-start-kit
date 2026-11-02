"""Diagnostico v4 (SOMENTE LEITURA). Nao envia ordens. Nao exibe a chave.

Mostra: HTTPS/status, 401, quantidade de eventos, ids/ordem, cursor,
formato, relogio (header Date), contas/ativos/bancas, pares e idades,
e o motivo preciso de cada reprovacao. Tambem confere o MT5 (DEMO,
Algo Trading, simbolos). Uso: python diagnostico_v4.py [--sem-mt5]
"""
from __future__ import annotations

import getpass
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from winorwin_vps.config import Config  # noqa: E402
from winorwin_vps.diagnostico import diagnosticar  # noqa: E402
from winorwin_vps.mt5_adapter import MT5Real  # noqa: E402
from winorwin_vps.relay import RelayClient  # noqa: E402


def main() -> int:
    cfg = Config.do_ambiente()
    if not cfg.token:
        cfg.token = getpass.getpass("Cole a chave VPS (nao aparece na tela): ").strip()
    mt5 = None if "--sem-mt5" in sys.argv else MT5Real(cfg.mt5_terminal, cfg.magic)
    print("Diagnostico Win or Win v4 -", time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()))
    rel = diagnosticar(cfg, RelayClient(cfg.relay_url, cfg.token), mt5, lambda: int(time.time() * 1000))
    print("\n".join(rel.linhas))
    print("\nPar v4 recente e ordenado:", "CONFIRMADO" if rel.par_ok else "NAO CONFIRMADO")
    print("MT5 DEMO pronto:", "SIM" if rel.mt5_ok else "NAO")
    print("RESULTADO:", "APROVADO" if rel.aprovado else "REPROVADO - " + ", ".join(rel.falhas))
    return 0 if rel.aprovado else 1


if __name__ == "__main__":
    raise SystemExit(main())
