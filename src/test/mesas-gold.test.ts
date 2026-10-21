import { describe, expect, it } from "vitest";
import { defaultState, MESAS_FUTUROS, selecionarMesaGold } from "../lib/platform/engine";

describe("perfis Gold por mesa de futuros", () => {
  it("usa 2+5 dias na Lucid e 4+5 na MFF", () => {
    const gold = defaultState().assets.ouro;
    const original = structuredClone(gold.days);
    expect(original).toHaveLength(8);
    selecionarMesaGold(gold, "lucid");
    expect(gold.days).toHaveLength(7);
    expect(MESAS_FUTUROS.lucid.consistencia).toBe(50);
    selecionarMesaGold(gold, "mff");
    expect(gold.days).toHaveLength(9);
    expect(MESAS_FUTUROS.mff.consistencia).toBe(30);
    expect(gold.days[3]?.meta).toBe(original[2]?.meta);
    selecionarMesaGold(gold, "tradefive");
    expect(gold.days).toEqual(original);
  });

  it("mantém metas específicas e dados do histórico ao alternar", () => {
    const s = defaultState();
    const gold = s.assets.ouro;
    const antigo = structuredClone(s.log);
    selecionarMesaGold(gold, "lucid");
    gold.days[0]!.meta = 987;
    selecionarMesaGold(gold, "mff");
    selecionarMesaGold(gold, "lucid");
    expect(gold.days[0]?.meta).toBe(987);
    expect(s.log).toEqual(antigo);
  });
});
