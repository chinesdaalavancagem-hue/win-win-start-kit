import type { AssetKey, State, MesaFuturos } from "@/lib/platform/engine";

export const OFFICIAL_PARAMS_FORMAT = "win-or-win-official-parameters";
const ASSETS: AssetKey[] = ["nasdaq", "ouro", "saque2"];
const PARAM_FIELDS = ["mnq", "hfm", "mll", "taxa", "lucroDesejado", "marginPerLot", "stopoutPct", "saqueAprovada", "folgaExtraPct"] as const;
const DAY_FIELDS = ["mnq", "lotes", "meta"] as const;

type OfficialDay = { mnq: number; lotes: number; meta: number; mll?: number };
export type OfficialParamsPayload = {
  format: typeof OFFICIAL_PARAMS_FORMAT;
  version: 1;
  exportedAt: string;
  mesaFuturos?: MesaFuturos;
  assets: Record<AssetKey, { params: Record<string, unknown>; days: OfficialDay[] }>;
};

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Monta o JSON oficial: só parâmetros e plano diário, nunca saldos, depósitos, histórico ou logs. */
export function buildOfficialParams(state: State, exportedAt = new Date().toISOString(), mesaFuturos?: MesaFuturos): OfficialParamsPayload {
  const assets = Object.fromEntries(ASSETS.map((key) => {
    const { ativoReal, mnq, hfm, mll, taxa, lucroDesejado, marginPerLot, stopoutPct, saqueAprovada, folgaExtraPct } = state.assets[key].params;
    return [key, {
      params: { mnq, hfm, mll, taxa, lucroDesejado, marginPerLot, stopoutPct, saqueAprovada, folgaExtraPct, ...(ativoReal ? { ativoReal } : {}) },
      days: state.assets[key].days.map(({ mnq, lotes, meta, mll }) => ({ mnq, lotes, meta, ...(typeof mll === "number" ? { mll } : {}) })),
    }];
  })) as unknown as OfficialParamsPayload["assets"];
  return { format: OFFICIAL_PARAMS_FORMAT, version: 1, exportedAt, ...(mesaFuturos ? { mesaFuturos } : {}), assets };
}

export function isOfficialParams(payload: unknown): payload is OfficialParamsPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as { format?: unknown; version?: unknown; assets?: Record<string, unknown> };
  if (p.format !== OFFICIAL_PARAMS_FORMAT || p.version !== 1 || !p.assets || typeof p.assets !== "object") return false;
  const mesa = (payload as { mesaFuturos?: unknown }).mesaFuturos;
  if (mesa !== undefined && mesa !== "tradefive" && mesa !== "lucid" && mesa !== "mff" && mesa !== "topstep") return false;
  return ASSETS.every((key) => {
    const asset = p.assets![key] as { params?: unknown; days?: unknown } | undefined;
    const params = asset?.params as Record<string, unknown> | undefined;
    return !!asset && !!params && typeof params === "object" &&
      PARAM_FIELDS.every((f) => isNum(params[f])) &&
      (params.ativoReal === undefined || params.ativoReal === "ouro" || params.ativoReal === "nasdaq") &&
      Array.isArray(asset.days) && asset.days.every((day) => {
        if (!day || typeof day !== "object") return false;
        const d = day as Record<string, unknown>;
        return DAY_FIELDS.every((f) => isNum(d[f])) && (d.mll === undefined || isNum(d.mll));
      });
  });
}

/** Aplica somente os campos oficiais conhecidos; chaves extras do arquivo (ex.: saldoInicial) são ignoradas. */
export function applyOfficialParams(current: State, payload: OfficialParamsPayload, onlyAsset?: AssetKey): void {
  for (const key of onlyAsset ? [onlyAsset] : ASSETS) {
    const incoming = payload.assets[key];
    const picked: Record<string, unknown> = {};
    for (const f of PARAM_FIELDS) {
      // A taxa é o custo real pago por cada banca e não pode ser substituída por JSON oficial.
      if (f !== "taxa") picked[f] = incoming.params[f];
    }
    if (incoming.params.ativoReal !== undefined) picked.ativoReal = incoming.params.ativoReal;
    current.assets[key].params = { ...current.assets[key].params, ...picked } as State["assets"]["nasdaq"]["params"];
    current.assets[key].days = incoming.days.map(({ mnq, lotes, meta, mll }) => ({ mnq, lotes, meta, ...(typeof mll === "number" ? { mll } : {}) }));
  }
}
