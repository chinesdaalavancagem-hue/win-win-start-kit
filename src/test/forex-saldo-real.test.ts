import { describe, expect, it } from "vitest";
import { aplicarDeposito, aplicarSaque, atualizarSaldoReal, defaultState, handleProfit } from "../lib/platform/engine";
import { aplicarForex, extrairForex } from "../lib/platform/bancas";

describe("saldo real e crédito Forex", () => {
  it("reduz o bônus segundo o percentual do saque sobre saldo com lucro", () => {
    const s = defaultState();
    aplicarDeposito(s, "ouro", 500);
    atualizarSaldoReal(s, 100);
    aplicarSaque(s, "ouro", 200);
    expect(s.forexSaldoReal).toBe(400);
    expect(s.assets.ouro.bonus.bonusAtual).toBeCloseTo(333.333333, 4);
    expect(s.assets.ouro.bonus.log.at(-1)?.proporcao).toBeCloseTo(1 / 3);
  });
  it("não saca valor superior ao saldo real nem altera o bônus", () => {
    const s = defaultState();
    aplicarDeposito(s, "ouro", 500);
    aplicarSaque(s, "ouro", 600);
    expect(s.forexSaldoReal).toBe(500);
    expect(s.assets.ouro.bonus.bonusAtual).toBe(500);
  });
  it("o saldo Forex é compartilhado entre bancas", () => {
    const s = defaultState();
    aplicarDeposito(s, "ouro", 500);
    atualizarSaldoReal(s, 100);
    const other = aplicarForex(defaultState(), extrairForex(s));
    expect(other.forexSaldoReal).toBe(600);
    expect(other.assets.ouro.bonus.bonusAtual).toBe(500);
  });
  it("Profit usa o valor real informado no saldo e consome crédito só depois do dinheiro real", () => {
    const s = defaultState();
    aplicarDeposito(s, "ouro", 100);
    handleProfit(s, "ouro", -120);
    expect(s.forexSaldoReal).toBe(0);
    expect(s.assets.ouro.bonus.bonusAtual).toBe(80);
  });
});