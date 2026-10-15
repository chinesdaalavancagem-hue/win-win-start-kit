/** Campos de configuração que a Master pode compartilhar. Dados financeiros e históricos não entram nesta lista. */
export const MASTER_SYNC_FIELDS = [
  { id: "nasdaq.params.mnq", label: "Nasdaq · contratos MNQ", group: "Parâmetros" },
  { id: "nasdaq.params.hfm", label: "Nasdaq · valor por ponto", group: "Parâmetros" },
  { id: "nasdaq.params.mll", label: "Nasdaq · limite de perda (MLL)", group: "Parâmetros" },
  { id: "nasdaq.params.lucroDesejado", label: "Nasdaq · meta de lucro", group: "Parâmetros" },
  { id: "nasdaq.params.marginPerLot", label: "Nasdaq · margem por lote", group: "Parâmetros" },
  { id: "nasdaq.params.stopoutPct", label: "Nasdaq · stop-out (%)", group: "Parâmetros" },
  { id: "nasdaq.params.folgaExtraPct", label: "Nasdaq · folga extra (%)", group: "Parâmetros" },
  { id: "nasdaq.days.mnq", label: "Nasdaq · contratos por dia", group: "Plano diário" },
  { id: "nasdaq.days.lotes", label: "Nasdaq · lotes por dia", group: "Plano diário" },
  { id: "nasdaq.days.meta", label: "Nasdaq · meta por dia", group: "Plano diário" },
  { id: "nasdaq.days.mll", label: "Nasdaq · MLL personalizado por dia", group: "Plano diário" },
  { id: "ouro.params.mnq", label: "Ouro · contratos", group: "Parâmetros" },
  { id: "ouro.params.hfm", label: "Ouro · valor por ponto", group: "Parâmetros" },
  { id: "ouro.params.mll", label: "Ouro · limite de perda (MLL)", group: "Parâmetros" },
  { id: "ouro.params.lucroDesejado", label: "Ouro · meta de lucro", group: "Parâmetros" },
  { id: "ouro.params.marginPerLot", label: "Ouro · margem por lote", group: "Parâmetros" },
  { id: "ouro.params.stopoutPct", label: "Ouro · stop-out (%)", group: "Parâmetros" },
  { id: "ouro.params.folgaExtraPct", label: "Ouro · folga extra (%)", group: "Parâmetros" },
  { id: "ouro.days.mnq", label: "Ouro · contratos por dia", group: "Plano diário" },
  { id: "ouro.days.lotes", label: "Ouro · lotes por dia", group: "Plano diário" },
  { id: "ouro.days.meta", label: "Ouro · meta por dia", group: "Plano diário" },
  { id: "ouro.days.mll", label: "Ouro · MLL personalizado por dia", group: "Plano diário" },
  { id: "saque2.params.mnq", label: "Saque 2 · contratos", group: "Parâmetros" },
  { id: "saque2.params.hfm", label: "Saque 2 · valor por ponto", group: "Parâmetros" },
  { id: "saque2.params.mll", label: "Saque 2 · limite de perda (MLL)", group: "Parâmetros" },
  { id: "saque2.params.lucroDesejado", label: "Saque 2 · meta de lucro", group: "Parâmetros" },
  { id: "saque2.params.marginPerLot", label: "Saque 2 · margem por lote", group: "Parâmetros" },
  { id: "saque2.params.stopoutPct", label: "Saque 2 · stop-out (%)", group: "Parâmetros" },
  { id: "saque2.params.folgaExtraPct", label: "Saque 2 · folga extra (%)", group: "Parâmetros" },
  { id: "saque2.days.mnq", label: "Saque 2 · contratos por dia", group: "Plano diário" },
  { id: "saque2.days.lotes", label: "Saque 2 · lotes por dia", group: "Plano diário" },
  { id: "saque2.days.meta", label: "Saque 2 · meta por dia", group: "Plano diário" },
  { id: "saque2.days.mll", label: "Saque 2 · MLL personalizado por dia", group: "Plano diário" },
] as const;

export type MasterSyncField = typeof MASTER_SYNC_FIELDS[number]["id"];

