import { describe, expect, it } from "vitest";
import { buildDeterministicAnalysis } from "@/lib/platform/ai-analysis";
import { defaultState } from "@/lib/platform/engine";

describe("análise determinística da banca", () => {
  it("calcula custos cumulativos com base no motor existente", () => {
    const state = defaultState();
    state.assets.nasdaq.params.taxa = 100;
    const result = buildDeterministicAnalysis(state, "nasdaq", 10_000);
    expect(result.days).toHaveLength(state.assets.nasdaq.days.length);
    expect(result.days[0]!.costIfPass).toBeGreaterThan(100);
    expect(result.days[0]!.cumulativeCostIfPass).toBe(result.days[0]!.costIfPass);
    expect(result.totalCostIfAllDaysPass).toBe(result.days.at(-1)!.cumulativeCostIfPass);
  });

  it("rejeita banca inválida", () => {
    expect(() => buildDeterministicAnalysis(defaultState(), "nasdaq", 0)).toThrow();
    expect(() => buildDeterministicAnalysis(defaultState(), "nasdaq", Number.NaN)).toThrow();
  });

  it("identifica dias cujo custo cumulativo excede a banca informada", () => {
    const result = buildDeterministicAnalysis(defaultState(), "nasdaq", 1);
    expect(result.daysAboveCapital.length).toBeGreaterThan(0);
    expect(result.days.some((day) => !day.capitalCoversCumulativeCost)).toBe(true);
  });
});
