import { describe, expect, it } from "vitest";
import { defaultState, normalizeState } from "@/lib/platform/engine";

describe("persistência do histórico de saques", () => {
  it("preserva payout recebido com ID numérico após normalizar o estado recarregado", () => {
    const estado = defaultState();
    estado.payoutRegistros = {
      "1732145678901": {
        status: "recebido",
        valorRecebido: 1786,
        atualizadoEm: 1732145680000,
      },
    };

    const recarregado = normalizeState(JSON.parse(JSON.stringify(estado)));

    expect(recarregado.payoutRegistros?.["1732145678901"]).toEqual({
      status: "recebido",
      valorRecebido: 1786,
      atualizadoEm: 1732145680000,
    });
  });
});
