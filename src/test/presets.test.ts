import { describe, expect, it } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { applyPreset, capturePreset, isStrategyPreset, mesclarPresets } from "@/lib/platform/presets";
import { novaBanca, parseBancas } from "@/lib/platform/bancas";

describe("presets de estratégia", () => {
  it("restaura plano sem alterar saldos, taxa, depósitos ou histórico", () => {
    const state = defaultState();
    const asset = state.assets.ouro;
    asset.params.taxa = 142.5;
    const preset = capturePreset(asset, 0);
    expect(isStrategyPreset(preset)).toBe(true);
    const originals = structuredClone({ params: asset.params, days: asset.days });
    asset.params.mll = 300;
    asset.params.taxa = 250;
    asset.days[0]!.meta = 999;
    asset.bonus.deposito = 88;
    state.log.push({ id: 1, ts: 1, asset: "ouro", day: 0, tipo: "profit", delta: 2, saldoApos: 2 });
    state.forexSaldoReal = 88;
    applyPreset(state, "ouro", preset);
    expect(asset.params.mll).toBe(originals.params.mll);
    expect(asset.params.taxa).toBe(250);
    expect(asset.days).toEqual(originals.days);
    expect(asset.bonus.deposito).toBe(88);
    expect(state.log).toHaveLength(1);
    expect(state.forexSaldoReal).toBe(88);
  });

  it("captura cópia independente e rejeita dados inválidos", () => {
    const state = defaultState();
    const preset = capturePreset(state.assets.nasdaq, 2);
    state.assets.nasdaq.days[0]!.meta = 123456;
    expect(preset.days[0]!.meta).not.toBe(123456);
    expect(isStrategyPreset({ ...preset, days: [{ meta: Infinity, lotes: 1, mnq: 1 }] })).toBe(false);
  });
  it("recupera presets de uma banca antiga e disponibiliza nas outras bancas", () => {
    const antiga = novaBanca("Lucid - conta 03");
    antiga.mesa = "lucid";
    const nova = novaBanca("Lucid - conta 04");
    nova.mesa = "lucid";
    const preset = capturePreset(antiga.state.assets.nasdaq, 0);
    antiga.state.presets = { "lucid:nasdaq": { 0: preset } };
    const doc = parseBancas(JSON.stringify({ bancasVersion: 1, activeId: nova.id, mesaAtiva: "lucid", bancas: [antiga, nova] }));
    expect(doc.presets?.["lucid:nasdaq"]?.[0]).toEqual(preset);
    expect(mesclarPresets(nova.state.presets, doc.presets)["lucid:nasdaq"]?.[0]).toEqual(preset);
    expect(doc.bancas[1]!.state.presets).toBeUndefined(); // dados da outra banca não são reescritos
  });
});
