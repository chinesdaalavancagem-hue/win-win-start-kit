import { describe, expect, it } from "vitest";
import { defaultState, selecionarMesaGold, lossLimitGoldProjetado, computeAssetCalcs } from "@/lib/platform/engine";

describe("Loss Limit EOD Gold projetado pelas metas", () => {
  it.each(["tradefive", "lucid", "mff"] as const)("respeita os dias de avaliação e D1 financiada da mesa %s", (mesa) => {
    const a = defaultState().assets.ouro;
    selecionarMesaGold(a, mesa);
    const aval = mesa === "tradefive" ? 3 : mesa === "lucid" ? 2 : 4;
    expect(lossLimitGoldProjetado(a, 0)).toBe(2000);
    expect(lossLimitGoldProjetado(a, aval)).toBe(2000);
    a.days[aval]!.meta = 3000;
    expect(lossLimitGoldProjetado(a, aval + 1)).toBe(2120);
    a.days[aval + 1]!.meta = 1000;
    expect(lossLimitGoldProjetado(a, aval + 2)).toBe(2160);
    a.days[aval]!.meta = 13000;
    expect(lossLimitGoldProjetado(a, aval + 1)).toBe(2520);
  });
  it("ignora antigo campo manual mll na projeção dos dias financiados", () => {
    const a = defaultState().assets.ouro;
    selecionarMesaGold(a, "lucid");
    a.days[2]!.meta = 3000;
    a.days[3]!.mll = 9999;
    const before = computeAssetCalcs(a, "ouro")[3]!.pontosReprova;
    delete a.days[3]!.mll;
    expect(computeAssetCalcs(a, "ouro")[3]!.pontosReprova).toBe(before);
  });
});