export function extractMasterSyncValues(raw: string, allowedFields: string[]): Record<string, number[]> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const bancas = Array.isArray(parsed.bancas) ? parsed.bancas as Array<Record<string, unknown>> : [];
  const activeId = typeof parsed.activeId === "string" ? parsed.activeId : "";
  const active = bancas.find((b) => b.id === activeId) ?? bancas[0];
  const activeAsset = active?.ativo;
  const result: Record<string, number[]> = {};
  if (activeAsset !== "nasdaq" && activeAsset !== "ouro") return result;
  const state = (active?.state && typeof active.state === "object" ? active.state : parsed) as Record<string, unknown>;
  const assets = state.assets as Record<string, unknown> | undefined;
  const allowed = new Set<string>(MASTER_SYNC_FIELDS.map((f) => f.id));
  for (const field of allowedFields) {
    if (!allowed.has(field)) continue;
    const [assetKey, section, key] = field.split(".");
    if (!assetKey || assetKey !== activeAsset || !section || !key) continue;
    const asset = assets?.[assetKey] as Record<string, unknown> | undefined;
    if (section === "params") {
      const params = asset?.params as Record<string, unknown> | undefined;
      const value = params?.[key];
      if (typeof value === "number" && Number.isFinite(value)) result[field] = [value];
    } else if (section === "days") {
      const days = asset?.days;
      if (Array.isArray(days)) result[field] = days.map((day) => {
        const value = day && typeof day === "object" ? (day as Record<string, unknown>)[key] : undefined;
        return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
      });
    }
  }
  return result;
}

/** Atualiza somente os campos explicitamente publicados; nunca toca em log, depósitos, saques ou totais. */
export function applyMasterSyncValues(raw: string, values: Record<string, number[]>): string | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const bancas = Array.isArray(parsed.bancas) ? parsed.bancas as Array<Record<string, unknown>> : null;
    let changed = false;
    const applyState = (stateValue: unknown, activeAsset: unknown) => {
      if (activeAsset !== "nasdaq" && activeAsset !== "ouro") return;
      if (!stateValue || typeof stateValue !== "object") return;
      const state = stateValue as Record<string, unknown>;
      const assets = state.assets as Record<string, unknown> | undefined;
      if (!assets) return;
      for (const [field, incoming] of Object.entries(values)) {
        if (!MASTER_SYNC_FIELDS.some((f) => f.id === field) || !Array.isArray(incoming)) continue;
        const [assetKey, section, key] = field.split(".");
        if (!assetKey || assetKey !== activeAsset || !section || !key) continue;
        const asset = assets[assetKey] as Record<string, unknown> | undefined;
        if (!asset) continue;
        if (section === "params") {
          const params = asset.params as Record<string, unknown> | undefined;
          if (params && typeof incoming[0] === "number" && Number.isFinite(incoming[0]) && params[key] !== incoming[0]) {
            params[key] = incoming[0]; changed = true;
          }
        } else if (section === "days" && Array.isArray(asset.days)) {
          const days = asset.days as Array<Record<string, unknown>>;
          for (let i = 0; i < Math.min(days.length, incoming.length); i++) {
            const value = incoming[i];
            const day = days[i];
            if (typeof value === "number" && Number.isFinite(value) && day && day[key] !== value) {
              day[key] = value; changed = true;
            }
          }
        }
      }
    };
    if (bancas) {
      // A publicação vem da banca ativa da Master; no destinatário, altera somente
      // a banca ativa. Nunca espalha os mesmos parâmetros por todas as bancas locais.
      const activeId = typeof parsed.activeId === "string" ? parsed.activeId : "";
      const active = bancas.find((b) => b.id === activeId) ?? bancas[0];
      if (active) applyState(active.state, active.ativo);
    } else {
      applyState(parsed, undefined);
    }
    return changed ? JSON.stringify(parsed) : null;
  } catch {
    return null;
  }
}


/** True only when the Master document has an explicit supported asset on its active banca. */
export function hasMasterSyncAsset(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const bancas = Array.isArray(parsed.bancas) ? parsed.bancas as Array<Record<string, unknown>> : [];
    const activeId = typeof parsed.activeId === "string" ? parsed.activeId : "";
    const active = bancas.find((b) => b.id === activeId) ?? bancas[0];
    return active?.ativo === "nasdaq" || active?.ativo === "ouro";
  } catch {
    return false;
  }
}

/** Retain still-authorized published fields, then overwrite them with the latest extraction. */
export function mergePublishedValues(
  existing: unknown,
  allowedFields: string[],
  extracted: Record<string, number[]>,
): Record<string, number[]> {
  const allowed = new Set(allowedFields);
  const merged: Record<string, Array<number | null>> = {};
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [field, value] of Object.entries(existing as Record<string, unknown>)) {
      if (allowed.has(field) && Array.isArray(value) && value.every((n) => n === null || (typeof n === "number" && Number.isFinite(n)))) {
        merged[field] = value as Array<number | null>;
      }
    }
  }
  for (const [field, value] of Object.entries(extracted)) {
    if (allowed.has(field)) merged[field] = value;
  }
  return merged;
}
