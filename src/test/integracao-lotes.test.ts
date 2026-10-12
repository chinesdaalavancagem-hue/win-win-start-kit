import { describe, expect, it } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { resolveCfdLot } from "@/lib/integracao-lotes";

function stateWithGoldLot(lot: number) {
  const state = defaultState();
  state.activeTab = "ouro";
  state.assets.ouro.days[0]!.lotes = lot;
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
});
