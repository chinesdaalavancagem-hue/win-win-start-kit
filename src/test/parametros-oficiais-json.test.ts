import { describe, expect, it } from "vitest";
import { defaultState, type State } from "@/lib/platform/engine";
import { OFFICIAL_PARAMS_FORMAT, applyOfficialParams, buildOfficialParams, isOfficialParams } from "@/lib/platform/official-params";

function masterState(): State {
  const s = defaultState();
  s.assets.nasdaq.params.mnq = 7;
  s.assets.nasdaq.params.saldoInicial = 9999;
  s.assets.nasdaq.days = [{ mnq: 7, lotes: 3.5, meta: 1800, mll: 1500 }, { mnq: 6, lotes: 2, meta: 1200 }] as State["assets"]["nasdaq"]["days"];
  s.assets.ouro.params.marginPerLot = 900;
  s.assets.nasdaq.bonus.deposito = 5000;
  s.cfdBalance = 12345;
  s.log = [{ id: 1, ts: 1, asset: "nasdaq", day: 0, tipo: "aprovada", delta: 500, saldoApos: 2500 }];
  return s;
}

function commonState(): State {
  const s = defaultState();
  s.assets.nasdaq.params.saldoInicial = 2100;
  s.assets.ouro.params.saldoInicial = 2300;
  s.assets.nasdaq.bonus.deposito = 300;
  s.assets.nasdaq.bonus.log = [{ tipo: "deposito", valor: 300 }] as State["assets"]["nasdaq"]["bonus"]["log"];
  s.cfdBalance = 777;
  s.totalGasto = 450;
  s.counts = { aprovadas: 2, reprovadas: 1 };
  s.log = [{ id: 42, ts: 10, asset: "ouro", day: 1, tipo: "reprovada", delta: -100, saldoApos: 677 }];
  return s;
}

const roundTrip = (s: State) => JSON.parse(JSON.stringify(buildOfficialParams(s, "2026-01-01T00:00:00.000Z")));

describe("JSON oficial de parâmetros", () => {
  it("exporta o formato v1 com params e dias, sem saldo, depósitos, CFD nem histórico", () => {
    const payload = roundTrip(masterState());
    expect(payload.format).toBe(OFFICIAL_PARAMS_FORMAT);
    expect(payload.version).toBe(1);
    expect(Object.keys(payload.assets).sort()).toEqual(["nasdaq", "ouro", "saque2"]);
    expect(payload.assets.nasdaq.params.mnq).toBe(7);
    expect(payload.assets.nasdaq.params.saldoInicial).toBeUndefined();
    expect(payload.assets.nasdaq.days[0]).toEqual({ mnq: 7, lotes: 3.5, meta: 1800, mll: 1500 });
    expect(Object.keys(payload).sort()).toEqual(["assets", "exportedAt", "format", "version"]);
    const text = JSON.stringify(payload);
    expect(text).not.toContain("bonus");
    expect(text).not.toContain("deposito");
    expect(text).not.toContain("cfdBalance");
    expect(text).not.toContain("12345");
    expect(text).not.toContain("9999");
    expect(isOfficialParams(payload)).toBe(true);
  });

  it("rejeita arquivos inválidos ou incompletos", () => {
    const valid = roundTrip(masterState());
    const clone = () => JSON.parse(JSON.stringify(valid));
    expect(isOfficialParams(null)).toBe(false);
    expect(isOfficialParams("texto")).toBe(false);
    expect(isOfficialParams({ ...clone(), format: "outro" })).toBe(false);
    expect(isOfficialParams({ ...clone(), version: 2 })).toBe(false);
    const semOuro = clone(); delete semOuro.assets.ouro;
    expect(isOfficialParams(semOuro)).toBe(false);
    const semCampo = clone(); delete semCampo.assets.nasdaq.params.mll;
    expect(isOfficialParams(semCampo)).toBe(false);
    const texto = clone(); texto.assets.nasdaq.params.mnq = "7";
    expect(isOfficialParams(texto)).toBe(false);
    const diaRuim = clone(); diaRuim.assets.ouro.days[0].lotes = null;
    expect(isOfficialParams(diaRuim)).toBe(false);
    const semDias = clone(); semDias.assets.saque2.days = "x";
    expect(isOfficialParams(semDias)).toBe(false);
    const ativoRuim = clone(); ativoRuim.assets.saque2.params.ativoReal = "btc";
    expect(isOfficialParams(ativoRuim)).toBe(false);
  });

  it("importa params e dias e preserva saldo inicial, CFD, histórico, depósitos e logs", () => {
    const payload = roundTrip(masterState());
    const s = commonState();
    const before = JSON.parse(JSON.stringify(s));
    applyOfficialParams(s, payload);
    expect(s.assets.nasdaq.params.mnq).toBe(7);
    expect(s.assets.ouro.params.marginPerLot).toBe(900);
    expect(s.assets.nasdaq.days).toEqual([{ mnq: 7, lotes: 3.5, meta: 1800, mll: 1500 }, { mnq: 6, lotes: 2, meta: 1200 }]);
    expect(s.assets.nasdaq.params.saldoInicial).toBe(2100);
    expect(s.assets.ouro.params.saldoInicial).toBe(2300);
    expect(s.cfdBalance).toBe(777);
    expect(s.totalGasto).toBe(450);
    expect(s.counts).toEqual({ aprovadas: 2, reprovadas: 1 });
    expect(s.log).toEqual(before.log);
    expect(s.assets.nasdaq.bonus).toEqual(before.assets.nasdaq.bonus);
    expect(s.assets.nasdaq.attempt).toEqual(before.assets.nasdaq.attempt);
  });

  it("ignora campos pessoais injetados no arquivo (saldoInicial, chaves extras)", () => {
    const payload = roundTrip(masterState());
    payload.assets.nasdaq.params.saldoInicial = 1;
    payload.assets.nasdaq.params.cfdBalance = 1;
    payload.assets.nasdaq.days[0].extra = "x";
    expect(isOfficialParams(payload)).toBe(true);
    const s = commonState();
    applyOfficialParams(s, payload);
    expect(s.assets.nasdaq.params.saldoInicial).toBe(2100);
    expect((s.assets.nasdaq.params as unknown as Record<string, unknown>).cfdBalance).toBeUndefined();
    expect((s.assets.nasdaq.days[0] as unknown as Record<string, unknown>).extra).toBeUndefined();
    expect(s.cfdBalance).toBe(777);
  });
});
