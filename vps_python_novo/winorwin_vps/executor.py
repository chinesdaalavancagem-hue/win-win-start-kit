"""Laco principal: le o relay, forma pares e aplica o motor."""
from __future__ import annotations

import logging
import time
from typing import Callable

from .config import Config
from .estado import Estado
from .motor import DEMO, LEITURA, Motor
from .relay import RelayClient
from .validacao import formar_pares, normalizar

log = logging.getLogger("winorwin")


def reconciliar(estado: Estado, mt5, cfg: Config) -> tuple[bool, str]:
    """Compara posicoes do robo no MT5 com o estado salvo."""
    pos = mt5.posicoes()
    if pos is None:
        return False, "MT5_POSICOES_DESCONHECIDAS"
    simbolos = set(cfg.simbolos.values())
    meus: dict[str, float] = {}
    for p in pos:
        if p["magic"] == cfg.magic:
            meus[p["symbol"]] = round(meus.get(p["symbol"], 0) + p["volume"], 8)
    salvo: dict[str, float] = {}
    for o in estado.origens_ativas().values():
        salvo[o["mt5"]] = round(salvo.get(o["mt5"], 0) + o["volume_mt5"], 8)
    if meus != salvo:
        return False, f"DIVERGENCIA estado={salvo} mt5={meus}"
    alheias = [p for p in pos if p["magic"] != cfg.magic and p["symbol"] in simbolos]
    if alheias:
        return False, f"POSICOES_MANUAIS_NOS_SIMBOLOS {len(alheias)}"
    for k, v in estado.origens_ativas().items():
        if sum(1 for x in estado.origens_ativas().values() if x["mt5"] == v["mt5"]) > 1:
            return False, f"CARDINALIDADE_INVALIDA {v['mt5']}"
    return True, "OK"


class Executor:
    def __init__(self, cfg: Config, relay: RelayClient, mt5, estado: Estado,
                 agora_ms: Callable[[], int] = lambda: int(time.time() * 1000)):
        self.cfg, self.relay, self.mt5, self.estado = cfg, relay, mt5, estado
        self.agora = agora_ms
        self.motor = Motor(cfg, estado, mt5, agora_ms)
        self.cards: dict = {}  # ultimo card confirmado por chave de par
        self.falhas_seguidas = 0

    def habilitar_demo(self) -> None:
        self.motor.modo = DEMO

    def ciclo(self) -> int:
        """Um ciclo de leitura. Retorna quantos eventos novos foram vistos."""
        cursor = int(self.estado.dados.get("cursor") or 0)
        novos = 0
        for _ in range(10):  # pagina backlog ate alcancar o mais novo
            r = self.relay.buscar(cursor)
            if not r.ok:
                self.falhas_seguidas += 1
                log.warning("RELAY_FALHOU %s http=%s", r.motivo, r.http)
                if r.http == 401:
                    self.motor.modo = LEITURA
                return novos
            if r.desvio_relogio_ms is not None and abs(r.desvio_relogio_ms) > self.cfg.clock_max_drift_ms:
                self.motor.modo = LEITURA
                log.error("RELOGIO_DESSINCRONIZADO %s ms: modo leitura", r.desvio_relogio_ms)
                return novos
            self.falhas_seguidas = 0
            eventos = []
            for e in r.eventos:
                n, _m = normalizar(e)
                if n:
                    eventos.append(n)
            eventos.sort(key=lambda x: x.id)
            for ev in eventos:
                if ev.kind == "card":
                    self.cards[ev.chave_par] = ev
            for par in formar_pares(list(self.cards.values()) + [e for e in eventos if e.kind == "position"]):
                novos += 1
                self.motor.processar(par.posicao, par.card)
            if r.next_cursor and int(r.next_cursor) > cursor:
                cursor = int(r.next_cursor)
                self.estado.dados["cursor"] = cursor
                self.estado.salvar()
            if len(r.eventos) < 30:
                break
        self.motor.alertar_origens_sem_leitura()
        return novos

    def rodar(self, parar: Callable[[], bool] = lambda: False) -> None:
        while not parar():
            t0 = time.time()
            try:
                self.ciclo()
            except Exception:
                log.exception("ERRO_NO_CICLO")
                ok, m = self.mt5.reconectar()
                log.warning("RECONEXAO_MT5 %s %s", ok, m)
            time.sleep(max(0.0, self.cfg.poll_ms / 1000 - (time.time() - t0)))
