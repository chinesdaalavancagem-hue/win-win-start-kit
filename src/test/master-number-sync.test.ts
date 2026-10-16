import { describe, expect, it } from "vitest";
import { MASTER_SYNC_FIELDS, applyMasterSyncValues, extractMasterSyncValues, mergePublishedValues } from "@/lib/platform/master-sync";

const makeState = (mnq: number, lotes: number, deposito: number, saque: number) => ({
  activeTab: "nasdaq",
  assets: {
    nasdaq: {
      params: { mnq, hfm: 1, mll: 2000, saldoInicial: 2000, taxa: 100, lucroDesejado: 150, marginPerLot: 58, stopoutPct: 30, saqueAprovada: saque, folgaExtraPct: 20 },
      days: [{ mnq, lotes, meta: 1500 }],
      bonus: { deposito, bonusAtual: 20, bonusGanhoTotal: 40, bonusCap: 3000, log: [{ tipo: "deposito", valor: deposito }] },
      attempt: { currentDayIndex: 0, cycleCost: 0, custoProprioAcumulado: 0 },
    },
    ouro: { params: { mnq: 3 }, days: [{ mnq: 3, lotes: 0.25, meta: 500 }], bonus: { deposito: 0, log: [] } },
    saque2: { params: { mnq: 4 }, days: [], bonus: { deposito: 0, log: [] } },
  },
  log: [{ id: 1, tipo: "aprovada", delta: 12 }],
  cfdBalance: 99,
  totalGasto: 123,
  counts: { aprovadas: 1, reprovadas: 0 },
});

describe("Master number sync", () => {
  it("never offers personal balance references or test fees for publication", () => {
    const ids = MASTER_SYNC_FIELDS.map((field) => field.id);
    expect(ids).not.toContain("nasdaq.params.saldoInicial");
    expect(ids).not.toContain("nasdaq.params.taxa");
    expect(ids).not.toContain("ouro.params.saldoInicial");
    expect(ids).not.toContain("ouro.params.taxa");
    expect(ids).not.toContain("saque2.params.saldoInicial");
    expect(ids).not.toContain("saque2.params.taxa");
  });

  it("extracts only the selected numeric configuration fields", () => {
    const raw = JSON.stringify({ bancasVersion: 1, activeId: "master", bancas: [{ id: "master", ativo: "nasdaq", state: makeState(4, 2.5, 700, 999) }] });
    expect(extractMasterSyncValues(raw, ["nasdaq.params.mnq", "nasdaq.days.lotes", "nasdaq.params.saqueAprovada"])).toEqual({
      "nasdaq.params.mnq": [4],
      "nasdaq.days.lotes": [2.5],
    });
  });

  it("merges only authorized fields and preserves each account's financial history", () => {
    const raw = JSON.stringify({ bancasVersion: 1, activeId: "local", bancas: [{ id: "local", ativo: "nasdaq", state: makeState(1, 0.5, 150, 77) }] });
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

  it("updates only the recipient's active banca", () => {
    const raw = JSON.stringify({
      bancasVersion: 1,
      activeId: "local-active",
      bancas: [
        { id: "local-active", ativo: "nasdaq", state: makeState(1, 0.5, 150, 77) },
        { id: "local-other", ativo: "nasdaq", state: makeState(2, 0.75, 250, 88) },
      ],
    });
    const merged = applyMasterSyncValues(raw, { "nasdaq.params.mnq": [5] });
    expect(merged).not.toBeNull();
    const result = JSON.parse(merged!);
    expect(result.bancas[0].state.assets.nasdaq.params.mnq).toBe(5);
    expect(result.bancas[1].state.assets.nasdaq.params.mnq).toBe(2);
    expect(result.bancas[1].state.assets.nasdaq.params.saldoInicial).toBe(2000);
  });

  it("does not return a new document when values are unchanged", () => {
    const raw = JSON.stringify({ bancasVersion: 1, activeId: "local", bancas: [{ id: "local", ativo: "nasdaq", state: makeState(4, 2.5, 150, 77) }] });
    expect(applyMasterSyncValues(raw, { "nasdaq.params.mnq": [4], "nasdaq.days.lotes": [2.5] })).toBeNull();
  });

  it("preserves published Nasdaq fields when publishing Ouro next", () => {
    const nasdaq = mergePublishedValues({}, ["nasdaq.params.mnq", "ouro.params.mnq"], { "nasdaq.params.mnq": [4] });
    const ouro = mergePublishedValues(nasdaq, ["nasdaq.params.mnq", "ouro.params.mnq"], { "ouro.params.mnq": [9] });
    expect(ouro).toEqual({ "nasdaq.params.mnq": [4], "ouro.params.mnq": [9] });
  });

  it("preserves null gaps in Nasdaq days.mll when Ouro is published next", () => {
    const allowed = ["nasdaq.days.mll", "ouro.params.mnq"];
    const nasdaq = mergePublishedValues(
      {},
      allowed,
      { "nasdaq.days.mll": [1200, Number.NaN, 900, Number.NaN] },
    );
    // JSON storage serializes NaN array entries as null.
    const stored = JSON.parse(JSON.stringify(nasdaq));
    expect(stored["nasdaq.days.mll"]).toEqual([1200, null, 900, null]);
    const ouro = mergePublishedValues(stored, allowed, { "ouro.params.mnq": [9] });
    expect(ouro["nasdaq.days.mll"]).toEqual([1200, null, 900, null]);
    expect(ouro["ouro.params.mnq"]).toEqual([9]);
  });

  it("removes fields no longer present in allowed_fields", () => {
    expect(mergePublishedValues(
      { "nasdaq.params.mnq": [4], "ouro.params.mnq": [9] },
      ["ouro.params.mnq"],
      { "ouro.params.mnq": [10] },
    )).toEqual({ "ouro.params.mnq": [10] });
  });

});
