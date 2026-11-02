"""Validacao de eventos do relay v4 e formacao de pares card -> position.

Regra do par: card confirmado + position com a MESMA sessao, banca, conta e
ativo, e client_seq do card MENOR que o da position.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

CAMPOS_CHAVE = ("session_id", "bank_id", "source_account_id", "symbol")


def _int(v: Any) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, str) and v.strip().lstrip("-").isdigit():
        return int(v.strip())
    return None


def _num(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f == f and f not in (float("inf"), float("-inf")) else None


@dataclass(frozen=True)
class Evento:
    id: int
    event_id: str
    kind: str
    client_seq: int
    observed_at_ms: int
    session_id: str
    bank_id: str
    conta: str
    simbolo: str
    card_confirmed: bool
    card_lot: float | None
    planned_contracts: int | None
    net_contracts: int | None

    @property
    def chave_par(self) -> tuple[str, str, str, str]:
        return (self.session_id, self.bank_id, self.conta, self.simbolo)

    @property
    def origem(self) -> tuple[str, str]:
        """Origem real da operacao: conta TopstepX + ativo (sem banca)."""
        return (self.conta, self.simbolo)


def normalizar(e: Any) -> tuple[Evento | None, str]:
    """Retorna (evento, 'OK') ou (None, motivo_preciso)."""
    if not isinstance(e, dict):
        return None, "EVENTO_NAO_OBJETO"
    p = e.get("payload")
    if not isinstance(p, dict):
        return None, "SEM_PAYLOAD"
    if p.get("relay_version") != 4:
        return None, "RELAY_VERSION_DIFERENTE_DE_4"
    for c in CAMPOS_CHAVE:
        if not isinstance(p.get(c), str) or not p.get(c).strip():
            return None, f"FALTA_{c.upper()}"
    kind = e.get("kind")
    if kind not in ("card", "position"):
        return None, "KIND_IGNORADO"
    rid, seq = _int(e.get("id")), _int(e.get("client_seq"))
    obs = _int(p.get("observed_at_ms", e.get("observed_at_ms")))
    if rid is None or seq is None or obs is None:
        return None, "ID_SEQ_OU_HORARIO_INVALIDO"
    if e.get("session_id") is not None and e.get("session_id") != p.get("session_id"):
        return None, "SESSAO_DIVERGENTE_PAYLOAD"
    net = _int(p.get("net_contracts"))
    if kind == "position" and net is None:
        return None, "NET_INVALIDO"
    if net is not None and abs(net) > 1000:
        return None, "NET_FORA_DO_LIMITE"
    lot = _num(p.get("card_lot"))
    planned = _int(p.get("planned_contracts"))
    return Evento(
        id=rid, event_id=str(e.get("event_id") or rid), kind=kind, client_seq=seq,
        observed_at_ms=obs, session_id=p["session_id"], bank_id=p["bank_id"],
        conta=p["source_account_id"], simbolo=p["symbol"].strip().upper(),
        card_confirmed=p.get("card_confirmed") is True,
        card_lot=lot, planned_contracts=planned, net_contracts=net,
    ), "OK"


def card_valido(c: Evento) -> tuple[bool, str]:
    if not c.card_confirmed:
        return False, "CARD_NAO_CONFIRMADO"
    if c.card_lot is None or c.card_lot <= 0 or c.card_lot > 100:
        return False, "CARD_LOT_INVALIDO"
    if c.planned_contracts is None or c.planned_contracts <= 0:
        return False, "PLANNED_CONTRACTS_INVALIDO"
    return True, "OK"


@dataclass
class Par:
    card: Evento | None
    posicao: Evento
    motivo: str  # OK ou motivo do card ausente


def formar_pares(eventos: list[Evento]) -> list[Par]:
    """Para cada position, associa o ultimo card confirmado anterior da mesma chave."""
    cards: dict[tuple, Evento] = {}
    pares: list[Par] = []
    for ev in sorted(eventos, key=lambda x: x.id):
        if ev.kind == "card":
            ok, _ = card_valido(ev)
            if ok:
                cards[ev.chave_par] = ev
            continue
        c = cards.get(ev.chave_par)
        if c is None:
            pares.append(Par(None, ev, "SEM_CARD_ANTERIOR_MESMA_CHAVE"))
        elif c.client_seq >= ev.client_seq:
            pares.append(Par(None, ev, "SEQUENCIA_FORA_DE_ORDEM"))
        else:
            pares.append(Par(c, ev, "OK"))
    return pares
