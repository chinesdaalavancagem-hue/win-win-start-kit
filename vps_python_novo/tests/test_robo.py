"""Testes OFFLINE com MT5 e relay simulados. Rodar: python -m unittest discover -s tests"""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
import urllib.error
from email.utils import formatdate
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from winorwin_vps.config import Config, impressao_chave  # noqa: E402
from winorwin_vps.diagnostico import diagnosticar  # noqa: E402
from winorwin_vps.estado import Estado  # noqa: E402
from winorwin_vps.executor import Executor, reconciliar  # noqa: E402
from winorwin_vps.motor import DEMO, quantizar_baixo, volume_alvo  # noqa: E402
from winorwin_vps.relay import RelayClient, RespostaRelay  # noqa: E402

T0 = 1_800_000_000_000
TOKEN = "wowvps_" + "x" * 40


class Relogio:
    def __init__(self):
        self.t = T0

    def __call__(self):
        return self.t


class FakeMT5:
    def __init__(self, demo=True):
        self.demo = demo
        self.pos: list[dict] = []
        self.ordens: list[tuple] = []
        self.falhar_abrir = False
        self.falhar_fechar = False
        self.desconhecido = False
        self._t = 1

    def conectar(self):
        return True, "OK"

    def reconectar(self):
        return True, "OK"

    def validar_demo(self):
        if not self.demo:
            return False, "CONTA_NAO_DEMO_BLOQUEADA", {"trade_mode": 2}
        return True, "OK", {"trade_mode": 0}

    def info_simbolo(self, s):
        return {"volume_min": 0.01, "volume_step": 0.01, "volume_max": 50.0, "filling_mode": 1, "trade_mode": 4}

    def posicoes(self, s=None):
        if self.desconhecido:
            return None
        return [dict(p) for p in self.pos if s is None or p["symbol"] == s]

    def abrir(self, s, lado, v, c):
        ok, *_ = self.validar_demo()
        if not ok:
            return False, None, "CONTA_NAO_DEMO_BLOQUEADA"
        if self.falhar_abrir:
            return False, 10006, "rejeitada"
        self.ordens.append(("abrir", s, lado, v))
        self.pos.append({"ticket": self._t, "symbol": s, "type": lado, "volume": v, "magic": 26110225})
        self._t += 1
        return True, 10009, "ok"

    def fechar(self, p, v):
        if self.falhar_fechar:
            return False, 10004, "requote"
        self.ordens.append(("fechar", p["symbol"], v))
        for x in self.pos:
            if x["ticket"] == p["ticket"]:
                x["volume"] = round(x["volume"] - v, 8)
        self.pos = [x for x in self.pos if x["volume"] > 1e-9]
        return True, 10009, "ok"


class FakeRelay:
    def __init__(self):
        self.lote: list[dict] = []
        self.chamadas: list[int] = []
        self.url = "https://teste/"
        self.resposta: RespostaRelay | None = None

    def buscar(self, after=0, timeout=8.0):
        self.chamadas.append(after)
        if self.resposta:
            return self.resposta
        ev = [e for e in self.lote if e["id"] > after][:30] if after else self.lote[-30:]
        return RespostaRelay(True, 200, "OK", eventos=ev, next_cursor=ev[-1]["id"] if ev else after,
                             relay_version=4, mode="OBSERVACAO_SEM_ORDENS", desvio_relogio_ms=0)


