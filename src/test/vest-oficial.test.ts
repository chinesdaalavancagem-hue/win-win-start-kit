import { describe, it, expect } from "vitest";
import { defaultState, prepararBancaVest, computeAssetCalcs } from "../lib/platform/engine";
import { vestPlan, vestMgcEquivalent, vestUsdPerPoint, vestTakerFees } from "../lib/platform/vest-oficial";

describe("Vest Capital como mesa oficial", () => {
  it("aplica meta e drawdown do plano de avaliacao 50K sem DLL", () => {
    const p = vestPlan(50000,0);
    expect([p.target,p.staticDrawdown,p.equityFloor,p.fee,p.consistency,p.minDays,p.profitSplit])
      .toEqual([5000,3000,47000,745,0,0,0.8]);
    expect(vestPlan(10000,3).dailyLoss).toBe(300);
  });
  it("mostra MGC equivalente e taxa taker sem confundir unidades com contratos", () => {
    expect(vestMgcEquivalent(10)).toBe(1);
    expect(vestMgcEquivalent(20)).toBe(2);
    expect(vestUsdPerPoint(10)).toBe(10);
    expect(vestTakerFees(10,4100,4110)).toBeCloseTo(2.0525,5);
  });
  it("inicia nova banca isolada e nao registra ordens", () => {
    const state=defaultState(), before=JSON.stringify(state.assets.saque2.days);
    prepararBancaVest(state,50000,0);
    expect(state.vestAccount).toEqual({capital:50000,dailyLimitPercent:0});
    expect(state.assets.ouro.mesaFuturos).toBe("vest");
    expect(state.assets.ouro.days[0]?.mnq).toBe(10);
    expect(state.assets.ouro.days[0]?.meta).toBe(5000);
    expect(state.assets.ouro.days[0]?.mll).toBe(3000);
    expect(computeAssetCalcs(state.assets.ouro,"ouro")[0]?.pontos).toBe(500);
    expect(state.log).toHaveLength(0);
    expect(JSON.stringify(state.assets.saque2.days)).toBe(before);
  });
  it("calcula Vest por unidades GC mesmo com parâmetro legado incorreto", () => {
    const state=defaultState();
    prepararBancaVest(state,10000,0);
    const gold=state.assets.ouro;
    gold.params.mnq=60; // valor legado não deve virar dólares por ponto da Vest
    gold.days[0]!.lotes=0.21;
    let calc=computeAssetCalcs(gold,"ouro")[0]!;
    expect(calc.pontos).toBe(100); // 1 MGC equivalente = 10 unidades = 10 USDC/ponto
    expect(calc.pontosReprova).toBe(60); // piso inicial de 600 / 10 USDC/ponto
    expect(calc.custoSePassar).toBeCloseTo(2100,6);
    expect(calc.reprova).toBeCloseTo(1260,6);
    gold.days[0]!.mnq=20; // 2 MGC equivalentes = 20 unidades
    calc=computeAssetCalcs(gold,"ouro")[0]!;
    expect(calc.pontos).toBe(50);
    expect(calc.pontosReprova).toBe(30);
    expect(calc.custoSePassar).toBeCloseTo(1050,6);
    expect(calc.reprova).toBeCloseTo(630,6);
  });

});
