import { describe, expect, it } from "vitest";
import { defaultState, selecionarMesaGold, computeAssetCalcs } from "@/lib/platform/engine";

describe("limite de reprovação diário do Gold", () => {
  it("fixa 2000 na avaliação e primeiro dia financiado por mesa", () => {
    for (const [mesa, avaliacao] of [["tradefive", 3], ["lucid", 2], ["mff", 4]] as const) {
      const s = defaultState();
      const a = s.assets.ouro;
      selecionarMesaGold(a, mesa);
      a.days.forEach((d) => { d.mnq = 20; d.mll = 3456; });
      const c = computeAssetCalcs(a, "ouro");
      expect(c[0]?.pontosReprova).toBe(10);
      expect(c[avaliacao]?.pontosReprova).toBe(10);
      expect(c[avaliacao + 1]?.pontosReprova).toBe(17.28);
    }
  });
  it("não apresenta estimativa para financiada D2 sem limite real informado", () => {
    const a = defaultState().assets.ouro;
    selecionarMesaGold(a, "lucid");
    delete a.days[3]?.mll;
    const c = computeAssetCalcs(a, "ouro");
    expect(c[3]?.pontosReprova).toBe(0);
    a.days[3]!.mll = 1200;
    expect(computeAssetCalcs(a, "ouro")[3]?.pontosReprova).toBeGreaterThan(0);
  });
});