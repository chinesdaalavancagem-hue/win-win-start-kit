"""Adaptador MetaTrader 5 (Windows). So opera em conta DEMO.

A conta e conferida a cada ordem; conta REAL ou concurso bloqueia sempre.
"""
from __future__ import annotations

from typing import Any

RET_DONE = 10009
RET_DONE_PARCIAL = 10010
RET_SUCESSO = (RET_DONE, RET_DONE_PARCIAL)
TRADE_MODE_DEMO = 0


class MT5Real:
    """Implementacao com a biblioteca oficial MetaTrader5."""

    def __init__(self, terminal: str, magic: int, desvio: int = 30):
        self.terminal = terminal
        self.magic = magic
        self.desvio = desvio
        self.mt5: Any = None

    # --- conexao ---
    def conectar(self) -> tuple[bool, str]:
        try:
            import MetaTrader5 as mt5  # type: ignore
        except ImportError:
            return False, "BIBLIOTECA_METATRADER5_NAO_INSTALADA"
        self.mt5 = mt5
        ok = mt5.initialize(path=self.terminal) if self.terminal else mt5.initialize()
        if not ok:
            return False, f"MT5_INITIALIZE_FALHOU {mt5.last_error()}"
        return True, "OK"

    def reconectar(self) -> tuple[bool, str]:
        try:
            if self.mt5:
                self.mt5.shutdown()
        except Exception:
            pass
        return self.conectar()

    def validar_demo(self) -> tuple[bool, str, dict]:
        m = self.mt5
        if m is None:
            return False, "MT5_NAO_CONECTADO", {}
        ti, ai = m.terminal_info(), m.account_info()
        if ti is None or ai is None:
            return False, "MT5_SEM_INFO_CONTA", {}
        info = {
            "servidor": ai.server, "corretora": ai.company,
            "trade_mode": ai.trade_mode, "conta_trade_allowed": bool(ai.trade_allowed),
            "conta_trade_expert": bool(ai.trade_expert),
            "terminal_trade_allowed": bool(ti.trade_allowed),
            "terminal_conectado": bool(ti.connected),
        }
        if ai.trade_mode != TRADE_MODE_DEMO:
            return False, "CONTA_NAO_DEMO_BLOQUEADA", info
        if not ti.connected:
            return False, "TERMINAL_DESCONECTADO", info
        if not ti.trade_allowed:
            return False, "ALGO_TRADING_DESLIGADO_NO_TERMINAL", info
        if not ai.trade_allowed or not ai.trade_expert:
            return False, "CONTA_NAO_PERMITE_ROBO", info
        return True, "OK", info

    def info_simbolo(self, simbolo: str) -> dict | None:
        m = self.mt5
        if m is None or not m.symbol_select(simbolo, True):
            return None
        s = m.symbol_info(simbolo)
        if s is None:
            return None
        return {"volume_min": s.volume_min, "volume_step": s.volume_step,
                "volume_max": s.volume_max, "filling_mode": s.filling_mode,
                "trade_mode": s.trade_mode}

    def posicoes(self, simbolo: str | None = None) -> list[dict] | None:
        m = self.mt5
        if m is None:
            return None
        r = m.positions_get(symbol=simbolo) if simbolo else m.positions_get()
        if r is None:
            return None
        return [{"ticket": p.ticket, "symbol": p.symbol, "volume": p.volume,
                 "magic": p.magic,
                 "type": "BUY" if p.type == m.POSITION_TYPE_BUY else "SELL"} for p in r]

    # --- ordens ---
    def _filling(self, simbolo: str) -> int:
        m = self.mt5
        s = m.symbol_info(simbolo)
        fm = getattr(s, "filling_mode", 0) or 0
        if fm & 1:
            return m.ORDER_FILLING_FOK
        if fm & 2:
            return m.ORDER_FILLING_IOC
        return m.ORDER_FILLING_RETURN

    def _enviar(self, req: dict) -> tuple[bool, int | None, str]:
        ok, motivo, _ = self.validar_demo()
        if not ok:  # rechecagem a cada ordem: REAL nunca passa
            return False, None, motivo
        m = self.mt5
        tick = m.symbol_info_tick(req["symbol"])
        if tick is None:
            return False, None, "SEM_COTACAO"
        req["price"] = tick.ask if req["type"] == m.ORDER_TYPE_BUY else tick.bid
        req.update(action=m.TRADE_ACTION_DEAL, deviation=self.desvio, magic=self.magic,
                   type_time=m.ORDER_TIME_GTC, type_filling=self._filling(req["symbol"]))
        r = m.order_send(req)
        if r is None:
            return False, None, f"ORDER_SEND_NONE {m.last_error()}"
        return r.retcode in RET_SUCESSO, r.retcode, str(getattr(r, "comment", ""))

    def abrir(self, simbolo: str, lado: str, volume: float, comentario: str) -> tuple[bool, int | None, str]:
        m = self.mt5
        tipo = m.ORDER_TYPE_BUY if lado == "BUY" else m.ORDER_TYPE_SELL
        return self._enviar({"symbol": simbolo, "volume": float(volume), "type": tipo,
                             "comment": comentario[:28]})

    def fechar(self, pos: dict, volume: float) -> tuple[bool, int | None, str]:
        m = self.mt5
        tipo = m.ORDER_TYPE_SELL if pos["type"] == "BUY" else m.ORDER_TYPE_BUY
        return self._enviar({"symbol": pos["symbol"], "volume": float(volume), "type": tipo,
                             "position": pos["ticket"], "comment": "wow-fechar"})
