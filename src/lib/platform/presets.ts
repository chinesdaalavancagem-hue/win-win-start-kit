import type { Asset, AssetKey, State } from "@/lib/platform/engine";

export const PRESET_LABELS = ["Aprovação tradicional", "Reprovação tradicional", "Aprovação reduzida", "Reprovação reduzida"] as const;
export type PresetSlot = 0 | 1 | 2 | 3;
export interface StrategyPreset {
  label: string;
  updatedAt: string;
  params: Omit<Asset["params"], "saldoInicial" | "taxa">;
  days: Asset["days"];
  mesaFuturos?: Asset["mesaFuturos"];
  mesaConfig?: Asset["mesaConfig"];
  diasPorMesa?: Asset["diasPorMesa"];
  avaliacaoPorMesa?: Asset["avaliacaoPorMesa"];
}
/** Chave `${mesa}:${ativo}` para não misturar configurações de mesas diferentes. */
export type PresetStore = Record<string, Partial<Record<PresetSlot, StrategyPreset>>>;

export function capturePreset(asset: Asset, slot: PresetSlot): StrategyPreset {
  const { saldoInicial: _saldo, taxa: _taxa, ...params } = asset.params;
  return {
    label: PRESET_LABELS[slot], updatedAt: new Date().toISOString(),
    params: structuredClone(params), days: structuredClone(asset.days),
    mesaFuturos: asset.mesaFuturos,
    ...(asset.mesaConfig ? { mesaConfig: structuredClone(asset.mesaConfig) } : {}),
    ...(asset.diasPorMesa ? { diasPorMesa: structuredClone(asset.diasPorMesa) } : {}),
    ...(asset.avaliacaoPorMesa ? { avaliacaoPorMesa: structuredClone(asset.avaliacaoPorMesa) } : {}),
  };
}

export function isStrategyPreset(value: unknown): value is StrategyPreset {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<StrategyPreset>;
  return typeof p.label === "string" && typeof p.updatedAt === "string" &&
    !!p.params && typeof p.params === "object" &&
    Object.values(p.params).every((n) => typeof n === "number" ? Number.isFinite(n) : typeof n === "string") &&
    Array.isArray(p.days) && p.days.length <= 100 && p.days.every((d) =>
      d && typeof d.mnq === "number" && Number.isFinite(d.mnq) &&
      typeof d.lotes === "number" && Number.isFinite(d.lotes) &&
      typeof d.meta === "number" && Number.isFinite(d.meta));
}

/** Nunca substitui histórico, caixa, depósitos, taxa real da banca ou posição atual. */
export function applyPreset(state: State, key: AssetKey, preset: StrategyPreset): void {
  if (!isStrategyPreset(preset)) throw new Error("Preset inválido");
  const asset = state.assets[key];
  const { saldoInicial, taxa } = asset.params;
  asset.params = { ...asset.params, ...structuredClone(preset.params), saldoInicial, taxa };
  asset.days = structuredClone(preset.days);
  if (preset.mesaFuturos) asset.mesaFuturos = preset.mesaFuturos;
  if (preset.mesaConfig) asset.mesaConfig = structuredClone(preset.mesaConfig);
  if (preset.diasPorMesa) asset.diasPorMesa = structuredClone(preset.diasPorMesa);
  if (preset.avaliacaoPorMesa) asset.avaliacaoPorMesa = structuredClone(preset.avaliacaoPorMesa);
}
