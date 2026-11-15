import { describe, expect, it } from "vitest";
import { computeAssetCalcs, defaultState, MESAS_FUTUROS, selecionarMesaGold, diasAvaliacaoGold, diasAvaliacaoAtivo, removerDiaGold, adicionarDiaGold, aplicarParametrosDia, limitesTopstep, lossLimitGoldEfetivo } from "../lib/platform/engine";

describe("perfis Gold por mesa de futuros", () => {
  it("editar o stop do card recalcula ticks, bruto e líquido do red independentemente da meta", () => {
    const a = defaultState().assets.ouro;
    selecionarMesaGold(a, "topstep");
    const anterior = computeAssetCalcs(a, "ouro")[0]!;
    a.days[0]!.stopPlanejadoTopstep = 1000;
    const novo = computeAssetCalcs(a,"ouro")[0]!;
    expect(novo.ticksReprova).toBe(50);
    expect(novo.reprova).toBe(105);
    expect(novo.liquidoSeReprovar).toBe(105 - a.params.taxa);
    expect(novo.custoSePassar).toBe(anterior.custoSePassar);
    delete a.days[0]!.stopPlanejadoTopstep;
    expect(computeAssetCalcs(a,"ouro")[0]).toEqual(anterior);
  });
  it("ajusta o red ao primeiro tick que toca o piso e projeta o hedge com os mesmos pontos", () => {
    const a = defaultState().assets.ouro;
    selecionarMesaGold(a, "topstep");
    a.days[2]!.mnq = 20;
    a.days[2]!.lotes = 0.21;
    expect(computeAssetCalcs(a,"ouro")[2]).toMatchObject({ticksReprova:100,pontosReprova:10,reprova:210});
    a.days[2]!.mnq = 3;
    expect(computeAssetCalcs(a,"ouro")[2]).toMatchObject({ticksReprova:667,pontosReprova:66.7});
    expect(computeAssetCalcs(a,"ouro")[2]!.reprova).toBeCloseTo(1400.7);
    a.days[2]!.mnq = 0;
    expect(computeAssetCalcs(a,"ouro")[2]!.ticksReprova).toBeUndefined();
    const n = defaultState().assets.nasdaq;
    n.mesaFuturos = "topstep";
    expect(computeAssetCalcs(n,"nasdaq")[0]).toMatchObject({ticksReprova:200,pontosReprova:50});
  });
  it("restaura Topstep com avaliação 3k em 2 dias, consistência 55% e 5 dias financiados de 150", () => {
    const gold = defaultState().assets.ouro;
    selecionarMesaGold(gold, "topstep");
    expect(MESAS_FUTUROS.topstep.consistencia).toBe(55);
    expect(diasAvaliacaoGold(gold)).toBe(2);
    expect(gold.days).toHaveLength(7);
    expect(gold.days.slice(0, 2).map((day) => day.meta)).toEqual([1500, 1500]);
    expect(gold.days.slice(2).map((day) => day.meta)).toEqual([150, 150, 150, 150, 150]);
    expect(gold.days.slice(0, 3).every((_, i) => lossLimitGoldEfetivo(gold, i) === 2000)).toBe(true);
    expect(gold.days.slice(3).map((_, i) => lossLimitGoldEfetivo(gold, i + 3))).toEqual([2000, 2000, 2000, 2000]);
    gold.days[3]!.mll = 2075;
    expect(lossLimitGoldEfetivo(gold, 3)).toBe(2000);
    gold.attempt.resultadosMesaEod = {2:1092.96, 3:-500, 4:1600};
    expect(limitesTopstep(gold,"ouro",3)).toEqual({saldo:1092.96,piso:-907.04,distancia:2000});
    expect(limitesTopstep(gold,"ouro",4)).toEqual({saldo:592.96,piso:-907.04,distancia:1500});
    expect(limitesTopstep(gold,"ouro",5)).toEqual({saldo:2192.96,piso:0,distancia:2192.96});
  });
  it("usa 2+5 dias na Lucid e 4+5 na MFF", () => {
    const gold = defaultState().assets.ouro;
    const original = structuredClone(gold.days);
    expect(original).toHaveLength(8);
    selecionarMesaGold(gold, "lucid");
    expect(gold.days).toHaveLength(7);
    expect(MESAS_FUTUROS.lucid.consistencia).toBe(50);
    selecionarMesaGold(gold, "mff");
    expect(gold.days).toHaveLength(9);
    expect(MESAS_FUTUROS.mff.consistencia).toBe(30);
    expect(gold.days[3]?.meta).toBe(original[2]?.meta);
    selecionarMesaGold(gold, "tradefive");
    expect(gold.days).toEqual(original);
  });

  it("mantém metas específicas e dados do histórico ao alternar", () => {
    const s = defaultState();
    const gold = s.assets.ouro;
    const antigo = structuredClone(s.log);
    selecionarMesaGold(gold, "lucid");
    gold.days[0]!.meta = 987;
    selecionarMesaGold(gold, "mff");
    selecionarMesaGold(gold, "lucid");
    expect(gold.days[0]?.meta).toBe(987);
    expect(s.log).toEqual(antigo);
  });
  it("mantém Evaluation e Funded corretos ao remover ou acrescentar dias", () => {
    const a = defaultState().assets.ouro;
    selecionarMesaGold(a, "lucid");
    expect(diasAvaliacaoGold(a)).toBe(2);
    removerDiaGold(a, 0);
    expect(diasAvaliacaoGold(a)).toBe(1);
    expect(a.days).toHaveLength(6);
    adicionarDiaGold(a, "avaliacao");
    expect(diasAvaliacaoGold(a)).toBe(2);
    selecionarMesaGold(a, "mff");
    expect(diasAvaliacaoGold(a)).toBe(4);
    expect(a.days).toHaveLength(9);
    removerDiaGold(a, 5);
    expect(diasAvaliacaoGold(a)).toBe(4);
    selecionarMesaGold(a, "lucid");
    expect(diasAvaliacaoGold(a)).toBe(2);
  });
  it("separa Nasdaq Lucid em 2 dias de avaliação e preserva o D1 financiado ao remover D3 legado", () => {
    const nasdaq = defaultState().assets.nasdaq;
    selecionarMesaGold(nasdaq, "lucid");
    expect(diasAvaliacaoAtivo(nasdaq, "nasdaq")).toBe(2);
    expect(nasdaq.days).toHaveLength(7);
    expect(nasdaq.days[2]).toBeDefined();

    adicionarDiaGold(nasdaq, "avaliacao");
    expect(diasAvaliacaoAtivo(nasdaq, "nasdaq")).toBe(3);
    removerDiaGold(nasdaq, 2);
    expect(diasAvaliacaoAtivo(nasdaq, "nasdaq")).toBe(2);
    expect(nasdaq.days).toHaveLength(7);
    expect(nasdaq.days[2]).toBeDefined(); // D1 financiado continua sendo índice 2

    adicionarDiaGold(nasdaq, "financiada");
    expect(nasdaq.days).toHaveLength(8);
    expect(diasAvaliacaoAtivo(nasdaq, "nasdaq")).toBe(2);
  });
  it("repete somente os parâmetros do D2 financiado nos dias seguintes sem alterar resultados", () => {
    const asset = defaultState().assets.nasdaq;
    selecionarMesaGold(asset, "lucid");
    asset.attempt.currentDayIndex = 3; // D2 financiado, após 2 dias de avaliação
    asset.attempt.resultadosMesaEod = { "0": 1200, "1": 900, "2": 125 };
    const historico = structuredClone(asset.attempt.resultadosMesaEod);
    const avaliacao = structuredClone(asset.days.slice(0, 2));
    const primeiroFinanciado = structuredClone(asset.days[2]);
    const plano = { mnq: 1, lotes: 0.03, meta: 150, mll: 2000 };
    expect(aplicarParametrosDia(asset, 3, plano, true, 2)).toBe(4);
    expect(asset.days.slice(3)).toEqual(Array.from({ length: 4 }, () => plano));
    expect(asset.days.slice(0, 2)).toEqual(avaliacao);
    expect(asset.days[2]).toEqual(primeiroFinanciado);
    expect(asset.attempt.resultadosMesaEod).toEqual(historico);
    expect(aplicarParametrosDia(asset, 2, plano, true, 2)).toBe(0); // dia concluído
  });
  it("mantém o dia aberto na matriz e os parâmetros do D5 financiado após serializar o estado", () => {
    const state = defaultState();
    selecionarMesaGold(state.assets.nasdaq, "lucid");
    const indiceD5 = 6; // Lucid: avaliação D1/D2, financiada D1 a D5
    state.matrizDiaSelecionado = { nasdaq: indiceD5 };
    const plano = { mnq: 2, lotes: 0.05, meta: 200, mll: 1500 };
    expect(aplicarParametrosDia(state.assets.nasdaq, indiceD5, plano, false, 2)).toBe(1);
    const reloaded = JSON.parse(JSON.stringify(state));
    expect(reloaded.matrizDiaSelecionado.nasdaq).toBe(indiceD5);
    expect(reloaded.assets.nasdaq.days[indiceD5]).toEqual(plano);
    expect(reloaded.assets.nasdaq.attempt.currentDayIndex).toBe(0);
  });
});