class Fonte:
    """Gera eventos no formato real do relay."""

    def __init__(self, relogio, relay):
        self.r, self.relay, self.id, self.seq = relogio, relay, 100, 0

    def _ev(self, kind, conta, banca, simbolo, sessao, obs=None, **p):
        self.id += 1
        self.seq += 1
        obs = self.r.t if obs is None else obs
        payload = {"relay_version": 4, "session_id": sessao, "bank_id": banca,
                   "source_account_id": conta, "symbol": simbolo, "observed_at_ms": obs, **p}
        e = {"id": self.id, "event_id": f"e{self.id}", "session_id": sessao, "client_seq": self.seq,
             "kind": kind, "observed_at_ms": obs, "received_at": "x", "payload": payload}
        self.relay.lote.append(e)
        return e

    def par(self, net, conta="ACC1", banca="B1", simbolo="MGC", sessao="S1", lote=0.34, planned=12, confirmado=True):
        self._ev("card", conta, banca, simbolo, sessao, card_confirmed=confirmado, card_lot=lote,
                 planned_contracts=planned)
        return self._ev("position", conta, banca, simbolo, sessao, net_contracts=net)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.cfg = Config()
        self.cfg.token = TOKEN
        self.cfg.estado_arquivo = str(Path(self.tmp) / "estado.json")
        self.rel = Relogio()
        self.mt5 = FakeMT5()
        self.relay = FakeRelay()
        self.f = Fonte(self.rel, self.relay)
        self.estado = Estado(self.cfg.estado_arquivo).carregar()
        self.ex = Executor(self.cfg, self.relay, self.mt5, self.estado, self.rel)
        self.ex.habilitar_demo()

    def passo(self, net, avancar=1000, **kw):
        self.rel.t += avancar
        self.f.par(net, **kw)
        self.ex.ciclo()

    def volume(self, s="GOLD"):
        return round(sum(p["volume"] for p in self.mt5.pos if p["symbol"] == s), 8)

    def reiniciar(self):
        self.estado = Estado(self.cfg.estado_arquivo).carregar()
        self.ex = Executor(self.cfg, self.relay, self.mt5, self.estado, self.rel)
        self.ex.habilitar_demo()


class TestEntradas(Base):
    def test_zero_inicial_nao_abre(self):
        self.passo(0)
        self.passo(0)
        self.assertEqual(self.mt5.ordens, [])

    def test_entrada_1_contrato_abre_lote_integral_oposto(self):
        self.passo(0)
        self.passo(1)
        self.assertEqual(self.mt5.ordens, [("abrir", "GOLD", "SELL", 0.34)])

    def test_sell_topstep_vira_buy_mt5(self):
        self.passo(0)
        self.passo(-2)
        self.assertEqual(self.mt5.ordens[0][2], "BUY")

    def test_aumento_nao_multiplica(self):
        self.passo(0)
        self.passo(1)
        self.passo(5)
        self.passo(12)
        self.assertEqual(len(self.mt5.ordens), 1)
        self.assertEqual(self.volume(), 0.34)

    def test_heartbeat_nao_age(self):
        self.passo(0)
        self.passo(3)
        for _ in range(5):
            self.passo(3)
        self.assertEqual(len(self.mt5.ordens), 1)

    def test_posicao_preexistente_nao_abre(self):
        self.passo(4)  # primeira leitura ja com posicao
        self.passo(5)
        self.assertEqual(self.mt5.ordens, [])

    def test_card_nao_confirmado_bloqueia(self):
        self.passo(0)
        self.passo(1, confirmado=False)
        self.assertEqual(self.mt5.ordens, [])


class TestParciais(Base):
    def test_parcial_proporcional_sem_excesso(self):
        self.passo(0)
        self.passo(12)
        self.passo(6)
        self.assertEqual(self.volume(), 0.17)
        self.passo(1)
        self.assertEqual(self.volume(), 0.02)  # 0.34/12 = 0.0283 -> 0.02 (para baixo)
        self.passo(0)
        self.assertEqual(self.volume(), 0.0)

    def test_aumento_depois_de_parcial_nao_reaumenta(self):
        self.passo(0)
        self.passo(12)
        self.passo(6)
        self.passo(10)
        self.assertEqual(self.volume(), 0.17)

    def test_arredondamento(self):
        self.assertEqual(quantizar_baixo(0.0283333, 0.01), 0.02)
        self.assertEqual(quantizar_baixo(0.34, 0.01), 0.34)
        self.assertEqual(volume_alvo(0.34, 12, 12, 0.01, 0.01), 0.34)
        self.assertEqual(volume_alvo(0.05, 20, 1, 0.01, 0.01), 0.01)  # minimo
        self.assertEqual(volume_alvo(0.34, 12, 0, 0.01, 0.01), 0.0)


