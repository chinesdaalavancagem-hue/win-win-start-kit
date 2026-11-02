"""Motor de decisao: TopstepX (posicao liquida) -> hedge MT5.

Regras principais:
- TopstepX BUY => MT5 SELL; TopstepX SELL => MT5 BUY.
- Entrada (net 0 -> != 0) abre o lote INTEGRAL do card, mesmo com 1 contrato.
- Aumentos nao multiplicam o lote. Parciais reduzem proporcionalmente ao
  pico de contratos da operacao, arredondando para BAIXO no volume_step.
- net 0 da MESMA conta + ativo fecha o hedge, mesmo apos troca de banca.
- Origem = conta TopstepX + ativo; banca nao faz parte da origem.
- Transicoes so por mudanca real de net; heartbeats e replays nao agem.
- Fechamento manual no MT5 nao e revertido: nada reabre ate net voltar a 0.
"""
from __future__ import annotations

import logging
from decimal import ROUND_FLOOR, Decimal
from typing import Callable

from .estado import Estado
from .validacao import Evento, card_valido

log = logging.getLogger("winorwin")

LEITURA = "SOMENTE_LEITURA"
DEMO = "DEMO_HABILITADO"
TOLERANCIA_FUTURO_MS = 2000
ESQUECER_NET_APOS_MS = 30000  # net salvo mais antigo que isso vira "desconhecido"


def lado_hedge(net: int) -> str:
    return "SELL" if net > 0 else "BUY"


def quantizar_baixo(v: float, step: float) -> float:
    s = Decimal(str(step))
    q = (Decimal(str(v)) / s).to_integral_value(rounding=ROUND_FLOOR) * s
    return float(q)


def volume_alvo(lot: float, pico: int, net_abs: int, vmin: float, step: float) -> float:
    """Volume desejado para |net| contratos; nunca acima do lote do card."""
    if net_abs <= 0:
        return 0.0
    bruto = min(lot, lot * net_abs / max(pico, 1))
    q = quantizar_baixo(bruto, step)
    return max(q, vmin) if q < vmin else q


