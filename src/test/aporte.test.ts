import { describe, it, expect } from "vitest";
import { calcAporteFracionado } from "@/lib/platform/engine";

describe("aporte fracionado", () => {
  it("com bônus de 100% deposita metade do necessário", () => {
    const r = calcAporteFracionado({ margem: 500, stopoutPct: 20, custoDia: 400, bonusPct: 100, bonusCap: 3000, bancaIntegral: 1200 });
    expect(r.total).toBe(1000);
    expect(r.proprio).toBe(500);
    expect(r.bonus).toBe(500);
    expect(r.economia).toBe(700);
  });
  it("respeita o teto do bônus", () => {
    const r = calcAporteFracionado({ margem: 1000, stopoutPct: 0, custoDia: 0, bonusPct: 100, bonusCap: 200, bancaIntegral: 0 });
    expect(r.proprio).toBe(800);
    expect(r.bonus).toBe(200);
  });
});