class TestInversaoEFechamento(Base):
    def test_inversao_fecha_e_abre_lado_oposto(self):
        self.passo(0)
        self.passo(2)
        self.passo(-2)
        self.assertEqual([o[0] for o in self.mt5.ordens], ["abrir", "fechar", "abrir"])
        self.assertEqual(self.mt5.pos[0]["type"], "BUY")
        self.assertEqual(self.volume(), 0.34)

    def test_inversao_com_falha_de_fechamento_nao_abre(self):
        self.passo(0)
        self.passo(2)
        self.mt5.falhar_fechar = True
        self.passo(-2)
        self.assertEqual([o[0] for o in self.mt5.ordens], ["abrir"])

    def test_troca_de_banca_fecha_com_net_zero_mesma_conta(self):
        self.passo(0, banca="B1")
        self.passo(2, banca="B1")
        self.passo(0, banca="B2")  # usuario trocou de banca na Win or Win
        self.assertEqual(self.volume(), 0.0)

    def test_net_zero_de_outra_conta_nao_fecha(self):
        self.passo(0, conta="ACC1")
        self.passo(2, conta="ACC1")
        self.passo(0, conta="ACC2")
        self.assertEqual(self.volume(), 0.34)

    def test_outra_conta_nao_abre_concorrente(self):
        self.passo(0, conta="ACC1")
        self.passo(2, conta="ACC1")
        self.passo(0, conta="ACC2")
        self.passo(3, conta="ACC2")
        self.assertEqual(len([o for o in self.mt5.ordens if o[0] == "abrir"]), 1)

    def test_conta_oculta_gera_alerta(self):
        self.passo(0, conta="ACC1")
        self.passo(2, conta="ACC1")
        self.rel.t += 20000
        self.assertTrue(self.ex.motor.alertar_origens_sem_leitura())

    def test_fechamento_manual_nao_reabre(self):
        self.passo(0)
        self.passo(2)
        self.mt5.pos.clear()
        self.passo(2)
        self.passo(3)
        self.passo(1)
        self.assertEqual(len(self.mt5.ordens), 1)
        self.passo(0)
        self.passo(1)  # nova operacao real depois do zero: pode abrir
        self.assertEqual(len([o for o in self.mt5.ordens if o[0] == "abrir"]), 2)


class TestIdempotenciaReinicio(Base):
    def test_mesmo_evento_reprocessado_nao_age(self):
        self.passo(0)
        self.passo(1)
        self.estado.dados["cursor"] = 0
        self.ex.ciclo()
        self.ex.ciclo()
        self.assertEqual(len(self.mt5.ordens), 1)

    def test_reinicio_nao_reabre(self):
        self.passo(0)
        self.passo(1)
        self.reiniciar()
        self.estado.dados["cursor"] = 0
        self.ex.ciclo()
        self.passo(1)
        self.assertEqual(len(self.mt5.ordens), 1)
        self.passo(0)
        self.assertEqual(self.volume(), 0.0)

    def test_reinicio_apos_pausa_longa_nao_abre(self):
        self.passo(0)
        self.reiniciar()
        self.passo(2, avancar=60000)
        self.assertEqual(self.mt5.ordens, [])

    def test_replay_antigo_ignorado(self):
        self.passo(0)
        self.rel.t += 1000
        self.f.par(0)
        self.f.par(3, sessao="S1")
        self.relay.lote[-1]["payload"]["observed_at_ms"] = self.rel.t - 60000
        self.ex.ciclo()
        self.assertEqual(self.mt5.ordens, [])

    def test_estado_atomico(self):
        self.passo(0)
        self.passo(1)
        d = json.loads(Path(self.cfg.estado_arquivo).read_text())
        self.assertEqual(d["origens"]["ACC1|MGC"]["volume_mt5"], 0.34)
        self.assertFalse(list(Path(self.tmp).glob(".estado-*")))

    def test_reconciliacao(self):
        self.passo(0)
        self.passo(1)
        self.assertEqual(reconciliar(self.estado, self.mt5, self.cfg), (True, "OK"))
        self.mt5.pos.append({"ticket": 99, "symbol": "GOLD", "type": "BUY", "volume": 1, "magic": 0})
        self.assertFalse(reconciliar(self.estado, self.mt5, self.cfg)[0])


