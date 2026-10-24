import { describe, expect, it } from "vitest";
import { defaultState, selecionarMesaGold } from "@/lib/platform/engine";
import { aplicarForex, extrairForex, novaBanca, parseBancas } from "@/lib/platform/bancas";
import { applyOfficialParams, buildOfficialParams } from "@/lib/platform/official-params";

describe("ambientes independentes por mesa", () => {
  it("migra as bancas legadas à Tradeify sem perder operações", () => {
    const banca = novaBanca("Avaliação antiga");
    banca.state.assets.ouro.days[0]!.meta = 1234;
    const restored = parseBancas(JSON.stringify({ bancasVersion: 1, bancas: [banca], activeId: banca.id }));
    expect(restored.bancas[0]?.mesa).toBe("tradefive");
    expect(restored.bancas[0]?.state.assets.ouro.days[0]?.meta).toBe(1234);
  });
  it("restaura bancas Topstep antigas e sua seleção sem apagar dados", () => {
    const banca = novaBanca("Topstep antiga");
    banca.mesa = "topstep";
    selecionarMesaGold(banca.state.assets.ouro, "topstep");
    banca.state.assets.ouro.days[0]!.meta = 1600;
    const doc = parseBancas(JSON.stringify({ bancasVersion: 1, bancas: [banca], activeId: banca.id, mesaAtiva: "topstep", activeIdsMesa: { topstep: banca.id } }));
    expect(doc.bancas).toHaveLength(1);
    expect(doc.bancas[0]?.mesa).toBe("topstep");
    expect(doc.bancas[0]?.state.assets.ouro.days[0]?.meta).toBe(1600);
    expect(doc.mesaAtiva).toBe("topstep");
    expect(doc.activeIdsMesa?.topstep).toBe(banca.id);
  });
  it("não mistura metas, dias, bancas e histórico entre mesas", () => {
    const tradeify = novaBanca("Tradeify");
    tradeify.mesa = "tradefive";
    const lucid = novaBanca("Lucid");
    lucid.mesa = "lucid";
    selecionarMesaGold(lucid.state.assets.ouro, "lucid");
    lucid.state.assets.ouro.days[0]!.meta = 333;
    tradeify.state.assets.ouro.days[0]!.meta = 111;
    const doc = parseBancas(JSON.stringify({ bancasVersion: 1, bancas: [tradeify, lucid], activeId: tradeify.id, mesaAtiva: "lucid" }));
    expect(doc.bancas.filter(b => b.mesa === "lucid")).toHaveLength(1);
    expect(doc.bancas.find(b => b.mesa === "lucid")?.state.assets.ouro.days).toHaveLength(7);
    expect(doc.bancas.find(b => b.mesa === "tradefive")?.state.assets.ouro.days[0]?.meta).toBe(111);
    expect(doc.bancas.find(b => b.mesa === "lucid")?.state.assets.ouro.days[0]?.meta).toBe(333);
  });
  it("compartilha saldo MT5 e bônus, mas mantém históricos separados", () => {
    const tradeify = novaBanca("A");
    const lucid = novaBanca("B");
    tradeify.state.forexSaldoReal = 1350;
    tradeify.state.assets.ouro.bonus.bonusAtual = 300;
    const shared = extrairForex(tradeify.state);
    const viewed = aplicarForex(lucid.state, shared);
    expect(viewed.forexSaldoReal).toBe(1350);
    expect(viewed.assets.ouro.bonus.bonusAtual).toBe(300);
    expect(viewed.log).toEqual([]);
  });
  it("preserva o contexto ao exportar perfis oficiais distintos", () => {
    const s = defaultState();
    const lucid = buildOfficialParams(s, "2026-10-21T00:00:00Z", "lucid");
    const mff = buildOfficialParams(s, "2026-10-21T00:00:00Z", "mff");
    expect(lucid.mesaFuturos).toBe("lucid");
    expect(mff.mesaFuturos).toBe("mff");
    const beforeFee = s.assets.ouro.params.taxa;
    applyOfficialParams(s, lucid);
    expect(s.assets.ouro.params.taxa).toBe(beforeFee);
  });
});
