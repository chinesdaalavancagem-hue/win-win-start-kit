import { describe, expect, it } from "vitest";
import { defaultState, MESAS_FUTUROS, selecionarMesaGold, diasAvaliacaoGold, removerDiaGold, adicionarDiaGold, lossLimitGoldEfetivo } from "../lib/platform/engine";

describe("perfis Gold por mesa de futuros", () => {
  it("restaura Topstep com avaliação 3k em 2 dias, consistência 55% e 5 dias financiados de 150", () => {
    const gold = defaultState().assets.ouro;
    selecionarMesaGold(gold, "topstep");
    expect(MESAS_FUTUROS.topstep.consistencia).toBe(55);
    expect(diasAvaliacaoGold(gold)).toBe(2);
    expect(gold.days).toHaveLength(7);
    expect(gold.days.slice(0, 2).map((day) => day.meta)).toEqual([1500, 1500]);
    expect(gold.days.slice(2).map((day) => day.meta)).toEqual([150, 150, 150, 150, 150]);
    expect(gold.days.slice(0, 3).every((_, i) => lossLimitGoldEfetivo(gold, i) === 2000)).toBe(true);
    expect(gold.days.slice(3).map((_, i) => lossLimitGoldEfetivo(gold, i + 3))).toEqual([2006, 2012, 2018, 2024]);
    gold.days[3]!.mll = 2075;
    expect(lossLimitGoldEfetivo(gold, 3)).toBe(2075);
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
});