class TestFalhasESeguranca(Base):
    def test_mt5_real_bloqueado(self):
        self.mt5.demo = False
        self.passo(0)
        self.passo(1)
        self.assertEqual(self.mt5.pos, [])

    def test_somente_leitura_nao_envia(self):
        self.ex.motor.modo = "SOMENTE_LEITURA"
        self.passo(0)
        self.passo(1)
        self.assertEqual(self.mt5.ordens, [])
        self.assertIn("SIMULADO_ENTRADA", " ".join(self.ex.motor.historico))

    def test_mt5_estado_desconhecido_sem_acao(self):
        self.passo(0)
        self.mt5.desconhecido = True
        self.passo(1)
        self.assertEqual(self.mt5.ordens, [])

    def test_falha_order_send_nao_tenta_de_novo(self):
        self.passo(0)
        self.mt5.falhar_abrir = True
        self.passo(1)
        self.mt5.falhar_abrir = False
        self.passo(1)
        self.passo(2)
        self.assertEqual(self.mt5.ordens, [])

    def test_parcial_falhou_e_repetida_no_heartbeat(self):
        self.passo(0)
        self.passo(12)
        self.mt5.falhar_fechar = True
        self.passo(6)
        self.mt5.falhar_fechar = False
        self.passo(6)
        self.assertEqual(self.volume(), 0.17)

    def test_simbolo_nao_mapeado_e_net_invalido(self):
        self.passo(0, simbolo="ES")
        self.passo(1, simbolo="ES")
        self.rel.t += 1000
        e = self.f.par(0)
        e["payload"]["net_contracts"] = "abc"
        self.ex.ciclo()
        self.assertEqual(self.mt5.ordens, [])

    def test_backlog_pagina_com_cursor(self):
        for _ in range(40):
            self.rel.t += 10
            self.f.par(0)
        self.estado.dados["cursor"] = 100
        self.ex.ciclo()
        self.assertGreater(len(self.relay.chamadas), 1)
        self.assertEqual(self.estado.dados["cursor"], self.relay.lote[-1]["id"])


class TestDiagnostico(Base):
    def diag(self):
        return diagnosticar(self.cfg, self.relay, self.mt5, self.rel, espera_s=0, dormir=lambda s: None)

    def test_par_valido_aprova(self):
        self.f.par(0)
        r = self.diag()
        self.assertTrue(r.par_ok, r.linhas)
        self.assertTrue(r.aprovado, r.falhas)

    def test_401(self):
        self.relay.resposta = RespostaRelay(False, 401, "HTTP_401")
        self.assertIn("CHAVE_RECUSADA_401", self.diag().falhas)

    def test_200_sem_eventos(self):
        self.assertIn("ZERO_EVENTOS", self.diag().falhas)

    def test_relogio(self):
        self.f.par(0)
        self.relay.resposta = self.relay.buscar(0)
        self.relay.resposta.desvio_relogio_ms = 9000
        self.assertIn("RELOGIO_DESSINCRONIZADO", self.diag().falhas)

    def test_par_antigo(self):
        self.f.par(0)
        self.rel.t += 30000
        self.assertIn("PAR_ANTIGO", self.diag().falhas)

    def test_mt5_real_reprova(self):
        self.f.par(0)
        self.mt5.demo = False
        self.assertIn("CONTA_NAO_DEMO_BLOQUEADA", self.diag().falhas)

    def test_chave_nao_aparece(self):
        self.f.par(0)
        txt = "\n".join(self.diag().linhas)
        self.assertNotIn(TOKEN, txt)
        self.assertIn(impressao_chave(TOKEN), txt)


