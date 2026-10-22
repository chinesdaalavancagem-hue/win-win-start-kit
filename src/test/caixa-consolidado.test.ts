import { describe, expect, it } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { novaBanca } from "@/lib/platform/bancas";
import { calcularCoberturaSimultanea } from "@/lib/platform/caixa-consolidado";

describe("margem simultânea de múltiplas bancas com Forex único", () => {
  const setup = () => {
    const a = novaBanca("A");
    const b = novaBanca("B");
    b.mesa = "mff";
    for (const banca of [a, b]) {
      const gold = banca.state.assets.ouro;
      gold.attempt.currentDayIndex = 0;
      gold.days[0]!.lotes = 1;
      gold.days[0]!.meta = 0;
      gold.params.marginPerLot = 100;
      gold.params.stopoutPct = 50;
    }
    const estadoAtivo = defaultState();
    estadoAtivo.assets.ouro.days[0]!.lotes = 1;
    estadoAtivo.assets.ouro.days[0]!.meta = 0;
    estadoAtivo.assets.ouro.params.marginPerLot = 100;
    estadoAtivo.assets.ouro.params.stopoutPct = 50;
    estadoAtivo.forexSaldoReal = 100;
    estadoAtivo.assets.ouro.bonus.bonusAtual = 50;
    return { a, b, estadoAtivo };
  };

  it("deduz os mesmos 150 de Forex uma vez, mesmo selecionando duas mesas", () => {
    const { a, b, estadoAtivo } = setup();
    const c = calcularCoberturaSimultanea({
      bancas: [a, b], ativosPorBanca: { [a.id]: "ouro", [b.id]: "ouro" },
      bancaAtivaId: a.id, estadoAtivo, bonusPct: 0, bonusCapRestante: 0,
    });
    expect(c.linhas).toHaveLength(2);
    expect(c.necessario).toBe(300);
    expect(c.disponivel).toBe(150);
    expect(c.aporteSemBonusNovo).toBe(150);
    expect(c.aporteComBonusNovo).toBe(150);
  });

  it("não soma bancas que não foram selecionadas pelo usuário", () => {
    const { a, b, estadoAtivo } = setup();
    const c = calcularCoberturaSimultanea({
      bancas: [a, b], ativosPorBanca: { [a.id]: "ouro" },
      bancaAtivaId: a.id, estadoAtivo, bonusPct: 100, bonusCapRestante: 100,
    });
    expect(c.necessario).toBe(150);
    expect(c.falta).toBe(0);
    expect(c.aporteComBonusNovo).toBe(0);
  });

  it("considera bônus novo uma vez só, até o teto da corretora", () => {
    const { a, b, estadoAtivo } = setup();
    const c = calcularCoberturaSimultanea({
      bancas: [a, b], ativosPorBanca: { [a.id]: "ouro", [b.id]: "ouro" },
      bancaAtivaId: a.id, estadoAtivo, bonusPct: 100, bonusCapRestante: 40,
    });
    expect(c.falta).toBe(150);
    expect(c.aporteComBonusNovo).toBe(110);
  });

  it("utiliza parâmetros atuais da banca ativa, não o snapshot antigo", () => {
    const { a, estadoAtivo } = setup();
    estadoAtivo.assets.ouro.params.marginPerLot = 200;
    const c = calcularCoberturaSimultanea({
      bancas: [a], ativosPorBanca: { [a.id]: "ouro" },
      bancaAtivaId: a.id, estadoAtivo, bonusPct: 0, bonusCapRestante: 0,
    });
    expect(c.necessario).toBe(300);
    expect(c.falta).toBe(150);
  });
});
