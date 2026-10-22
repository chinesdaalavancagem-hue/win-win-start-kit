import { describe, expect, it } from "vitest";
import { aplicarDeposito, aplicarSaque, defaultState } from "@/lib/platform/engine";

describe("saques no Forex compartilhado", () => {
  it("reduz proporcionalmente todas as parcelas de capital e bônus ao sacar", () => {
    const s = defaultState();
    aplicarDeposito(s, "ouro", 200);
    aplicarDeposito(s, "nasdaq", 300);
    expect(s.forexSaldoReal).toBe(500);
    aplicarSaque(s, "ouro", 100);
    expect(s.forexSaldoReal).toBe(400);
    expect(s.assets.ouro.bonus.deposito).toBeCloseTo(160);
    expect(s.assets.nasdaq.bonus.deposito).toBeCloseTo(240);
    expect(s.assets.ouro.bonus.bonusAtual).toBeCloseTo(160);
    expect(s.assets.nasdaq.bonus.bonusAtual).toBeCloseTo(240);
  });
  it("não modifica nada quando o saque excede o saldo real", () => {
    const s = defaultState();
    aplicarDeposito(s, "ouro", 100);
    const before = structuredClone(s);
    aplicarSaque(s, "ouro", 101);
    expect(s).toEqual(before);
  });
  it("preserva a proporção após lucros e saque parcial", () => {
    const s = defaultState();
    aplicarDeposito(s, "ouro", 100);
    s.forexSaldoReal = 200;
    aplicarSaque(s, "ouro", 50);
    expect(s.forexSaldoReal).toBe(150);
    expect(s.assets.ouro.bonus.deposito).toBeCloseTo(75);
    expect(s.assets.ouro.bonus.bonusAtual).toBeCloseTo(75);
  });
});