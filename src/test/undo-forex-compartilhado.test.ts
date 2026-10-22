import { describe, expect, it } from "vitest";
import { defaultState, handleStop } from "@/lib/platform/engine";
import { extrairForex, novaBanca, parseBancas, podeDesfazerBanca } from "@/lib/platform/bancas";

describe("proteção do saldo compartilhado entre bancas", () => {
  it("permite desfazer quando o snapshot da banca é o saldo global atual", () => {
    const a = novaBanca("Banca 1");
    const doc = parseBancas(JSON.stringify({ bancasVersion: 1, activeId: a.id, bancas: [a] }));
    expect(podeDesfazerBanca(doc, doc.bancas[0]!)).toBe(true);
  });
  it("bloqueia reversão antiga após movimentação financeira de outra banca", () => {
    const a = novaBanca("Banca 1");
    const b = novaBanca("Banca 2");
    const doc = parseBancas(JSON.stringify({ bancasVersion: 1, activeId: a.id, bancas: [a,b] }));
    const stateNovo = defaultState();
    handleStop(stateNovo, "ouro", 200);
    doc.forex = extrairForex(stateNovo);
    doc.bancas[1]!.state = stateNovo;
    expect(podeDesfazerBanca(doc, doc.bancas[0]!)).toBe(false);
    expect(podeDesfazerBanca(doc, doc.bancas[1]!)).toBe(true);
  });
});