class Motor:
    def __init__(self, cfg, estado: Estado, mt5, relogio_ms: Callable[[], int]):
        self.cfg = cfg
        self.estado = estado
        self.mt5 = mt5
        self.agora = relogio_ms
        self.modo = LEITURA
        self.historico: list[str] = []  # decisoes legiveis (tambem usadas em testes)

    def _reg(self, codigo: str, **kv) -> None:
        texto = codigo + (" " + " ".join(f"{k}={v}" for k, v in kv.items()) if kv else "")
        self.historico.append(texto)
        log.info(texto)

    # ------------------------------------------------------------------
    def processar(self, pos: Evento, card: Evento | None) -> None:
        """Processa uma position (ja pareada ou nao) e grava estado."""
        if self.estado.ja_processado(pos.event_id):
            return
        self.estado.marcar(pos.event_id)
        try:
            self._processar(pos, card)
        finally:
            self.estado.salvar()

    def _processar(self, pos: Evento, card: Evento | None) -> None:
        agora = self.agora()
        idade = agora - pos.observed_at_ms
        if idade > self.cfg.position_max_age_ms:
            return self._reg("IGNORADO_POSITION_ANTIGA", idade_ms=idade)
        if idade < -TOLERANCIA_FUTURO_MS:
            return self._reg("IGNORADO_POSITION_NO_FUTURO", idade_ms=idade)
        sym_mt5 = self.cfg.simbolos.get(pos.simbolo)
        if not sym_mt5:
            return self._reg("IGNORADO_SIMBOLO_NAO_MAPEADO", simbolo=pos.simbolo)

        o = self.estado.origem(pos.conta, pos.simbolo) or {
            "conta": pos.conta, "simbolo": pos.simbolo, "mt5": sym_mt5,
            "status": "DESCONHECIDO", "last_net": None, "last_obs_ms": 0,
            "lot": 0.0, "pico": 0, "volume_mt5": 0.0, "lado_mt5": None,
        }
        if pos.observed_at_ms <= o["last_obs_ms"]:
            return self._reg("IGNORADO_REPLAY", conta=pos.conta, simbolo=pos.simbolo)

        prev = o["last_net"]
        if prev is not None and agora - o["last_obs_ms"] > ESQUECER_NET_APOS_MS and o["volume_mt5"] == 0:
            prev = None  # reinicio/pausa longa: nao abre por estado velho
        net = pos.net_contracts
        assert net is not None
        o["last_obs_ms"] = pos.observed_at_ms
        o["last_net"] = net
        o["bank_id"] = pos.bank_id

        posicoes = self.mt5.posicoes(sym_mt5)
        if posicoes is None:
            self.estado.gravar_origem(pos.conta, pos.simbolo, o)
            return self._reg("MT5_ESTADO_DESCONHECIDO_SEM_ACAO", simbolo=sym_mt5)
        minhas = [p for p in posicoes if p["magic"] == self.cfg.magic]
        real = round(sum(p["volume"] for p in minhas), 8)

        # Fechamento manual detectado: nunca reabrir nesta operacao.
        if o["volume_mt5"] > 0 and real == 0 and net != 0:
            o.update(volume_mt5=0.0, status="FECHADO_MANUAL")
            self.estado.gravar_origem(pos.conta, pos.simbolo, o)
            return self._reg("FECHAMENTO_MANUAL_MT5_DETECTADO_SEM_REENTRADA", conta=pos.conta)
        o["volume_mt5"] = real if o["volume_mt5"] > 0 or real == 0 else o["volume_mt5"]

        if net == 0:
            if o["volume_mt5"] > 0:
                self._fechar_tudo(o, minhas, "ZERO_MESMA_CONTA_ORIGEM")
            o.update(status="FLAT", pico=0)
        elif prev is None:
            if o["volume_mt5"] == 0:
                o["status"] = "AGUARDANDO_ZERO"
                self._reg("POSICAO_PREEXISTENTE_SEM_ENTRADA", conta=pos.conta, net=net)
        elif prev == net:
            # heartbeat: so corrige excesso (ex.: fechamento parcial que falhou)
            if o["status"] == "ABERTO":
                self._ajustar(o, minhas, abs(net))
        elif o["status"] in ("FECHADO_MANUAL", "AGUARDANDO_ZERO"):
            self._reg("SEM_ACAO_AGUARDANDO_ZERO", status=o["status"], net=net)
        elif prev == 0:
            self._entrar(o, minhas, posicoes, pos, card, net)
        elif (prev > 0) != (net > 0):
            self._reg("INVERSAO_DETECTADA", de=prev, para=net)
            if o["volume_mt5"] > 0 and not self._fechar_tudo(o, minhas, "INVERSAO_FECHA_ANTES"):
                o["status"] = "AGUARDANDO_ZERO"
            else:
                o.update(status="FLAT", pico=0)
                novas = self.mt5.posicoes(sym_mt5)
                if novas is None or [p for p in novas if p["magic"] == self.cfg.magic]:
                    o["status"] = "AGUARDANDO_ZERO"
                    self._reg("INVERSAO_SEM_CONFIRMACAO_FLAT_NAO_ABRE")
                else:
                    self._entrar(o, [], novas, pos, card, net)
        elif o["status"] == "ABERTO":
            if abs(net) > o["pico"]:
                o["pico"] = abs(net)
                self._reg("AUMENTO_SEM_MULTIPLICAR", net=net, volume=o["volume_mt5"])
            else:
                self._ajustar(o, minhas, abs(net))
        self.estado.gravar_origem(pos.conta, pos.simbolo, o)

    # ------------------------------------------------------------------
    def _entrar(self, o, minhas, todas, pos: Evento, card: Evento | None, net: int) -> None:
        if card is None:
            return self._reg("ENTRADA_BLOQUEADA_SEM_PAR_CARD")
        ok, motivo = card_valido(card)
        if not ok:
            return self._reg("ENTRADA_BLOQUEADA_" + motivo)
        idade_card = self.agora() - card.observed_at_ms
        if idade_card > self.cfg.card_max_age_ms or idade_card < -TOLERANCIA_FUTURO_MS:
            return self._reg("ENTRADA_BLOQUEADA_CARD_ANTIGO", idade_ms=idade_card)
        if todas:
            o["status"] = "AGUARDANDO_ZERO"
            return self._reg("ENTRADA_BLOQUEADA_POSICAO_EXISTENTE_NO_MT5", simbolo=o["mt5"])
        for k, v in self.estado.origens_ativas().items():
            if v.get("mt5") == o["mt5"] and k != f"{pos.conta}|{pos.simbolo}":
                o["status"] = "AGUARDANDO_ZERO"
                return self._reg("ENTRADA_BLOQUEADA_OUTRA_ORIGEM_ATIVA", origem=k)
        info = self.mt5.info_simbolo(o["mt5"])
        if info is None:
            return self._reg("ENTRADA_BLOQUEADA_SIMBOLO_MT5_INDISPONIVEL", simbolo=o["mt5"])
        vol = quantizar_baixo(card.card_lot, info["volume_step"])
        if vol < info["volume_min"] or vol > info["volume_max"]:
            return self._reg("ENTRADA_BLOQUEADA_LOTE_FORA_LIMITES", lote=vol)
        lado = lado_hedge(net)
        if self.modo != DEMO:
            o["status"] = "AGUARDANDO_ZERO"
            return self._reg("SIMULADO_ENTRADA", lado=lado, volume=vol, simbolo=o["mt5"])
        ok, rc, msg = self.mt5.abrir(o["mt5"], lado, vol, f"wow {pos.simbolo}")
        if not ok:
            o["status"] = "AGUARDANDO_ZERO"  # sem nova tentativa automatica
            return self._reg("ENTRADA_FALHOU", retcode=rc, msg=msg)
        novas = self.mt5.posicoes(o["mt5"]) or []
        real = round(sum(p["volume"] for p in novas if p["magic"] == self.cfg.magic), 8)
        o.update(status="ABERTO", lot=vol, pico=abs(net), volume_mt5=real, lado_mt5=lado,
                 bank_entrada=pos.bank_id)
        self._reg("ENTRADA_OK", lado=lado, volume=real, simbolo=o["mt5"], net=net)

    def _ajustar(self, o, minhas, net_abs: int) -> None:
        info = self.mt5.info_simbolo(o["mt5"])
        if info is None:
            return self._reg("PARCIAL_SEM_INFO_SIMBOLO")
        alvo = volume_alvo(o["lot"], o["pico"], net_abs, info["volume_min"], info["volume_step"])
        reduzir = quantizar_baixo(o["volume_mt5"] - alvo, info["volume_step"])
        if reduzir <= 0:
            return
        if self.modo != DEMO:
            return self._reg("SIMULADO_PARCIAL", reduzir=reduzir, alvo=alvo)
        restante = reduzir
        for p in sorted(minhas, key=lambda x: x["volume"]):
            if restante <= 0:
                break
            v = min(p["volume"], restante)
            ok, rc, msg = self.mt5.fechar(p, v)
            if not ok:
                self._reg("PARCIAL_FALHOU", retcode=rc, msg=msg)
                break
            restante = round(restante - v, 8)
        novas = self.mt5.posicoes(o["mt5"]) or []
        o["volume_mt5"] = round(sum(p["volume"] for p in novas if p["magic"] == self.cfg.magic), 8)
        self._reg("PARCIAL_OK" if restante <= 0 else "PARCIAL_INCOMPLETA",
                  alvo=alvo, volume=o["volume_mt5"])

    def _fechar_tudo(self, o, minhas, motivo: str) -> bool:
        if self.modo != DEMO:
            self._reg("SIMULADO_FECHAR_TUDO", motivo=motivo)
            return False
        tudo_ok = True
        for p in minhas:
            ok, rc, msg = self.mt5.fechar(p, p["volume"])
            if not ok:
                tudo_ok = False
                self._reg("FECHAMENTO_FALHOU", retcode=rc, msg=msg, ticket=p["ticket"])
        novas = self.mt5.posicoes(o["mt5"])
        if novas is None:
            self._reg("FECHAMENTO_SEM_CONFIRMACAO_MT5")
            return False
        o["volume_mt5"] = round(sum(p["volume"] for p in novas if p["magic"] == self.cfg.magic), 8)
        if o["volume_mt5"] == 0 and tudo_ok:
            self._reg("FECHADO_" + motivo, simbolo=o["mt5"])
            return True
        return False

    # ------------------------------------------------------------------
    def alertar_origens_sem_leitura(self, limite_ms: int = 15000) -> list[str]:
        """Hedge aberto cuja conta de origem parou de ser lida (ex.: troca real de conta)."""
        out = []
        for k, v in self.estado.origens_ativas().items():
            if self.agora() - v.get("last_obs_ms", 0) > limite_ms:
                out.append(k)
                self._reg("ALERTA_CONTA_ORIGEM_NAO_MONITORADA", origem=k, volume=v["volume_mt5"])
        return out
