import { describe, expect, it } from "vitest";
import { defaultState, historicoTotals } from "@/lib/platform/engine";
import { novaBanca, relatorioCsv } from "@/lib/platform/bancas";

describe("auditoria dos resultados por ciclo", () => {
  it("soma resultados registrados e não confunde custo com resultado", () => {
    const s = defaultState();
    s.log = [
      { id: 1, ts: 1, asset: "ouro", day: 1, tipo: "reprovada", delta: 150, saldoApos: 150, custoCiclo: 100, custoProprioCiclo: 100, resultadoReal: 150 },
      { id: 2, ts: 2, asset: "ouro", day: 8, tipo: "aprovada", delta: -250, saldoApos: -100, custoCiclo: 800, custoProprioCiclo: 500, resultadoReal: -250, saque: 1700 },
    ];
    expect(historicoTotals(s)).toEqual({ profit: -100, resultadoReal: -100, custoProprio: 600 });
    s.assets.ouro.params.saqueAprovada = 99999;
    expect(historicoTotals(s).profit).toBe(-100);
  });
  it("exporta o dia registrado sem somar um", () => {
    const b = novaBanca("Teste");
    b.state.log.push({ id: 1, ts: 1, asset: "ouro", day: 2, tipo: "profit", delta: -10, saldoApos: -10 });
    const csv = relatorioCsv([b]);
    expect(csv).toContain(";Gold;2;profit (avançou);");
    expect(csv).not.toContain(";Gold;3;profit (avançou);");
  });
});