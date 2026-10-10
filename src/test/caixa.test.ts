import { describe, it, expect } from "vitest";
import { calcCaixaCiclo, defaultState } from "@/lib/platform/engine";

describe("caixa do ciclo", () => {
  const s = defaultState();
  const a = s.assets.nasdaq;
  a.params = { ...a.params, taxa: 100, marginPerLot: 100, stopoutPct: 0, saqueAprovada: 3000 };
  a.days = [{ mnq: 1, lotes: 1, meta: 0 }, { mnq: 1, lotes: 3, meta: 0 }];
  a.bonus.bonusCap = 50;
  it("sem bônus deposita só o que falta a cada dia", () => {
    const r = calcCaixaCiclo(a, "nasdaq", 0);
    expect(r.totalDepositado).toBe(300);
    expect(r.caixaMaximo).toBe(400);
    expect(r.resultadoFinal).toBe(3000 + 300 - 400);
  });
  it("bônus de 100% respeita o teto", () => {
    const r = calcCaixaCiclo(a, "nasdaq", 100);
    expect(r.bonusTotal).toBe(50);
    expect(r.totalDepositado).toBe(250);
  });
});
