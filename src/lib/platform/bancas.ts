import { type State, type AssetKey, type Bonus, type MesaFuturos, defaultState, historicoTotals, isValidState, normalizeState, podeDesfazerUltimaOperacao, tipoLabel } from "./engine";
import { challengeAccountSchema, type ChallengeAccount } from "../prop-firms";

export type BancaAtivo = "nasdaq" | "ouro";
export interface Banca { id: string; nome: string; criadaEm: number; state: State; taxaCompra?: number; mesa?: MesaFuturos; ativo?: BancaAtivo; officialAcceptedAt?: string; challengeAccount?: ChallengeAccount }
export interface ForexCompartilhado { cfdBalance: number; forexSaldoReal?: number | undefined; bonus: Record<AssetKey, Bonus> }
export interface BancasDoc { bancasVersion: 1; activeId: string; bancas: Banca[]; mesaAtiva?: MesaFuturos; activeIdsMesa?: Partial<Record<MesaFuturos, string>>; forex?: ForexCompartilhado }

export function extrairForex(state: State): ForexCompartilhado {
  return { cfdBalance: state.cfdBalance, forexSaldoReal: state.forexSaldoReal, bonus: {
    nasdaq: structuredClone(state.assets.nasdaq.bonus),
    ouro: structuredClone(state.assets.ouro.bonus),
    saque2: structuredClone(state.assets.saque2.bonus),
  } };
}
export function aplicarForex(state: State, forex: ForexCompartilhado): State {
  const next = structuredClone(state);
  next.cfdBalance = forex.cfdBalance;
  next.forexSaldoReal = Number.isFinite(forex.forexSaldoReal) ? forex.forexSaldoReal : Object.values(forex.bonus).reduce((t, b) => t + Math.max(0, b.deposito || 0), 0);
  for (const key of ["nasdaq", "ouro", "saque2"] as AssetKey[]) {
    next.assets[key].bonus = structuredClone(forex.bonus[key]);
    next.assets[key].params.saldoInicial = forex.bonus[key].deposito + forex.bonus[key].bonusAtual;
  }
  return next;
}
/** A última operação só pode reverter o Forex quando seu snapshot ainda coincide com o compartilhado. */
export function podeDesfazerBanca(doc: BancasDoc, banca: Banca): boolean {
  return podeDesfazerUltimaOperacao(banca.state) && JSON.stringify(extrairForex(banca.state)) === JSON.stringify(forexDoDocumento(doc));
}

