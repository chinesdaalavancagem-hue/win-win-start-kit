import { describe, expect, it } from "vitest";
import { defaultState, handleProfit, handleStop, historicoTotals } from "@/lib/platform/engine";
import { aplicarForex, extrairForex, novaBanca, parseBancas } from "@/lib/platform/bancas";

describe("saldo Forex compartilhado e operações por banca", () => {

  it("substitui a projeção pelo valor líquido realmente recebido no resultado histórico do ciclo", () => {
    const s = defaultState();
    s.log.push({ id: 91, ts: 1, asset: "ouro", day: 6, tipo: "aprovada", delta: 1700, saldoApos: 1700, saque: 1800, custoProprioCiclo: 1740.64, resultadoReal: 59.36 });
    s.payoutRegistros = { "91": { status: "recebido", valorRecebido: 1786, atualizadoEm: 2 } };
    expect(historicoTotals(s).profit).toBe(45.36);
  });
  it("mantém a projeção enquanto o payout ainda não foi recebido", () => {
    const s = defaultState();
    s.log.push({ id: 92, ts: 1, asset: "ouro", day: 7, tipo: "aprovada", delta: 1400, saldoApos: 1400, saque: 1800, custoProprioCiclo: 266.44, resultadoReal: 1533.56 });
    s.payoutRegistros = { "92": { status: "elegivel", atualizadoEm: 2 } };
    expect(historicoTotals(s).profit).toBe(1533.56);
  });
  it("propaga lucro real de uma banca às outras sem copiar histórico", () => {
    const a = novaBanca("Tradeify 1", defaultState());
    const b = novaBanca("Tradeify 2", defaultState());
    const doc = parseBancas(JSON.stringify({ bancasVersion: 1, activeId: a.id, bancas: [a, b] }));
    const active = aplicarForex(doc.bancas[0]!.state, doc.forex!);
    handleStop(active, "ouro", 200);
    const shared = extrairForex(active);
    const other = aplicarForex(doc.bancas[1]!.state, shared);
    expect(other.forexSaldoReal).toBe(active.forexSaldoReal);
    expect(other.forexSaldoReal).toBe(200);
    expect(other.log).toHaveLength(0);
    expect(active.log).toHaveLength(1);
  });
  it("propaga prejuízo real pela conta financeira geral sem adicionar operação em outra banca", () => {
    const first = defaultState();
    first.forexSaldoReal = 500;
    handleProfit(first, "ouro", -125);
    const second = aplicarForex(defaultState(), extrairForex(first));
    expect(first.forexSaldoReal).toBe(375);
    expect(second.forexSaldoReal).toBe(375);
    expect(second.log).toHaveLength(0);
  });
});