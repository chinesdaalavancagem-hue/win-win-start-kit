import { describe, expect, it } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { desfechosPara, expectativaPonderada, simularDesfecho } from "@/lib/platform/simulador-cenarios";

describe("Laboratório isolado de cenários", () => {
  it("não altera o estado persistido ao projetar aprovação e reprovação", () => {
    const state = defaultState();
    const original = JSON.stringify(state);
    const opcoes = desfechosPara(state.assets.nasdaq, "nasdaq");
    const aprova = simularDesfecho(state, "nasdaq", opcoes[0]!);
    const reprova = simularDesfecho(state, "nasdaq", opcoes[1]!);
    expect(JSON.stringify(state)).toBe(original);
    expect(aprova.eventos.length).toBeGreaterThan(1);
    expect(reprova.eventos.some(x => x.operacao.includes("Mesa reprova"))).toBe(true);
    expect(reprova.payout).toBe(0);
  });

  it("distingue capital próprio, bônus não sacável e depósitos projetados", () => {
    const state = defaultState();
    state.assets.nasdaq.bonus.percentual = 150;
    state.assets.nasdaq.bonus.bonusCap = 300;
    state.forexSaldoReal = 0;
    const resultado = simularDesfecho(state, "nasdaq", desfechosPara(state.assets.nasdaq, "nasdaq")[1]!);
    expect(resultado.capitalDepositado).toBeGreaterThan(0);
    expect(resultado.saldoBonusFinal).toBeGreaterThanOrEqual(0);
    expect(resultado.eventos.some(x => x.fase === "Aporte CFD")).toBe(true);
    expect(resultado.alertas.some(x => x.includes("liquidação real"))).toBe(true);
  });

  it("projetar um saldo próprio inicial não cria lucro fictício", () => {
    const state = defaultState();
    state.assets.nasdaq.days = [];
    state.forexSaldoReal = 500;
    const resultado = simularDesfecho(state, "nasdaq", {id:"aprovou",titulo:"Aprovou",falhaNoDia:null});
    expect(resultado.resultadoEconomico).toBe(0);
  });

  it("normaliza pesos sem declarar probabilidades reais", () => {
    const resultados = [
      {resultadoEconomico:100}, {resultadoEconomico:-50}
    ] as Parameters<typeof expectativaPonderada>[0];
    expect(expectativaPonderada(resultados, [60,40])?.media).toBe(40);
    expect(expectativaPonderada(resultados, [30,20])?.normalizado).toBe(true);
    expect(expectativaPonderada(resultados, [0,0])).toBe(null);
  });
});
