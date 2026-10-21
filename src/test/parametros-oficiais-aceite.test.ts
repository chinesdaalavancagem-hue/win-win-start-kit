import { describe, expect, it } from "vitest";
import { novaBanca, parseBancas } from "@/lib/platform/bancas";

describe("aceite de parametros oficiais por banca", () => {
  it("preserva a revisao aceita ao carregar novamente da nuvem", () => {
    const primeira = { ...novaBanca("Nasdaq"), officialAcceptedAt: "2026-10-19T10:00:00.000Z" };
    const segunda = novaBanca("Ouro");
    const original = { bancasVersion: 1, activeId: primeira.id, bancas: [primeira, segunda] };
    const restaurado = parseBancas(JSON.stringify(original));
    expect(restaurado.bancas[0]?.officialAcceptedAt).toBe(primeira.officialAcceptedAt);
    expect(restaurado.bancas[1]?.officialAcceptedAt).toBeUndefined();
  });

  it("ignora marcadores de aceite que nao sao strings", () => {
    const banca = { ...novaBanca("Teste"), officialAcceptedAt: 42 };
    const restaurado = parseBancas(JSON.stringify({ bancasVersion: 1, activeId: banca.id, bancas: [banca] }));
    expect(restaurado.bancas[0]?.officialAcceptedAt).toBeUndefined();
  });
});
