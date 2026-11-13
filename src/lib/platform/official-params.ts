import { idMesaPersonalizada, validarMesaPersonalizada, type MesaPersonalizada } from "./mesas-personalizadas";
import type { AssetKey, State, MesaFuturos } from "@/lib/platform/engine";

export const OFFICIAL_PARAMS_FORMAT = "win-or-win-official-parameters";
const ASSETS: AssetKey[] = ["nasdaq", "ouro", "saque2"];
const PARAM_FIELDS = ["mnq", "hfm", "mll", "taxa", "lucroDesejado", "marginPerLot", "stopoutPct", "saqueAprovada", "folgaExtraPct"] as const;
const DAY_FIELDS = ["mnq", "lotes", "meta"] as const;

type OfficialDay = { mnq: number; vestExposicaoUsd?: number; lotes: number; meta: number; mll?: number };
export type OfficialParamsPayload = {
  format: typeof OFFICIAL_PARAMS_FORMAT;
  version: 1;
  exportedAt: string;
  mesaFuturos?: MesaFuturos;
  assets: Record<AssetKey, { params: Record<string, unknown>; days: OfficialDay[]; mesaConfig?: MesaPersonalizada; avaliacaoDias?: number }>;
};

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Monta o JSON oficial: só parâmetros e plano diário, nunca saldos, depósitos, histórico ou logs. */
export function buildOfficialParams(state: State, exportedAt = new Date().toISOString(), mesaFuturos?: MesaFuturos): OfficialParamsPayload {
  const assets = Object.fromEntries(ASSETS.map((key) => {
    const { vestAlavancagem, vestPrecoIndice, splitPct = 90, comissaoPorContrato = 0, ativoReal, mnq, hfm, mll, taxa, lucroDesejado, marginPerLot, stopoutPct, saqueAprovada, folgaExtraPct } = state.assets[key].params;
    return [key, {
      ...(mesaFuturos === "vest" ? {avaliacaoDias: key === "saque2" ? 0 : state.assets[key].avaliacaoPorMesa?.vest ?? 1} : {}),
      ...(state.assets[key].mesaConfig ? {mesaConfig: structuredClone(state.assets[key].mesaConfig), avaliacaoDias: state.assets[key].avaliacaoPorMesa?.[mesaFuturos!] ?? (key === "saque2" ? 0 : state.assets[key].mesaConfig!.avaliacao)} : {}),
      params: { ...(vestAlavancagem !== undefined ? {vestAlavancagem} : {}), ...(vestPrecoIndice !== undefined ? {vestPrecoIndice} : {}), splitPct, comissaoPorContrato, mnq, hfm, mll, taxa, lucroDesejado, marginPerLot, stopoutPct, saqueAprovada, folgaExtraPct, ...(ativoReal ? { ativoReal } : {}) },
      days: state.assets[key].days.map(({ mnq, lotes, meta, mll, vestExposicaoUsd }) => ({ mnq, lotes, meta, ...(typeof vestExposicaoUsd === "number" ? { vestExposicaoUsd } : {}), ...(typeof mll === "number" ? { mll } : {}) })),
    }];
  })) as unknown as OfficialParamsPayload["assets"];
  return { format: OFFICIAL_PARAMS_FORMAT, version: 1, exportedAt, ...(mesaFuturos ? { mesaFuturos } : {}), assets };
}

