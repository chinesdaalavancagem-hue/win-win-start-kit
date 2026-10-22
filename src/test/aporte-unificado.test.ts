import { describe, expect, it } from "vitest";
import { aporteMinimoComBonus, calcAporteFracionado, calcCaixaCiclo, defaultState } from "@/lib/platform/engine";

describe("mesma conta de aporte no card e no caixa", () => {
  it.each([
    { falta: 100, pct: 100, teto: 100, esperado: 50 },
    { falta: 100, pct: 50, teto: 10, esperado: 90 },
    { falta: 100, pct: 50, teto: 0, esperado: 100 },
    { falta: 0, pct: 100, teto: 100, esperado: 0 },
    { falta: 200, pct: 100, teto: 20, esperado: 180 },
  ])("cobre $falta com $pct% e teto $teto", ({ falta, pct, teto, esperado }) => {
    const proprio = aporteMinimoComBonus(falta, pct, teto);
    expect(proprio).toBeCloseTo(esperado);
    expect(proprio + Math.min(proprio * pct / 100, teto)).toBeGreaterThanOrEqual(falta - 0.00001);
  });
  it("usa a mesma fórmula no plano fracionado", () => {
    const r = calcAporteFracionado({ margem: 0, stopoutPct: 50, custoDia: 100, bonusPct: 50, bonusCap: 10, bancaIntegral: 100 });
    expect(r.proprio).toBe(aporteMinimoComBonus(100, 50, 10));
  });
  it("nunca projeta depósito negativo no ciclo com saldo inicial zero", () => {
    const a = defaultState().assets.ouro;
    const plano = calcCaixaCiclo(a, "ouro", 100);
    expect(plano.dias.every(d => d.deposito >= 0 && d.bonusGanho >= 0)).toBe(true);
  });
  it("interpreta teto de bônus zerado como ausência de bônus, sem criar crédito ilimitado", () => {
    const r = calcAporteFracionado({ margem: 0, stopoutPct: 50, custoDia: 100, bonusPct: 100, bonusCap: 0, bancaIntegral: 100 });
    expect(r.proprio).toBe(100);
    expect(r.bonus).toBe(0);
    const a = defaultState().assets.ouro;
    a.bonus.bonusCap = 0;
    const plano = calcCaixaCiclo(a, "ouro", 100);
    expect(plano.bonusTotal).toBe(0);
    expect(plano.dias.every(d => d.bonusGanho === 0)).toBe(true);
  });
});