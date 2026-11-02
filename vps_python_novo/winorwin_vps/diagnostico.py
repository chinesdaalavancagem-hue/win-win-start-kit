"""Diagnostico detalhado (somente leitura). Nao envia ordens, nao mostra a chave."""
from __future__ import annotations

import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable

from .config import Config, impressao_chave
from .relay import RelayClient, RespostaRelay
from .validacao import formar_pares, normalizar


@dataclass
class Relatorio:
    linhas: list[str] = field(default_factory=list)
    falhas: list[str] = field(default_factory=list)
    par_ok: bool = False
    mt5_ok: bool = False

    def info(self, t: str) -> None:
        self.linhas.append("  " + t)

    def falha(self, codigo: str, t: str) -> None:
        self.falhas.append(codigo)
        self.linhas.append(f"  [FALHA {codigo}] {t}")

    @property
    def aprovado(self) -> bool:
        return self.par_ok and self.mt5_ok and not self.falhas


def analisar_relay(r: RespostaRelay, cfg: Config, agora_ms: int, rel: Relatorio) -> bool:
    """Explica a resposta do relay. Retorna True se ha par recente valido."""
    rel.info(f"HTTP: {r.http}  motivo: {r.motivo}  latencia: {r.latencia_ms} ms")
    if r.http is None:
        rel.falha("SEM_CONEXAO", "sem resposta HTTPS (internet, DNS, firewall ou URL)")
        return False
    if r.http == 401:
        rel.falha("CHAVE_RECUSADA_401", "chave VPS invalida, revogada, expirada ou de usuario nao aprovado. "
                  "Gere nova chave VPS na plataforma e atualize WOW_VPS_TOKEN.")
        return False
    if r.http != 200:
        rel.falha(f"HTTP_{r.http}", f"servidor respondeu {r.http} erro={r.erro_servidor}")
        return False
    if r.desvio_relogio_ms is None:
        rel.falha("SEM_HEADER_DATE", "servidor nao enviou Date; relogio nao verificado")
    else:
        rel.info(f"Relogio: VPS - servidor = {r.desvio_relogio_ms} ms (limite {cfg.clock_max_drift_ms})")
        if abs(r.desvio_relogio_ms) > cfg.clock_max_drift_ms:
            rel.falha("RELOGIO_DESSINCRONIZADO", "sincronize a hora do Windows (w32tm /resync)")
    if not r.ok:
        rel.falha(r.motivo, f"formato inesperado: relay_version={r.relay_version} mode={r.mode}")
        return False
    rel.info(f"Formato OK: relay_version={r.relay_version} mode={r.mode} next_cursor={r.next_cursor}")
    ev = r.eventos
    rel.info(f"Eventos recebidos (ultimos 120 s): {len(ev)}")
    if not ev:
        rel.falha("ZERO_EVENTOS", "a chave funciona, mas nao ha envios da extensao nos ultimos 120 s "
                  "para ESTE usuario. Verifique se a extensao esta enviando (aba visivel, modo site) "
                  "e se a chave da VPS foi gerada na MESMA conta Win or Win da extensao.")
        return False
    ids = [e.get("id") for e in ev if isinstance(e, dict)]
    rel.info(f"ids: {min(ids, default=None)} .. {max(ids, default=None)}  ordem crescente: {ids == sorted(ids)}")
    motivos = Counter()
    validos = []
    for e in ev:
        n, m = normalizar(e)
        motivos[m] += 1
        if n:
            validos.append(n)
    rel.info("Validacao por evento: " + ", ".join(f"{k}={v}" for k, v in motivos.items()))
    kinds = Counter(v.kind for v in validos)
    rel.info(f"Tipos validos: card={kinds.get('card', 0)} position={kinds.get('position', 0)}")
    contas = Counter((v.conta[-4:], v.simbolo, v.bank_id[-6:], v.session_id[-6:]) for v in validos)
    for (c, s, b, ss), q in contas.items():
        rel.info(f"Origem conta=..{c} ativo={s} banca=..{b} sessao=..{ss}: {q} eventos")
    if len({k[0] for k in contas}) > 1:
        rel.info("Atencao: mais de uma conta TopstepX nos eventos recentes")
    for v in validos:
        if v.simbolo not in cfg.simbolos:
            rel.falha("SIMBOLO_NAO_MAPEADO", f"{v.simbolo} sem mapa MT5 (MAPA_SIMBOLOS)")
            break
    pares = formar_pares(validos)
    pm = Counter(p.motivo for p in pares)
    rel.info("Pares card->position: " + (", ".join(f"{k}={v}" for k, v in pm.items()) or "nenhuma position"))
    recentes = 0
    ultimo = None
    for p in pares:
        if p.card is None:
            continue
        ip = agora_ms - p.posicao.observed_at_ms
        ic = agora_ms - p.card.observed_at_ms
        ultimo = (p, ip, ic)
        if 0 <= ip <= cfg.position_max_age_ms and 0 <= ic <= cfg.card_max_age_ms:
            recentes += 1
    if ultimo:
        p, ip, ic = ultimo
        rel.info(f"Ultimo par: card id {p.card.id}/seq {p.card.client_seq} lote {p.card.card_lot} "
                 f"planejado {p.card.planned_contracts} -> position id {p.posicao.id}/seq "
                 f"{p.posicao.client_seq} net {p.posicao.net_contracts}; idades {ip} ms / {ic} ms")
        if ip < 0 or ic < 0:
            rel.falha("IDADE_NEGATIVA", "evento 'no futuro': relogio do PC local ou da VPS adiantado")
    if recentes == 0:
        if not pares:
            rel.falha("SEM_POSITION", "chegam cards mas nenhuma position")
        elif not ultimo:
            rel.falha("SEM_PAR_VALIDO", "positions sem card confirmado anterior da mesma sessao/banca/conta/ativo")
        else:
            rel.falha("PAR_ANTIGO", f"pares existem, mas fora da idade (position<= {cfg.position_max_age_ms} ms, "
                      f"card<= {cfg.card_max_age_ms} ms)")
        return False
    rel.info(f"Pares recentes validos: {recentes}")
    return True


