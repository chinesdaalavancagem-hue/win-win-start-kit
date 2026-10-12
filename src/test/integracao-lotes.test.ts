import { describe, expect, it } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { resolveCfdLot } from "@/lib/integracao-lotes";

function stateWithGoldLot(lot: number) {
  const state = defaultState();
  state.activeTab = "ouro";
  const day = state.assets.ouro.days[0];
  if (!day) throw new Error("O estado padrão precisa ter o primeiro dia de Ouro.");
  day.lotes = lot;
  return state;
}

describe("resolveCfdLot com estado de bancas", () => {
  it("continua aceitando o formato antigo de estado único", () => {
    const state = stateWithGoldLot(0.42);

    expect(resolveCfdLot(state, "MGC")).toEqual({
      lot: 0.42,
      assetKey: "ouro",
      day: 1,
      error: null,
    });
  });

  it("usa a banca indicada por activeId quando há duas bancas", () => {
    const doc = {
      bancasVersion: 1,
      activeId: "banca-b",
      bancas: [
        { id: "banca-a", nome: "A", state: stateWithGoldLot(0.11) },
        { id: "banca-b", nome: "B", state: stateWithGoldLot(0.77) },
      ],
    };

    expect(resolveCfdLot(doc, "MGC")).toEqual({
      lot: 0.77,
      assetKey: "ouro",
      day: 1,
      error: null,
    });
  });

  it("usa a primeira banca quando activeId não existe", () => {
    const doc = {
      bancasVersion: 1,
      activeId: "id-inexistente",
      bancas: [
        { id: "banca-a", nome: "A", state: stateWithGoldLot(0.21) },
        { id: "banca-b", nome: "B", state: stateWithGoldLot(0.88) },
      ],
    };

    expect(resolveCfdLot(doc, "MGC")).toEqual({
      lot: 0.21,
      assetKey: "ouro",
      day: 1,
      error: null,
    });
  });

  it("resolve MGC como Ouro e retorna o lote de 0.30 no dia 1", () => {
    const state = stateWithGoldLot(0.30);

    expect(resolveCfdLot(JSON.stringify(state), "MGC")).toEqual({
      lot: 0.3,
      assetKey: "ouro",
      day: 1,
      error: null,
    });
  });

  it("retorna lot null e erro quando o estado não tem lote configurado", () => {
    const state = stateWithGoldLot(0);

    const result = resolveCfdLot(state, "MGC");
    expect(result.lot).toBeNull();
    expect(result.error).toMatch(/lote CFD do dia 1/i);
  });

  it("retorna erro controlado quando o estado não possui params", () => {
    const state = stateWithGoldLot(0.30);
    const { params, ...goldWithoutParams } = state.assets.ouro;
    const incomplete = { ...state, assets: { ...state.assets, ouro: goldWithoutParams } };

    expect(resolveCfdLot(incomplete, "MGC")).toEqual({
      lot: null,
      assetKey: null,
      day: null,
      error: "O estado salvo da plataforma está incompleto ou inválido.",
    });
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, 0.5])(
    "rejeita currentDayIndex inválido (%s) sem gerar dia NaN",
    (currentDayIndex) => {
      const state = stateWithGoldLot(0.30);
      const { currentDayIndex: previousIndex, ...attempt } = state.assets.ouro.attempt;
      const invalid = {
        ...state,
        assets: {
          ...state.assets,
          ouro: { ...state.assets.ouro, attempt: currentDayIndex === undefined ? attempt : { ...attempt, currentDayIndex } },
        },
      };

      expect(resolveCfdLot(invalid, "MGC")).toEqual({
        lot: null,
        assetKey: null,
        day: null,
        error: "O dia atual do ciclo ouro está ausente ou inválido.",
      });
    },
  );
});
