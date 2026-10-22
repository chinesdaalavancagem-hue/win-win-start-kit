import { describe, expect, it } from "vitest";
import { aplicarDeposito, aplicarSaque, defaultState, parseValorFinanceiro } from "@/lib/platform/engine";

describe("integridade dos formulários financeiros", () => {
  it.each([
    ["1200,50", 1200.5],
    ["1.200,50", 1200.5],
    ["1200.50", 1200.5],
    ["825", 825],
    ["0", 0],
  ])("interpreta valores válidos %s", (raw, expected) => {
    expect(parseValorFinanceiro(raw)).toBe(expected);
  });
  it.each(["", "   ", "abc", "100abc", "Infinity", "NaN", "-5", "1.200.50", "1,200.50", "1e6"])(
    "rejeita entradas ambíguas ou inválidas %s", (raw) => {
      expect(parseValorFinanceiro(raw)).toBeNull();
    },
  );
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5, 0])(
    "não aceita depósito numérico inválido %s", (valor) => {
      const state = defaultState();
      const before = structuredClone(state);
      aplicarDeposito(state, "ouro", valor);
      expect(state).toEqual(before);
    },
  );
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5, 0])(
    "não aceita saque numérico inválido %s", (valor) => {
      const state = defaultState();
      aplicarDeposito(state, "ouro", 100);
      const before = structuredClone(state);
      aplicarSaque(state, "ouro", valor);
      expect(state).toEqual(before);
    },
  );
});