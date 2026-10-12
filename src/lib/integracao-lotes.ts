import { clampDayIndex, isValidState, normalizeState, type AssetKey, type State } from "@/lib/platform/engine";

export type CfdLotResolution =
  | { lot: number; assetKey: AssetKey; day: number; error: null }
  | { lot: null; assetKey: null; day: null; error: string };

/**
 * Resolve the CFD lot from the user's saved platform cycle.
 * Supabase JSON/JSONB may already be decoded to an object; legacy rows may be strings.
 * Tradovate contract quantity is intentionally not used as CFD volume.
 */
export function resolveCfdLot(rawState: unknown, symbol: string): CfdLotResolution {
  if (rawState == null || rawState === "") {
    return { lot: null, assetKey: null, day: null, error: "A plataforma ainda não tem um estado salvo." };
  }

  let parsed: unknown;
  if (typeof rawState === "string") {
    try {
      parsed = JSON.parse(rawState);
    } catch {
      return { lot: null, assetKey: null, day: null, error: "O estado salvo da plataforma não é um JSON válido." };
    }
  } else {
    parsed = rawState;
  }

  if (!isValidState(parsed)) {
    return { lot: null, assetKey: null, day: null, error: "O estado salvo da plataforma não contém os ciclos esperados." };
  }

  const state = normalizeState(parsed) as State;
  const mesa = symbol.trim().toUpperCase();
  let symbolAsset: "nasdaq" | "ouro" | null = null;

  if (mesa.startsWith("MNQ") || mesa.startsWith("NQ")) symbolAsset = "nasdaq";
  else if (mesa.startsWith("MGC") || mesa.startsWith("GC")) symbolAsset = "ouro";

  if (!symbolAsset) {
    return { lot: null, assetKey: null, day: null, error: `Não há ciclo de lote configurado para o ativo da mesa: ${symbol}.` };
  }

  // Saque 2 usa o ativo real escolhido pelo usuário, mas só quando a aba desse ciclo está ativa.
  let assetKey: AssetKey = symbolAsset;
  if (state.activeTab === "saque2") {
    const ativoReal = state.assets.saque2.params.ativoReal === "nasdaq" ? "nasdaq" : "ouro";
    if (ativoReal === symbolAsset) assetKey = "saque2";
  }

  const asset = state.assets[assetKey];
  const index = clampDayIndex(asset);
  const day = index >= 0 ? asset.days[index] : undefined;
  const lot = Number(day?.lotes);

  if (!Number.isFinite(lot) || lot <= 0) {
    return {
      lot: null,
      assetKey: null,
      day: null,
      error: `O lote CFD do dia ${Math.max(1, index + 1)} do ciclo ${assetKey} não está configurado (valor atual: ${String(day?.lotes ?? "ausente")}).`,
    };
  }

  return { lot, assetKey, day: index + 1, error: null };
}