class TestRelayHTTP(unittest.TestCase):
    def _cli(self, status, corpo, date=True):
        class R:
            def __init__(s):
                s.status = status
                s.headers = {"Date": formatdate(usegmt=True)} if date else {}

            def read(s):
                return corpo

        def abrir(req, timeout):
            self.req = req
            if status != 200:
                raise urllib.error.HTTPError(req.full_url, status, "x", R().headers, io.BytesIO(corpo))
            return R()

        return RelayClient("https://exemplo/api/", TOKEN, abrir=abrir)

    def test_200_formato(self):
        b = json.dumps({"ok": True, "relay_version": 4, "mode": "OBSERVACAO_SEM_ORDENS",
                        "orders_enabled": False, "events": [], "next_cursor": 0}).encode()
        r = self._cli(200, b).buscar(0)
        self.assertTrue(r.ok)
        self.assertIsNotNone(r.desvio_relogio_ms)
        self.assertEqual(self.req.get_header("Authorization"), "Bearer " + TOKEN)
        self.assertTrue(self.req.full_url.endswith("/api/?after=0"))

    def test_401(self):
        r = self._cli(401, b'{"error":"unauthorized"}').buscar(0)
        self.assertEqual((r.ok, r.http, r.motivo), (False, 401, "HTTP_401"))

    def test_orders_enabled_rejeitado(self):
        b = json.dumps({"ok": True, "mode": "OBSERVACAO_SEM_ORDENS", "orders_enabled": True, "events": []}).encode()
        self.assertEqual(self._cli(200, b).buscar(0).motivo, "ORDERS_ENABLED_INESPERADO")

    def test_exige_https(self):
        with self.assertRaises(ValueError):
            RelayClient("http://x/", TOKEN)


class TestDiagnosticoConsole(Base):
    def _exec(self, destino):
        import contextlib
        import diagnostico_v4 as d
        buf, prog = io.StringIO(), []
        with contextlib.redirect_stdout(buf):
            rc = d.executar(self.cfg, self.relay, self.mt5, destino=destino, agora_ms=self.rel,
                            progresso=prog.append, espera_s=0, dormir=lambda s: None)
        return rc, buf.getvalue(), prog

    def test_progresso_e_aprovacao(self):
        self.f.par(0)
        destino = Path(self.tmp) / "dados" / "diag.txt"
        rc, out, prog = self._exec(destino)
        self.assertEqual(rc, 0)
        self.assertTrue(prog and "tentativa 1" in prog[0] and "HTTP 200" in prog[0] and "eventos=2" in prog[0])
        txt = destino.read_text(encoding="utf-8")
        self.assertIn("RESULTADO: APROVADO", txt)
        self.assertIn("RESULTADO: APROVADO", out)
        self.assertNotIn(TOKEN, txt + out + "".join(prog))

    def test_reprovacao_codigo_1(self):
        destino = Path(self.tmp) / "d.txt"
        rc, out, _ = self._exec(destino)
        self.assertEqual(rc, 1)
        self.assertIn("ZERO_EVENTOS", destino.read_text(encoding="utf-8"))

    def test_progresso_varias_tentativas(self):
        prog = []
        diagnosticar(self.cfg, self.relay, self.mt5, self.rel, espera_s=1, dormir=lambda s: __import__("time").sleep(0.6),
                     progresso=prog.append)
        self.assertGreaterEqual(len(prog), 2)
        self.assertIn("aguardando", prog[0])

    def test_erro_interno_controlado(self):
        class Quebra:
            url = "https://x/"
            def buscar(self, after=0):
                raise RuntimeError("falhou " + TOKEN)
        import contextlib
        import diagnostico_v4 as d
        destino = Path(self.tmp) / "e.txt"
        with contextlib.redirect_stdout(io.StringIO()) as buf:
            rc = d.executar(self.cfg, Quebra(), self.mt5, destino=destino, agora_ms=self.rel,
                            progresso=None, espera_s=0, dormir=lambda s: None)
        txt = destino.read_text(encoding="utf-8")
        self.assertEqual(rc, 1)
        self.assertIn("ERRO_INTERNO", txt)
        self.assertNotIn(TOKEN, txt + buf.getvalue())

    def test_cmd_sem_redirecionamento(self):
        cmd = (Path(__file__).resolve().parent.parent / "DIAGNOSTICO_DEMO.cmd").read_text(encoding="utf-8")
        self.assertNotIn(">", cmd.split("diagnostico_v4.py")[1].splitlines()[0])
        self.assertNotIn("type dados", cmd)
        self.assertIn('".venv\\Scripts\\python.exe" diagnostico_v4.py', cmd)
        self.assertIn("pip install -r requirements.txt", cmd)
        self.assertIn("pause", cmd)


if __name__ == "__main__":
    unittest.main()
