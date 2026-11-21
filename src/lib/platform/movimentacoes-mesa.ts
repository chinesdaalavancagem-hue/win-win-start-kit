import type { AssetKey, State } from "@/lib/platform/engine";

/** Controle informativo do resultado real na mesa. Nunca alimenta cálculos operacionais. */
export type AtivoMesa = "ouro" | "nasdaq";
export interface MovimentacaoMesa {
  id: string; data: string; ativo: AtivoMesa; ciclo: number; dia?: string; resultado: number; obs?: string; criadoEm: number;
}
export interface MovimentacoesMesaStore { versao: 1; lancamentos: MovimentacaoMesa[]; /** Saldo base por `${ativo}:${ciclo}`. */ bases: Record<string, number> }

export const chaveCiclo = (ativo: AtivoMesa, ciclo: number) => `${ativo}:${ciclo}`;
export const storeVazio = (): MovimentacoesMesaStore => ({ versao: 1, lancamentos: [], bases: {} });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizarMovimentacoes(raw: any): MovimentacoesMesaStore | undefined {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.lancamentos)) return undefined;
  const lancamentos = raw.lancamentos.filter((m: MovimentacaoMesa) => m && typeof m.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.data)
    && (m.ativo === "ouro" || m.ativo === "nasdaq") && Number.isInteger(m.ciclo) && m.ciclo >= 1 && Number.isFinite(m.resultado));
  const bases: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.bases ?? {})) if (/^(ouro|nasdaq):\d+$/.test(k) && Number.isFinite(v)) bases[k] = v as number;
  return { versao: 1, lancamentos, bases };
}

export function ativoDaAba(state: State, tab: AssetKey | "historico"): AtivoMesa {
  if (tab === "ouro" || tab === "nasdaq") return tab;
  return state.assets.saque2.params.ativoReal === "nasdaq" ? "nasdaq" : "ouro";
}

/** IDs dos fechamentos de payout (aprovada com saque > 0) do ativo, em ordem: o ciclo N termina no fechamento N-1. */
export function fechamentosPayout(state: State, ativo: AtivoMesa): number[] {
  const origem = state.assets.saque2.params.ativoReal === "nasdaq" ? "nasdaq" : "ouro";
  return state.log.filter(e => e.tipo === "aprovada" && Number(e.saque) > 0 &&
    (e.asset === ativo || (e.asset === "saque2" && (e.origemSaque ?? origem) === ativo)))
    .sort((a, b) => a.ts - b.ts || a.id - b.id).map(e => e.id);
}
export const cicloAberto = (state: State, ativo: AtivoMesa) => fechamentosPayout(state, ativo).length + 1;

export function resumoCiclo(store: MovimentacoesMesaStore | undefined, ativo: AtivoMesa, ciclo: number) {
  const base = store?.bases[chaveCiclo(ativo, ciclo)] ?? 0;
  const lista = (store?.lancamentos ?? []).filter(m => m.ativo === ativo && m.ciclo === ciclo)
    .sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm - b.criadoEm);
  let acumulado = base;
  const linhas = lista.map(m => ({ ...m, acumulado: (acumulado += m.resultado) }));
  const ganhos = lista.reduce((s, m) => s + Math.max(0, m.resultado), 0);
  const perdas = lista.reduce((s, m) => s + Math.min(0, m.resultado), 0);
  return { base, linhas, ganhos, perdas, liquido: ganhos + perdas, saldo: base + ganhos + perdas };
}

export function ciclosUsados(store: MovimentacoesMesaStore | undefined, ativo: AtivoMesa, aberto: number) {
  const s = new Set<number>([aberto]);
  for (const m of store?.lancamentos ?? []) if (m.ativo === ativo) s.add(m.ciclo);
  for (const k of Object.keys(store?.bases ?? {})) if (k.startsWith(ativo + ":")) s.add(Number(k.split(":")[1]));
  return [...s].sort((a, b) => a - b);
}
