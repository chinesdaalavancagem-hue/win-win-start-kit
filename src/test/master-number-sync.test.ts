import { describe, expect, it } from "vitest";
import { applyMasterSyncValues, extractMasterSyncValues } from "@/lib/platform/master-sync";

const makeState = (mnq: number, lotes: number, deposito: number, saque: number) => ({
  activeTab: "nasdaq",
  assets: {
    nasdaq: {
      params: { mnq, hfm: 1, mll: 2000, saldoInicial: 2000, taxa: 100, lucroDesejado: 150, marginPerLot: 58, stopoutPct: 30, saqueAprovada: saque, folgaExtraPct: 20 },
      days: [{ mnq, lotes, meta: 1500 }],
      bonus: { deposito, bonusAtual: 20, bonusGanhoTotal: 40, bonusCap: 3000, log: [{ tipo: "deposito", valor: deposito }] },
      attempt: { currentDayIndex: 0, cycleCost: 0, custoProprioAcumulado: 0 },
    },
    ouro: { params: {}, days: [], bonus: { deposito: 0, log: [] } },
    saque2: { params: {}, days: [], bonus: { deposito: 0, log: [] } },
  },
  log: [{ id: 1, tipo: "aprovada", delta: 12 }],
  cfdBalance: 99,
  totalGasto: 123,
  counts: { aprovadas: 1, reprovadas: 0 },
});

describe("Master number sync", () => {
  it("extracts only the selected numeric configuration fields", () => {
    const raw = JSON.stringify({ bancasVersion: 1, activeId: "master", bancas: [{ id: "master", state: makeState(4, 2.5, 700, 999) }] });
    expect(extractMasterSyncValues(raw, ["nasdaq.params.mnq", "nasdaq.days.lotes", "nasdaq.params.saqueAprovada"])).toEqual({
      "nasdaq.params.mnq": [4],
      "nasdaq.days.lotes": [2.5],
    });
  });

  it("merges only authorized fields and preserves each account's financial history", () => {
    const raw = JSON.stringify({ bancasVersion: 1, activeId: "local", bancas: [{ id: "local", state: makeState(1, 0.5, 150, 77) }] });
    const merged = applyMasterSyncValues(raw, { "nasdaq.params.mnq": [5], "nasdaq.days.lotes": [3.2] });
    expect(merged).not.toBeNull();
    const result = JSON.parse(merged!);
    const state = result.bancas[0].state;
    expect(state.assets.nasdaq.params.mnq).toBe(5);
    expect(state.assets.nasdaq.days[0].lotes).toBe(3.2);
    expect(state.assets.nasdaq.bonus.deposito).toBe(150);
    expect(state.assets.nasdaq.bonus.log[0].valor).toBe(150);
    expect(state.assets.nasdaq.params.saqueAprovada).toBe(77);
    expect(state.log).toEqual([{ id: 1, tipo: "aprovada", delta: 12 }]);
    expect(state.cfdBalance).toBe(99);
    expect(state.totalGasto).toBe(123);
  });

  it("does not return a new document when values are unchanged", () => {
    const raw = JSON.stringify({ bancasVersion: 1, activeId: "local", bancas: [{ id: "local", state: makeState(4, 2.5, 150, 77) }] });
    expect(applyMasterSyncValues(raw, { "nasdaq.params.mnq": [4], "nasdaq.days.lotes": [2.5] })).toBeNull();
  });
});
