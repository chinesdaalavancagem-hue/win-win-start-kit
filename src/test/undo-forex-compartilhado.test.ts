import { describe, expect, it } from "vitest";
import { aplicarDeposito, defaultState, handleStop, undoLast, podeDesfazerUltimaOperacao } from "@/lib/platform/engine";
import { extrairForex, novaBanca, parseBancas, podeDesfazerBanca } from "@/lib/platform/bancas";

describe("proteção do saldo compartilhado entre bancas", () => {
  it("permite desfazer quando o snapshot da banca é o saldo global atual", () => {
    const a = novaBanca("Banca 1");
    const doc = parseBancas(JSON.stringify({ bancasVersion: 1, activeId: a.id, bancas: [a] }));
    // Sem operação registrada, não há nada a desfazer.
    expect(podeDesfazerBanca(doc, doc.bancas[0]!)).toBe(false);
  });
  it("bloqueia reversão antiga após movimentação financeira de outra banca", () => {
    const a = novaBanca("Banca 1");
    const b = novaBanca("Banca 2");
    const doc = parseBancas(JSON.stringify({ bancasVersion: 1, activeId: a.id, bancas: [a,b] }));
    const stateNovo = defaultState();
    handleStop(stateNovo, "ouro", 200);
    doc.forex = extrairForex(stateNovo);
    doc.bancas[1]!.state = stateNovo;
    expect(podeDesfazerBanca(doc, doc.bancas[0]!)).toBe(false);
    expect(podeDesfazerBanca(doc, doc.bancas[1]!)).toBe(true);
  });
  it("não reverte depósitos feitos após a operação da mesma banca", () => {
    const state = defaultState();
    handleStop(state, "ouro", 200);
    expect(podeDesfazerUltimaOperacao(state)).toBe(true);
    aplicarDeposito(state, "ouro", 100);
    expect(podeDesfazerUltimaOperacao(state)).toBe(false);
    const antes = structuredClone(state);
    undoLast(state);
    expect(state).toEqual(antes);
  });
  it("desfaz operação nova somente se o Forex permanecer inalterado", () => {
    const state = defaultState();
    handleStop(state, "ouro", 200);
    expect(podeDesfazerUltimaOperacao(state)).toBe(true);
    undoLast(state);
    expect(state.forexSaldoReal).toBe(0);
    expect(state.cfdBalance).toBe(0);
    expect(state.log).toHaveLength(0);
  });
  it("não desfaz registros legados sem assinatura de segurança", () => {
    const state = defaultState();
    handleStop(state, "ouro", 200);
    delete state.log[0]!.assinaturaForexApos;
    const antes = structuredClone(state);
    undoLast(state);
    expect(state).toEqual(antes);
  });
});