def diagnosticar(cfg: Config, relay: RelayClient, mt5, agora_ms: Callable[[], int],
                 espera_s: int = 40, dormir: Callable[[float], None] = time.sleep) -> Relatorio:
    rel = Relatorio()
    rel.linhas.append("== Chave VPS ==")
    if not cfg.token.startswith("wowvps_"):
        rel.falha("CHAVE_FORMATO", "WOW_VPS_TOKEN ausente ou sem prefixo wowvps_")
        return rel
    rel.info(f"impressao da chave (fim do SHA-256): {impressao_chave(cfg.token)}")
    rel.linhas.append("== Relay ==")
    rel.info(f"URL: {relay.url}?after=0")
    fim = time.time() + espera_s
    tentativa = 0
    while True:
        tentativa += 1
        tmp = Relatorio()
        r = relay.buscar(0)
        ok = analisar_relay(r, cfg, agora_ms(), tmp)
        if ok or r.http in (None, 401) or time.time() >= fim:
            rel.info(f"tentativa {tentativa}")
            rel.linhas += tmp.linhas
            rel.falhas += tmp.falhas
            rel.par_ok = ok
            break
        dormir(2)
    rel.linhas.append("== MT5 ==")
    if mt5 is None:
        rel.falha("MT5_NAO_VERIFICADO", "adaptador MT5 nao fornecido")
        return rel
    ok, m = mt5.conectar()
    if not ok:
        rel.falha("MT5_CONEXAO", m)
        return rel
    ok, m, info = mt5.validar_demo()
    for k, v in info.items():
        rel.info(f"{k}: {v}")
    if not ok:
        rel.falha(m, "MT5 bloqueado para o robo")
        return rel
    for top, mt in cfg.simbolos.items():
        si = mt5.info_simbolo(mt)
        if si is None:
            rel.falha("SIMBOLO_MT5_INDISPONIVEL", f"{top} -> {mt} nao existe no terminal")
        else:
            rel.info(f"{top} -> {mt}: min {si['volume_min']} passo {si['volume_step']} max {si['volume_max']}")
    pos = mt5.posicoes()
    if pos is None:
        rel.falha("MT5_POSICOES_DESCONHECIDAS", "positions_get falhou")
        return rel
    meus = [p for p in pos if p["magic"] == cfg.magic]
    rel.info(f"posicoes abertas: {len(pos)} (deste robo: {len(meus)})")
    rel.mt5_ok = True
    return rel
