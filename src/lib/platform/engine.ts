// Lógica da plataforma Win or Win (portada 1:1 do HTML original).
// O formato do estado salvo em app_data NÃO deve mudar — mantém os dados dos usuários.

export type AssetKey = "nasdaq" | "ouro" | "saque2";
export type TabKey = AssetKey | "historico";

/** mll opcional: limite geral EOD de reprovação só deste dia; sem ele usa params.mll. */
export interface Day { mnq: number; lotes: number; meta: number; mll?: number }
export const dayMll = (a: Asset, d: Day) => (typeof d.mll === "number" && d.mll > 0 ? d.mll : a.params.mll);
export interface Params {
  mnq: number; hfm: number; mll: number; saldoInicial: number; taxa: number; lucroDesejado: number;
  marginPerLot: number; stopoutPct: number; saqueAprovada: number; folgaExtraPct: number; ativoReal?: "ouro" | "nasdaq";
}
export interface Attempt { currentDayIndex: number; cycleCost: number; custoProprioAcumulado: number }
export interface BonusLog { ts: number; tipo: "deposito" | "saque" | "reset"; valor: number; dia?: number; bonusGanho?: number; proporcao?: number; bonusReduzido?: number; depositoZerado?: number }
export interface Bonus { deposito: number; bonusAtual: number; bonusGanhoTotal: number; bonusCap: number; log: BonusLog[] }
export interface Asset { params: Params; days: Day[]; attempt: Attempt; bonus: Bonus }
export interface LogEntry {
  id: number; ts: number; asset: AssetKey; day: number; tipo: "profit" | "aprovada" | "reprovada"; delta: number; saldoApos: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custoDia?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custoCiclo?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  taxaCobrada?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saque?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proporcaoPropria?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custoProprioDia?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custoBonusDia?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custoProprioCiclo?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resultadoReal?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bruto?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevCfdBalance?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevCounts?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevDayIndex?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevCycleCost?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevCustoProprioAcumulado?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevTotalGasto?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevBonusDeposito?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prevBonusAtual?: any;
  /** Registro real de saída: valor teórico sugerido, valor real liquidado e a diferença (spread/slippage). */
  cfdTeorico?: number; cfdReal?: number; spread?: number;
}
export interface State {
  activeTab: TabKey; assets: Record<AssetKey, Asset>; log: LogEntry[]; cfdBalance: number; totalGasto: number;
  counts: { aprovadas: number; reprovadas: number };
}

export const ASSETS: AssetKey[] = ["nasdaq", "ouro", "saque2"];

