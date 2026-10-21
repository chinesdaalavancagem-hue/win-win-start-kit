import { describe, expect, it } from "vitest";
import { defaultState, selecionarMesaGold, computeAssetCalcs, lossLimitGoldProjetado } from "@/lib/platform/engine";

describe("limite EOD projetado do Gold", () => {
  it("mantém $2000 durante avaliação e no D1 financiado por mesa", () => {
    for (const [mesa, avaliacao] of [["tradefive", 3], ["lucid", 2], ["mff", 4]] as const) {
      const a = defaultState().assets.ouro;
      selecionarMesaGold(a, mesa);
      a.days.forEach((d) => { d.mnq = 20; d.mll = 3456; });
      expect(lossLimitGoldProjetado(a, 0)).toBe(2000);
      expect(lossLimitGoldProjetado(a, avaliacao)).toBe(2000);
      expect(computeAssetCalcs(a, "ouro")[avaliacao]?.pontosReprova).toBe(10);
    }
  });
  it("projeta $2120 após meta de $3000 no primeiro financiado", () => {
    const a = defaultState().assets.ouro;
    selecionarMesaGold(a, "lucid");
    a.days[2]!.meta = 3000;
    expect(lossLimitGoldProjetado(a, 3)).toBe(2120);
    expect(computeAssetCalcs(a, "ouro")[3]?.pontosReprova).toBeGreaterThan(0);
  });
});