export function forexDoDocumento(doc: BancasDoc): ForexCompartilhado {
  if (doc.forex && Number.isFinite(doc.forex.cfdBalance) && ["nasdaq", "ouro", "saque2"].every((k) => doc.forex?.bonus?.[k as AssetKey])) return doc.forex;
  const ordered = [...doc.bancas].sort((a, b) => {
    const last = (x: Banca) => Math.max(x.criadaEm, ...x.state.log.map((e) => e.ts || 0), ...Object.values(x.state.assets).flatMap((asset) => asset.bonus.log.map((e) => e.ts || 0)));
    return last(b) - last(a);
  });
  return extrairForex(ordered[0]?.state ?? defaultState());
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function novaBanca(nome: string, state: State = defaultState()): Banca {
  return { id: newId(), nome: nome.trim() || "Banca", criadaEm: Date.now(), state };
}

/** Aceita o formato antigo (um único estado) e o novo (várias bancas). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseBancas(raw: string | null): BancasDoc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let p: any = null;
  try { p = raw ? JSON.parse(raw) : null; } catch { p = null; }
  if (p && Array.isArray(p.bancas) && p.bancas.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bancas: Banca[] = p.bancas.map((b: any, i: number) => ({
      id: String(b.id || newId()), nome: String(b.nome || `Banca ${i + 1}`), criadaEm: Number(b.criadaEm) || Date.now(),
      state: isValidState(b.state) ? normalizeState(b.state) : defaultState(),
      mesa: b.mesa === "lucid" || b.mesa === "mff" ? b.mesa : "tradefive",
      ...(Number.isFinite(b.taxaCompra) && b.taxaCompra >= 0 ? { taxaCompra: b.taxaCompra } : {}),
      ...(b.ativo === "nasdaq" || b.ativo === "ouro" ? { ativo: b.ativo } : {}),
      ...(typeof b.officialAcceptedAt === "string" ? { officialAcceptedAt: b.officialAcceptedAt } : {}),
      ...(challengeAccountSchema.safeParse(b.challengeAccount).success ? { challengeAccount: challengeAccountSchema.parse(b.challengeAccount) } : {}),
    }));
    const activeId = bancas.some((b) => b.id === p.activeId) ? p.activeId : bancas[0]?.id ?? "";
    const mesaAtiva: MesaFuturos = p.mesaAtiva === "lucid" || p.mesaAtiva === "mff" ? p.mesaAtiva : "tradefive";
    const ids = p.activeIdsMesa && typeof p.activeIdsMesa === "object" ? p.activeIdsMesa as Partial<Record<MesaFuturos, string>> : {};
    const activeIdsMesa = { ...ids, tradefive: ids.tradefive ?? activeId };
    const doc: BancasDoc = { bancasVersion: 1, activeId, bancas, mesaAtiva, activeIdsMesa };
    return { ...doc, forex: p.forex && Number.isFinite(p.forex.cfdBalance) && p.forex.bonus ? p.forex : forexDoDocumento(doc) };
  }
  const first = novaBanca("Banca principal", isValidState(p) ? normalizeState(p) : defaultState());
  return { bancasVersion: 1, activeId: first.id, bancas: [first], mesaAtiva: "tradefive", activeIdsMesa: { tradefive: first.id }, forex: extrairForex(first.state) };
}

export function resumoBanca(b: Banca) {
  const t = historicoTotals(b.state);
  const encerramentos = b.state.log.filter((e) => e.tipo === "aprovada" || e.tipo === "reprovada");
  const ciclos = encerramentos.length;
  // Corrigir o preço de compra altera a visão econômica dos ciclos encerrados,
  // sem reescrever logs históricos, saldo do Forex ou operações executadas.
  // Cada encerramento registra o custo de compra efetivamente contabilizado
  // no ciclo; a diferença é aplicada apenas à apresentação do resultado.
  const precoCorrigido = b.taxaCompra;
  const ajusteCompra = typeof precoCorrigido === "number" && Number.isFinite(precoCorrigido)
    ? encerramentos.reduce((ajuste, evento) => {
        const custoRegistrado = typeof evento.taxaCobrada === "number" && Number.isFinite(evento.taxaCobrada)
          ? evento.taxaCobrada : b.state.assets[evento.asset].params.taxa;
        return ajuste + custoRegistrado - precoCorrigido;
      }, 0)
    : 0;
  return {
    aprovadas: b.state.counts.aprovadas, reprovadas: b.state.counts.reprovadas, ciclos,
    lucro: t.profit + ajusteCompra, totalGasto: b.state.totalGasto - ajusteCompra, cfd: b.state.cfdBalance,
    ultima: b.state.log.length ? Math.max(...b.state.log.map((e) => e.ts || 0)) : 0,
  };
}

const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const num = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2).replace(".", ",");
const ASSET: Record<string, string> = { nasdaq: "Nasdaq", ouro: "Gold", saque2: "Saque 2" };

export function relatorioCsv(bancas: Banca[]): string {
  const rows: unknown[][] = [["RESUMO POR BANCA"], ["Banca", "Ciclos", "Aprovadas", "Reprovadas", "Lucro total ($)", "Total gasto ($)", "Saldo CFD ($)"]];
  for (const b of bancas) { const r = resumoBanca(b); rows.push([b.nome, r.ciclos, r.aprovadas, r.reprovadas, num(r.lucro), num(r.totalGasto), num(r.cfd)]); }
  rows.push([], ["HISTÓRICO"], ["Banca", "Data", "Aba", "Dia", "Evento", "Resultado ($)", "Teórico CFD ($)", "Real CFD ($)", "Spread ($)", "Saldo após ($)"]);
  for (const b of bancas) for (const e of [...b.state.log].sort((x, y) => x.ts - y.ts))
    rows.push([b.nome, new Date(e.ts).toLocaleString("pt-BR"), ASSET[e.asset] ?? e.asset, e.day ?? 0, tipoLabel(e.tipo, e.asset), num(e.delta), typeof e.cfdTeorico === "number" ? num(e.cfdTeorico) : "", typeof e.cfdReal === "number" ? num(e.cfdReal) : "", typeof e.spread === "number" ? num(e.spread) : "", num(e.saldoApos)]);
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\n");
}