export function isOfficialParams(payload: unknown): payload is OfficialParamsPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as { format?: unknown; version?: unknown; assets?: Record<string, unknown> };
  if (p.format !== OFFICIAL_PARAMS_FORMAT || p.version !== 1 || !p.assets || typeof p.assets !== "object") return false;
  const mesa = (payload as { mesaFuturos?: unknown }).mesaFuturos;
  if (mesa !== undefined && mesa !== "tradefive" && mesa !== "lucid" && mesa !== "mff" && mesa !== "topstep" && mesa !== "vest" && !idMesaPersonalizada(mesa)) return false;
  return ASSETS.every((key) => {
    const asset = p.assets![key] as { params?: unknown; days?: unknown; mesaConfig?: MesaPersonalizada; avaliacaoDias?: number } | undefined;
    const params = asset?.params as Record<string, unknown> | undefined;
    if (idMesaPersonalizada(mesa) && (!asset?.mesaConfig || validarMesaPersonalizada(asset.mesaConfig) || asset.mesaConfig.id !== mesa || !Number.isInteger(asset.avaliacaoDias) || asset.avaliacaoDias! < 0 || !Array.isArray(asset.days) || asset.avaliacaoDias! > asset.days.length)) return false;
    if (mesa === "vest" && asset?.avaliacaoDias !== undefined && (!Number.isInteger(asset.avaliacaoDias) || asset.avaliacaoDias < 0 || !Array.isArray(asset.days) || asset.avaliacaoDias > asset.days.length)) return false;
    if (!idMesaPersonalizada(mesa) && asset?.mesaConfig !== undefined) return false;
    return !!asset && !!params && typeof params === "object" &&
      PARAM_FIELDS.every((f) => isNum(params[f])) &&
      (params.vestAlavancagem === undefined || (isNum(params.vestAlavancagem) && Number.isInteger(params.vestAlavancagem) && (params.vestAlavancagem as number) >= 1 && (params.vestAlavancagem as number) <= (key === "nasdaq" || (key === "saque2" && params.ativoReal === "nasdaq") ? 50 : 25))) &&
      (params.vestPrecoIndice === undefined || (isNum(params.vestPrecoIndice) && (params.vestPrecoIndice as number) >= 0)) &&
      (params.splitPct === undefined || (isNum(params.splitPct) && (params.splitPct as number) >= 0 && (params.splitPct as number) <= 100)) &&
      (params.comissaoPorContrato === undefined || (isNum(params.comissaoPorContrato) && (params.comissaoPorContrato as number) >= 0)) &&
      (params.ativoReal === undefined || params.ativoReal === "ouro" || params.ativoReal === "nasdaq") &&
      Array.isArray(asset.days) && asset.days.every((day) => {
        if (!day || typeof day !== "object") return false;
        const d = day as Record<string, unknown>;
        return DAY_FIELDS.every((f) => isNum(d[f])) && (d.vestExposicaoUsd === undefined || (isNum(d.vestExposicaoUsd) && (d.vestExposicaoUsd as number) >= 0)) && (d.mll === undefined || isNum(d.mll));
      });
  });
}

/** Aplica somente os campos oficiais conhecidos; chaves extras do arquivo (ex.: saldoInicial) são ignoradas. */
export function applyOfficialParams(current: State, payload: OfficialParamsPayload, onlyAsset?: AssetKey): void {
  for (const key of onlyAsset ? [onlyAsset] : ASSETS) {
    const incoming = payload.assets[key];
    if (payload.mesaFuturos === "vest") { current.assets[key].vestVersion = 1; current.assets[key].mesaFuturos = "vest"; current.assets[key].avaliacaoPorMesa = {...current.assets[key].avaliacaoPorMesa, vest: incoming.avaliacaoDias ?? (key === "saque2" ? 0 : 1)}; }
    if (incoming.mesaConfig && !validarMesaPersonalizada(incoming.mesaConfig) && incoming.mesaConfig.id === payload.mesaFuturos) {
      current.assets[key].mesaConfig = structuredClone(incoming.mesaConfig);
      current.assets[key].mesaFuturos = incoming.mesaConfig.id;
      current.assets[key].avaliacaoPorMesa = {...current.assets[key].avaliacaoPorMesa, [incoming.mesaConfig.id]: incoming.avaliacaoDias ?? incoming.mesaConfig.avaliacao};
    }
    const picked: Record<string, unknown> = {};
    for (const f of PARAM_FIELDS) {
      // A taxa é o custo real pago por cada banca e não pode ser substituída por JSON oficial.
      if (f !== "taxa") picked[f] = incoming.params[f];
    }
    if (isNum(incoming.params.vestAlavancagem) && Number.isInteger(incoming.params.vestAlavancagem) && (incoming.params.vestAlavancagem as number) >= 1 && (incoming.params.vestAlavancagem as number) <= (key === "nasdaq" || (key === "saque2" && incoming.params.ativoReal === "nasdaq") ? 50 : 25)) picked.vestAlavancagem = incoming.params.vestAlavancagem;
    if (isNum(incoming.params.vestPrecoIndice) && (incoming.params.vestPrecoIndice as number) >= 0) picked.vestPrecoIndice = incoming.params.vestPrecoIndice;
    if (isNum(incoming.params.splitPct) && (incoming.params.splitPct as number) >= 0 && (incoming.params.splitPct as number) <= 100) picked.splitPct = incoming.params.splitPct;
    // Publicações antigas sem comissão preservam a configuração local.
    if (isNum(incoming.params.comissaoPorContrato) && (incoming.params.comissaoPorContrato as number) >= 0) picked.comissaoPorContrato = incoming.params.comissaoPorContrato;
    if (incoming.params.ativoReal !== undefined) picked.ativoReal = incoming.params.ativoReal;
    current.assets[key].params = { ...current.assets[key].params, ...picked } as State["assets"]["nasdaq"]["params"];
    current.assets[key].days = incoming.days.map(({ mnq, lotes, meta, mll, vestExposicaoUsd }) => ({ mnq, lotes, meta, ...(typeof vestExposicaoUsd === "number" ? { vestExposicaoUsd } : {}), ...(typeof mll === "number" ? { mll } : {}) }));
  }
}

