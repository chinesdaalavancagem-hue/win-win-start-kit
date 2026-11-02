"""Inicia o executor Win or Win na VPS.

Sempre comeca em SOMENTE LEITURA. So habilita DEMO apos:
1) diagnostico aprovado (par recente, relogio, MT5 DEMO, Algo Trading);
2) reconciliacao segura entre estado salvo e MT5;
3) digitar exatamente SIM-DEMO.
"""
from __future__ import annotations

import getpass
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from winorwin_vps.config import Config, impressao_chave  # noqa: E402
from winorwin_vps.diagnostico import diagnosticar  # noqa: E402
from winorwin_vps.estado import Estado  # noqa: E402
from winorwin_vps.executor import Executor, reconciliar  # noqa: E402
from winorwin_vps.mt5_adapter import MT5Real  # noqa: E402
from winorwin_vps.relay import RelayClient  # noqa: E402


def main() -> int:
    cfg = Config.do_ambiente()
    Path(cfg.log_arquivo).parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s",
                        handlers=[logging.StreamHandler(), logging.FileHandler(cfg.log_arquivo, encoding="utf-8")])
    if not cfg.token:
        cfg.token = getpass.getpass("Cole a chave VPS (nao aparece na tela): ").strip()
    logging.info("Chave VPS impressao=%s (a chave nunca e registrada)", impressao_chave(cfg.token))
    relay = RelayClient(cfg.relay_url, cfg.token)
    mt5 = MT5Real(cfg.mt5_terminal, cfg.magic, cfg.desvio_max_pontos)
    agora = lambda: int(time.time() * 1000)  # noqa: E731

    rel = diagnosticar(cfg, relay, mt5, agora)
    print("\n".join(rel.linhas))
    estado = Estado(cfg.estado_arquivo).carregar()
    ex = Executor(cfg, relay, mt5, estado, agora)

    if not rel.aprovado:
        print("\nDIAGNOSTICO REPROVADO:", ", ".join(rel.falhas))
        print("Robo segue em SOMENTE LEITURA (nenhuma ordem sera enviada).")
    else:
        ok, motivo = reconciliar(estado, mt5, cfg)
        print("Reconciliacao:", motivo)
        if ok and input("\nDigite SIM-DEMO para habilitar ordens na conta DEMO: ").strip() == "SIM-DEMO":
            ex.habilitar_demo()
            print(">>> DEMO HABILITADO")
        else:
            print("Robo segue em SOMENTE LEITURA.")
    print("Ctrl+C para sair.")
    try:
        ex.rodar()
    except KeyboardInterrupt:
        estado.salvar()
        print("Encerrado. Estado salvo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
