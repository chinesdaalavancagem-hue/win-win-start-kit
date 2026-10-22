import { describe, expect, it } from "vitest";
import { calcAporteFracionado } from "@/lib/platform/engine";

describe("aporte fracionado com bônus parcial e teto", () => {
  it("cobre toda a necessidade com bônus de 50% e teto de 80", () => {
    const r = calcAporteFracionado({ margem: 0, stopoutPct: 50, custoDia: 100, bonusPct: 50, bonusCap: 80, bancaIntegral: 100 });
    expect(r.proprio).toBeCloseTo(100 / 1.5);
    expect(r.proprio + Math.min(r.proprio * 0.5, 80)).toBeGreaterThanOrEqual(99.9999);
  });
  it("respeita o teto reduzido mesmo com bônus percentual abaixo de 100%", () => {
    const r = calcAporteFracionado({ margem: 0, stopoutPct: 50, custoDia: 100, bonusPct: 50, bonusCap: 10, bancaIntegral: 100 });
    expect(r.proprio).toBeCloseTo(90);
    expect(r.proprio + Math.min(r.proprio * 0.5, 10)).toBeCloseTo(100);
  });
  it("sem bônus, recomenda o valor completo necessário", () => {
    const r = calcAporteFracionado({ margem: 100, stopoutPct: 50, custoDia: 50, bonusPct: 0, bonusCap: 100, bancaIntegral: 200 });
    expect(r.proprio).toBe(200);
  });
});