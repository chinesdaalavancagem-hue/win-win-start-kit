import { describe, expect, it } from "vitest";
import { defaultState } from "@/lib/platform/engine";

describe("parâmetros padrão oficiais da Master", () => {
  it("configura os parâmetros e os oito dias oficiais de Ouro", () => {
    const { params, days } = defaultState().assets.ouro;
    expect(params).toMatchObject({
      mnq: 10, hfm: 100, mll: 2000, saldoInicial: 416, taxa: 100,
      lucroDesejado: 100, marginPerLot: 873, stopoutPct: 50,
      saqueAprovada: 1700, folgaExtraPct: 20,
    });
    expect(days).toEqual([
      { mnq: 20, lotes: 0.21, meta: 1080, mll: 2000 },
      { mnq: 20, lotes: 0.33, meta: 1080, mll: 2000 },
      { mnq: 20, lotes: 0.51, meta: 1080, mll: 2000 },
      { mnq: 20, lotes: 0.8, meta: 3000, mll: 2000 },
      { mnq: 2, lotes: 0.19, meta: 200, mll: 2120 },
      { mnq: 2, lotes: 0.21, meta: 200, mll: 2130 },
      { mnq: 2, lotes: 0.23, meta: 200, mll: 2140 },
      { mnq: 2, lotes: 0.25, meta: 200, mll: 2150 },
    ]);
  });

  it("configura os parâmetros e os sete dias oficiais de Nasdaq", () => {
    const { params, days } = defaultState().assets.nasdaq;
    expect(params).toMatchObject({
      mnq: 2, hfm: 1, mll: 2000, saldoInicial: 2000, taxa: 100,
      lucroDesejado: 100, marginPerLot: 59, stopoutPct: 50,
      saqueAprovada: 0, folgaExtraPct: 20,
    });
    expect(days).toEqual([
      { mnq: 20, lotes: 4, meta: 1500 },
      { mnq: 20, lotes: 7, meta: 1500 },
      { mnq: 10, lotes: 6.2, meta: 1000 },
      { mnq: 10, lotes: 9.3, meta: 1000 },
      { mnq: 3, lotes: 4.2, meta: 150 },
      { mnq: 3, lotes: 4.5, meta: 150 },
      { mnq: 3, lotes: 4.8, meta: 150 },
    ]);
  });

  it("configura os parâmetros e os cinco dias oficiais de Saque 2", () => {
    const { params, days } = defaultState().assets.saque2;
    expect(params).toMatchObject({
      mnq: 10, hfm: 100, mll: 2000, saldoInicial: 732, taxa: 0,
      lucroDesejado: 0, marginPerLot: 873, stopoutPct: 50,
      saqueAprovada: 1300, folgaExtraPct: 20, ativoReal: "ouro",
    });
    expect(days).toEqual([
      { mnq: 5, lotes: 0.03, meta: 200, mll: 2080 },
      { mnq: 5, lotes: 0.03, meta: 200, mll: 2090 },
      { mnq: 5, lotes: 0.03, meta: 200, mll: 2090 },
      { mnq: 5, lotes: 0.04, meta: 200, mll: 2100 },
      { mnq: 5, lotes: 0.04, meta: 200, mll: 2110 },
    ]);
  });
});
