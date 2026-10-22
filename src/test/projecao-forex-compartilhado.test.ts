import { describe, expect, it } from "vitest";
import { projetarAportesFuturos } from "@/lib/platform/engine";

describe("projeção de aporte com Forex e teto único por ciclo", () => {
  it("não reutiliza o mesmo teto de bônus em dois dias futuros", () => {
    const dias = projetarAportesFuturos({
      necessidades: [100, 100], perdas: [100, 0],
      indiceAtual: 0, saldoReal: 0, bonusAtual: 0, bonusPct: 100, bonusCapRestante: 50,
    });
    expect(dias[0]).toMatchObject({ deposito: 50, bonusGanho: 50 });
    expect(dias[1]).toMatchObject({ deposito: 100, bonusGanho: 0 });
  });
  it("não debita nem concede bônus nos dias já concluídos", () => {
    const dias = projetarAportesFuturos({
      necessidades: [500, 100], perdas: [500, 0],
      indiceAtual: 1, saldoReal: 40, bonusAtual: 10, bonusPct: 100, bonusCapRestante: 20,
    });
    expect(dias[0]).toMatchObject({ deposito: 0, bonusGanho: 0 });
    expect(dias[1]).toMatchObject({ deposito: 30, bonusGanho: 20, saldoAntes: 50 });
  });
  it("separa perdas próprias e bônus no saldo projetado", () => {
    const dias = projetarAportesFuturos({
      necessidades: [150, 120], perdas: [130, 0],
      indiceAtual: 0, saldoReal: 100, bonusAtual: 50, bonusPct: 0, bonusCapRestante: 0,
    });
    expect(dias[0]!.deposito).toBe(0);
    expect(dias[1]!.proprioAntes).toBe(0);
    expect(dias[1]!.bonusAntes).toBe(20);
    expect(dias[1]!.deposito).toBe(100);
  });
});