const defaultAssetsBase = {
  nasdaq: {
    params: { mnq: 2, hfm: 1, mll: 2000, saldoInicial: 2000, taxa: 100, lucroDesejado: 150, marginPerLot: 58, stopoutPct: 30, saqueAprovada: 0, folgaExtraPct: 20 },
    days: [
      { mnq: 20, lotes: 5.2, meta: 1500 }, { mnq: 20, lotes: 9.1, meta: 1500 }, { mnq: 20, lotes: 15.9, meta: 2000 },
      { mnq: 1, lotes: 1.59, meta: 150 }, { mnq: 1, lotes: 1.71, meta: 150 }, { mnq: 1, lotes: 1.84, meta: 150 }, { mnq: 1, lotes: 1.98, meta: 150 },
    ],
  },
  ouro: {
    params: { mnq: 10, hfm: 100, mll: 2000, saldoInicial: 2200, taxa: 100, lucroDesejado: 100, marginPerLot: 873, stopoutPct: 30, saqueAprovada: 0, folgaExtraPct: 20 },
    days: [
      { mnq: 40, lotes: 0.2, meta: 1000 }, { mnq: 40, lotes: 0.3, meta: 1000 }, { mnq: 40, lotes: 0.45, meta: 1000 }, { mnq: 20, lotes: 0.68, meta: 2000 },
      { mnq: 10, lotes: 0.68, meta: 150 }, { mnq: 10, lotes: 0.73, meta: 150 }, { mnq: 10, lotes: 0.79, meta: 150 }, { mnq: 10, lotes: 0.84, meta: 150 },
    ],
  },
  saque2: {
    params: { mnq: 10, hfm: 100, mll: 2000, saldoInicial: 300, taxa: 0, lucroDesejado: 800, marginPerLot: 873, stopoutPct: 30, saqueAprovada: 0, folgaExtraPct: 20, ativoReal: "ouro" },
    days: [
      { mnq: 20, lotes: 0, meta: 1000 }, { mnq: 20, lotes: 0.8, meta: 150 }, { mnq: 20, lotes: 0.86, meta: 150 },
      { mnq: 20, lotes: 0.92, meta: 150 }, { mnq: 20, lotes: 0.99, meta: 150 },
    ],
  },
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export const freshAttempt = (): Attempt => ({ currentDayIndex: 0, cycleCost: 0, custoProprioAcumulado: 0 });
export const freshBonus = (): Bonus => ({ deposito: 0, bonusAtual: 0, bonusGanhoTotal: 0, bonusCap: 3000, log: [] });

export function defaultState(): State {
  const assets = clone(defaultAssetsBase) as unknown as Record<AssetKey, Asset>;
  for (const k of ASSETS) { assets[k].attempt = freshAttempt(); assets[k].bonus = freshBonus(); }
  return { activeTab: "nasdaq", assets, log: [], cfdBalance: 0, totalGasto: 0, counts: { aprovadas: 0, reprovadas: 0 } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isValidState(p: any): boolean {
  return !!(p && p.assets && p.assets.nasdaq && p.assets.ouro && Array.isArray(p.assets.nasdaq.days) && Array.isArray(p.assets.ouro.days));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeState(p: any): State {
  if (!p.assets.saque2) p.assets.saque2 = clone(defaultAssetsBase.saque2);
  for (const k of ASSETS) {
    const a = p.assets[k];
    if (!a.attempt) a.attempt = freshAttempt();
    if (typeof a.attempt.cycleCost !== "number") a.attempt.cycleCost = 0;
    if (typeof a.attempt.custoProprioAcumulado !== "number") a.attempt.custoProprioAcumulado = 0;
    if (!a.bonus) a.bonus = freshBonus();
    const d = defaultAssetsBase[k].params;
    if (typeof a.params.marginPerLot !== "number") a.params.marginPerLot = d.marginPerLot;
    if (typeof a.params.stopoutPct !== "number") a.params.stopoutPct = d.stopoutPct;
    if (typeof a.params.saqueAprovada !== "number") a.params.saqueAprovada = 0;
    if (typeof a.params.folgaExtraPct !== "number") a.params.folgaExtraPct = d.folgaExtraPct;
  }
  if (p.assets.saque2.params.ativoReal !== "ouro" && p.assets.saque2.params.ativoReal !== "nasdaq") p.assets.saque2.params.ativoReal = "ouro";
  if (!Array.isArray(p.log)) p.log = [];
  if (typeof p.cfdBalance !== "number") p.cfdBalance = 0;
  if (!p.counts) p.counts = { aprovadas: 0, reprovadas: 0 };
  if (typeof p.totalGasto !== "number") p.totalGasto = 0;
  if (!p.activeTab) p.activeTab = "nasdaq";
  return p as State;
}

export const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const fmtSigned = (n: number) => (n >= 0 ? "+" : "-") + "$" + fmt(Math.abs(n));
export function parseNum(s: unknown): number {
  if (typeof s !== "string") return parseFloat(String(s)) || 0;
  const n = parseFloat(s.trim().replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export function clampDayIndex(a: Asset): number {
  if (a.days.length === 0) { a.attempt.currentDayIndex = 0; return -1; }
  if (a.attempt.currentDayIndex >= a.days.length) a.attempt.currentDayIndex = a.days.length - 1;
  if (a.attempt.currentDayIndex < 0) a.attempt.currentDayIndex = 0;
  return a.attempt.currentDayIndex;
}

export interface DayCalc {
  pontos: number; custoSePassar: number; passa: number; pontosReprova: number; reprova: number;
  dividaHoje: number; alvoBruto: number; liquidoSeReprovar: number; bateuAlvo: boolean;
}

export function computeAssetCalcs(a: Asset, key: AssetKey): DayCalc[] {
  const { mnq: mnqPt, hfm: hfmPt, mll, taxa, lucroDesejado } = a.params;
  const incluiPretensao = key === "saque2";
  let divida = taxa;
  return a.days.map((d) => {
    const exp = d.mnq * mnqPt;
    const pontos = exp > 0 ? d.meta / exp : 0;
    const custoSePassar = pontos * d.lotes * hfmPt;
    const limite = typeof d.mll === "number" && d.mll > 0 ? d.mll : mll;
    const pontosReprova = exp > 0 ? limite / exp : 0;
    const reprova = pontosReprova * d.lotes * hfmPt;
    const dividaReal = divida;
    const dividaHoje = incluiPretensao ? dividaReal + lucroDesejado : dividaReal;
    const alvoBruto = incluiPretensao ? dividaHoje : dividaReal + lucroDesejado;
    const liquidoSeReprovar = reprova - dividaReal;
    divida += custoSePassar;
    return { pontos, custoSePassar, passa: -custoSePassar, pontosReprova, reprova, dividaHoje, alvoBruto, liquidoSeReprovar, bateuAlvo: liquidoSeReprovar >= lucroDesejado * 0.98 };
  });
}

export function nextLogId(s: State) { return s.log.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1; }
function pushLog(s: State, e: Omit<LogEntry, "id" | "ts">) { s.log.push({ ...e, id: nextLogId(s), ts: Date.now() } as LogEntry); }

function debitarCustoDoBonus(b: Bonus, custo: number) {
  if (!b || !(custo > 0)) return { proporcaoPropria: 1, custoProprio: 0, custoBonus: 0 };
  const disp = b.deposito || 0;
  const custoProprio = Math.min(custo, disp);
  const custoBonus = custo - custoProprio;
  b.deposito = Math.max(0, disp - custoProprio);
  b.bonusAtual = Math.max(0, (b.bonusAtual || 0) - custoBonus);
  return { proporcaoPropria: custo > 0 ? custoProprio / custo : 1, custoProprio, custoBonus };
}

/** realCfd: valor real liquidado no CFD (perda negativa). Sem ele, usa o teórico. */
export function handleProfit(s: State, key: AssetKey, realCfd?: number) {
  const a = s.assets[key];
  const idx = clampDayIndex(a);
  if (idx < 0) return;
  const calc = { ...computeAssetCalcs(a, key)[idx]! };
  const teorico = -calc.custoSePassar;
  if (typeof realCfd === "number" && Number.isFinite(realCfd)) calc.custoSePassar = -realCfd;
  const isLast = idx === a.days.length - 1;
  const prev = { prevCfdBalance: s.cfdBalance, prevCounts: { ...s.counts }, prevDayIndex: a.attempt.currentDayIndex, prevCycleCost: a.attempt.cycleCost || 0, prevCustoProprioAcumulado: a.attempt.custoProprioAcumulado || 0, prevTotalGasto: s.totalGasto, prevBonusDeposito: a.bonus.deposito || 0, prevBonusAtual: a.bonus.bonusAtual || 0 };
  const taxaCobrada = idx === 0 ? a.params.taxa : 0;
  const custoDoDia = calc.custoSePassar + taxaCobrada;
  const saque = isLast ? a.params.saqueAprovada || 0 : 0;
  const delta = saque - custoDoDia;
  const cicloCusto = prev.prevCycleCost + custoDoDia;
  const deb = debitarCustoDoBonus(a.bonus, calc.custoSePassar);
  const custoProprioDia = taxaCobrada + deb.custoProprio;
  const custoProprioAcumulado = prev.prevCustoProprioAcumulado + custoProprioDia;
  const resultadoReal = isLast ? saque - custoProprioAcumulado : null;
  let tipo: "profit" | "aprovada";
  if (isLast) { tipo = "aprovada"; s.counts.aprovadas++; a.attempt = freshAttempt(); }
  else { tipo = "profit"; a.attempt.currentDayIndex = idx + 1; a.attempt.cycleCost = cicloCusto; a.attempt.custoProprioAcumulado = custoProprioAcumulado; }
  s.cfdBalance += delta;
  s.totalGasto += taxaCobrada;
  pushLog(s, { asset: key, day: idx + 1, tipo, delta, saldoApos: s.cfdBalance, custoDia: calc.custoSePassar, custoCiclo: cicloCusto, taxaCobrada, saque, proporcaoPropria: deb.proporcaoPropria, custoProprioDia, custoBonusDia: deb.custoBonus, custoProprioCiclo: isLast ? custoProprioAcumulado : null, resultadoReal, cfdTeorico: teorico, cfdReal: -calc.custoSePassar, spread: -calc.custoSePassar - teorico, ...prev });
}

export function handleStop(s: State, key: AssetKey, realCfd?: number) {
  const a = s.assets[key];
  const idx = clampDayIndex(a);
  if (idx < 0) return;
  const calc = { ...computeAssetCalcs(a, key)[idx]! };
  const teorico = calc.reprova;
  if (typeof realCfd === "number" && Number.isFinite(realCfd)) calc.reprova = realCfd;
  const taxaCobrada = idx === 0 ? a.params.taxa : 0;
  const delta = calc.reprova - taxaCobrada;
  const prev = { prevCfdBalance: s.cfdBalance, prevCounts: { ...s.counts }, prevDayIndex: a.attempt.currentDayIndex, prevCycleCost: a.attempt.cycleCost || 0, prevCustoProprioAcumulado: a.attempt.custoProprioAcumulado || 0, prevTotalGasto: s.totalGasto, prevBonusDeposito: a.bonus.deposito || 0, prevBonusAtual: a.bonus.bonusAtual || 0 };
  const custoTotalCiclo = prev.prevCycleCost + taxaCobrada;
  a.bonus.deposito = (a.bonus.deposito || 0) + calc.reprova;
  const resultadoReal = calc.reprova - custoTotalCiclo;
  s.cfdBalance += delta;
  s.totalGasto += taxaCobrada;
  s.counts.reprovadas++;
  a.attempt = freshAttempt();
  pushLog(s, { asset: key, day: idx + 1, tipo: "reprovada", delta, saldoApos: s.cfdBalance, bruto: calc.reprova, taxaCobrada, custoCiclo: custoTotalCiclo, proporcaoPropria: 1, custoProprioDia: 0, custoBonusDia: 0, custoProprioCiclo: prev.prevCustoProprioAcumulado, resultadoReal, cfdTeorico: teorico, cfdReal: calc.reprova, spread: calc.reprova - teorico, ...prev });
}

export function undoLast(s: State) {
  const last = s.log[s.log.length - 1];
  if (!last) return;
  if (typeof last.prevCfdBalance === "number") s.cfdBalance = last.prevCfdBalance;
  if (last.prevCounts) s.counts = last.prevCounts;
  if (typeof last.prevTotalGasto === "number") s.totalGasto = last.prevTotalGasto;
  const a = s.assets[last.asset];
  if (typeof last.prevDayIndex === "number") a.attempt.currentDayIndex = last.prevDayIndex;
  if (typeof last.prevCycleCost === "number") a.attempt.cycleCost = last.prevCycleCost;
  if (typeof last.prevCustoProprioAcumulado === "number") a.attempt.custoProprioAcumulado = last.prevCustoProprioAcumulado;
  if (typeof last.prevBonusDeposito === "number") a.bonus.deposito = last.prevBonusDeposito;
  if (typeof last.prevBonusAtual === "number") a.bonus.bonusAtual = last.prevBonusAtual;
  s.log.pop();
}

export function tipoLabel(tipo: string, asset: string) {
  if (tipo === "profit") return "profit (avançou)";
  if (tipo === "aprovada") return asset === "saque2" ? "saque gerado" : "conta aprovada";
  if (tipo === "reprovada") return "conta reprovada";
  return tipo;
}

export function historicoTotals(s: State) {
  const profit = s.log.reduce((t, e) => {
    if (e.tipo === "aprovada" && typeof e.custoProprioCiclo === "number") {
      const a = s.assets[e.asset];
      return t + ((a ? a.params.saqueAprovada || 0 : e.saque || 0) - e.custoProprioCiclo);
    }
    if (e.tipo === "reprovada" && typeof e.resultadoReal === "number") {
      const a = s.assets[e.asset];
      return t + e.resultadoReal + (a ? a.params.taxa || 0 : e.taxaCobrada || 0);
    }
    return t;
  }, 0);
  const resultadoReal = s.log.reduce((t, e) => ((e.tipo === "aprovada" || e.tipo === "reprovada") && typeof e.custoCiclo === "number" ? t + e.custoCiclo : t), 0);
  const custoProprio = s.log.reduce((t, e) => ((e.tipo === "aprovada" || e.tipo === "reprovada") && typeof e.custoProprioCiclo === "number" ? t + Math.max(0, e.custoProprioCiclo - (e.taxaCobrada || 0)) : t), 0);
  return { profit, resultadoReal, custoProprio };
}

export function projetarZeragemBonus(s: State, key: AssetKey, bonusAtual: number) {
  if (!(bonusAtual > 0)) return null;
  const amostra = s.log.filter((e) => e.asset === key && typeof e.custoBonusDia === "number" && e.custoBonusDia > 0).slice(-5);
  if (!amostra.length) return null;
  const media = amostra.reduce((t, e) => t + e.custoBonusDia, 0) / amostra.length;
  if (!(media > 0)) return null;
  return { dias: bonusAtual / media, media, amostras: amostra.length };
}

export function aplicarDeposito(s: State, key: AssetKey, valor: number) {
  if (valor <= 0) return;
  const b = s.assets[key].bonus;
  const espaco = Math.max(0, b.bonusCap - b.bonusGanhoTotal);
  const ganho = Math.min(valor, espaco);
  b.deposito += valor; b.bonusAtual += ganho; b.bonusGanhoTotal += ganho;
  b.log.push({ ts: Date.now(), tipo: "deposito", valor, dia: s.assets[key].attempt.currentDayIndex + 1, bonusGanho: ganho });
}

export function aplicarSaque(s: State, key: AssetKey, valor: number) {
  if (valor <= 0) return;
  const b = s.assets[key].bonus;
  const proporcao = (b.deposito || 0) > 0 ? valor / b.deposito : 0;
  const bonusReduzido = b.bonusAtual * proporcao;
  b.deposito = Math.max(0, (b.deposito || 0) - valor);
  b.bonusAtual = Math.max(0, b.bonusAtual - bonusReduzido);
  b.log.push({ ts: Date.now(), tipo: "saque", valor, proporcao, bonusReduzido });
}

export function resetBonus(s: State, key: AssetKey) {
  const b = s.assets[key].bonus;
  if (!(b.bonusAtual || 0) && !(b.deposito || 0) && !(b.bonusGanhoTotal || 0)) return;
  b.log.push({ ts: Date.now(), tipo: "reset", valor: b.bonusAtual, depositoZerado: b.deposito || 0 });
  b.bonusAtual = 0; b.deposito = 0; b.bonusGanhoTotal = 0;
}

/** Aporte fracionado: deposita só a parte que, somada ao bônus (pct% do depósito, limitado ao teto), cobre o necessário do dia. */
export function calcAporteFracionado(o: { margem: number; stopoutPct: number; custoDia: number; bonusPct: number; bonusCap: number; bancaIntegral: number }) {
  const margem = Math.max(0, o.margem || 0);
  const total = margem * (1 + Math.max(0, o.stopoutPct || 0) / 100) + Math.max(0, o.custoDia || 0);
  const p = Math.max(0, o.bonusPct || 0) / 100;
  const cap = o.bonusCap > 0 ? o.bonusCap : Infinity;
  const proprio = Math.max(total / (1 + p), total - cap);
  const bonus = total - proprio;
  const economia = Math.max(0, (o.bancaIntegral || 0) - proprio);
  return { total, proprio, bonus, economia };
}

export interface CaixaDia { dia: number; necessario: number; saldoAntes: number; proprioAntes: number; bonusAntes: number; proprioDisponivel: number; bonusDisponivel: number; excedenteProprioSacavel: number; deposito: number; bonusGanho: number; perda: number; proprioRestante: number; bonusRestante: number; caixaAcumulado: number }
/** Caixa do ciclo completo: simula passar em todos os dias (pior caso de caixa) com aporte fracionado e bônus com teto. */
export function calcCaixaCiclo(a: Asset, key: AssetKey, bonusPct: number) {
  const calcs = computeAssetCalcs(a, key);
  const p = Math.max(0, bonusPct || 0) / 100;
  const cap = a.bonus.bonusCap > 0 ? a.bonus.bonusCap : Infinity;
  const taxa = a.params.taxa || 0;
  let proprio = 0, bonus = 0, bonusTotal = 0, depositado = 0, perdaPropriaTotal = 0, perdaBonusTotal = 0;
  const dias: CaixaDia[] = a.days.map((d, i) => {
    const perda = Math.max(0, calcs[i]?.custoSePassar ?? 0);
    const necessario = (a.params.marginPerLot || 0) * d.lotes * (1 + Math.max(0, a.params.stopoutPct || 0) / 100) + perda;
    const proprioAntes = proprio;
    const bonusAntes = bonus;
    const saldoAntes = proprioAntes + bonusAntes;
    const falta = Math.max(0, necessario - saldoAntes);
    const espaco = Math.max(0, cap - bonusTotal);
    const deposito = falta > 0 ? Math.max(falta / (1 + p), falta - espaco) : 0;
    const bonusGanho = Math.min(deposito * p, espaco);
    proprio += deposito; bonus += bonusGanho; bonusTotal += bonusGanho; depositado += deposito;
    const proprioDisponivel = proprioAntes + deposito;
    const bonusDisponivel = bonusAntes + bonusGanho;
    // Estima o saque máximo do saldo próprio sem deixar a cobertura abaixo do necessário.
    // O saque também reduz o bônus proporcionalmente, conforme aplicarSaque:
    // bônusReduzido = bônusDisponível * (saque / saldoPróprioDisponível).
    // Portanto, cada real sacado reduz o saldo total em (1 + bônus/próprio).
    const folgaTotal = Math.max(0, proprioDisponivel + bonusDisponivel - necessario);
    const excedenteProprioSacavel = proprioDisponivel > 0
      ? Math.min(proprioDisponivel, folgaTotal / (1 + bonusDisponivel / proprioDisponivel))
      : 0;
    const deProprio = Math.min(perda, proprio);
    const deBonus = Math.min(Math.max(0, perda - deProprio), bonus);
    perdaPropriaTotal += deProprio;
    perdaBonusTotal += deBonus;
    proprio -= deProprio;
    bonus = Math.max(0, bonus - deBonus);
    return { dia: i + 1, necessario, saldoAntes, proprioAntes, bonusAntes, proprioDisponivel, bonusDisponivel, excedenteProprioSacavel, deposito, bonusGanho, perda, perdaPropria: deProprio, perdaBonus: deBonus, proprioRestante: proprio, bonusRestante: bonus, caixaAcumulado: taxa + depositado };
  });
  const saque = a.params.saqueAprovada || 0;
  const caixaMaximo = taxa + depositado;
  const recuperado = proprio + saque;
  const totalPerda = dias.reduce((acc, d) => acc + d.perda, 0);
  return { dias, taxa, totalDepositado: depositado, totalPerda, perdaPropriaTotal, perdaBonusTotal, caixaMaximo, proprioRecuperavel: proprio, saque, recuperado, resultadoFinal: recuperado - caixaMaximo, bonusTotal };
}
