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
export interface BonusLog { ts: number; tipo: "deposito" | "saque" | "reset" | "ajuste_credito"; valor: number; dia?: number; bonusGanho?: number; proporcao?: number; bonusReduzido?: number; depositoZerado?: number }
export interface Bonus { deposito: number; bonusAtual: number; bonusGanhoTotal: number; bonusCap: number; log: BonusLog[] }
export type MesaFuturos = "tradefive" | "lucid" | "mff";
export const MESAS_FUTUROS: Record<MesaFuturos, { nome: string; consistencia: number; avaliacao: number; payout: number }> = {
  tradefive: { nome: "Trade Five", consistencia: 40, avaliacao: 3, payout: 5 },
  lucid: { nome: "Lucid Trading", consistencia: 50, avaliacao: 2, payout: 5 },
  mff: { nome: "My Funded Futures (MFF)", consistencia: 30, avaliacao: 4, payout: 5 },
};
export interface Asset { params: Params; days: Day[]; attempt: Attempt; bonus: Bonus; mesaFuturos?: MesaFuturos; diasPorMesa?: Partial<Record<MesaFuturos, Day[]>> }
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
  prevForexSaldoReal?: number | undefined;
  prevBonusTodos?: Record<AssetKey, Bonus>;
  /** Registro real de saída: valor teórico sugerido, valor real liquidado e a diferença (spread/slippage). */
  cfdTeorico?: number; cfdReal?: number; spread?: number;
}
export interface State {
  activeTab: TabKey; assets: Record<AssetKey, Asset>; log: LogEntry[]; cfdBalance: number; totalGasto: number;
  forexSaldoReal?: number | undefined;
  counts: { aprovadas: number; reprovadas: number };
}

export const ASSETS: AssetKey[] = ["nasdaq", "ouro", "saque2"];

const defaultAssetsBase = {
  nasdaq: {
    params: { mnq: 2, hfm: 1, mll: 2000, saldoInicial: 2000, taxa: 100, lucroDesejado: 100, marginPerLot: 59, stopoutPct: 50, saqueAprovada: 0, folgaExtraPct: 20 },
    days: [
      { mnq: 20, lotes: 4.0, meta: 1500 }, { mnq: 20, lotes: 7.0, meta: 1500 },
      { mnq: 10, lotes: 6.2, meta: 1000 }, { mnq: 10, lotes: 9.3, meta: 1000 },
      { mnq: 3, lotes: 4.2, meta: 150 }, { mnq: 3, lotes: 4.5, meta: 150 }, { mnq: 3, lotes: 4.8, meta: 150 },
    ],
  },
  ouro: {
    params: { mnq: 10, hfm: 100, mll: 2000, saldoInicial: 416, taxa: 100, lucroDesejado: 100, marginPerLot: 873, stopoutPct: 50, saqueAprovada: 1700, folgaExtraPct: 20 },
    days: [
      { mnq: 20, lotes: 0.21, meta: 1080, mll: 2000 },
      { mnq: 20, lotes: 0.33, meta: 1080, mll: 2000 },
      { mnq: 20, lotes: 0.51, meta: 1080, mll: 2000 },
      { mnq: 20, lotes: 0.80, meta: 3000, mll: 2000 },
      { mnq: 2, lotes: 0.19, meta: 200, mll: 2120 },
      { mnq: 2, lotes: 0.21, meta: 200, mll: 2130 },
      { mnq: 2, lotes: 0.23, meta: 200, mll: 2140 },
      { mnq: 2, lotes: 0.25, meta: 200, mll: 2150 },
    ],
  },
  saque2: {
    params: { mnq: 10, hfm: 100, mll: 2000, saldoInicial: 732, taxa: 0, lucroDesejado: 0, marginPerLot: 873, stopoutPct: 50, saqueAprovada: 1300, folgaExtraPct: 20, ativoReal: "ouro" },
    days: [
      { mnq: 5, lotes: 0.03, meta: 200, mll: 2080 },
      { mnq: 5, lotes: 0.03, meta: 200, mll: 2090 },
      { mnq: 5, lotes: 0.03, meta: 200, mll: 2090 },
      { mnq: 5, lotes: 0.04, meta: 200, mll: 2100 },
      { mnq: 5, lotes: 0.04, meta: 200, mll: 2110 },
    ],
  },
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
/** Preserva a programação de cada mesa, inclusive valores editados pelo usuário. */
export function selecionarMesaGold(asset: Asset, mesa: MesaFuturos): void {
  if (!MESAS_FUTUROS[mesa]) return;
  const anterior = asset.mesaFuturos ?? "tradefive";
  if (anterior === mesa) { asset.mesaFuturos = mesa; return; }
  const atual = structuredClone(asset.days);
  const versoes = asset.diasPorMesa ?? {};
  versoes[anterior] = atual;
  if (!versoes[mesa]) {
    const avaliacao = MESAS_FUTUROS[mesa].avaliacao;
    const referencia = versoes.tradefive ?? atual;
    const baseAval = referencia.slice(0, Math.min(3, referencia.length));
    const primeiro = baseAval[0] ?? { mnq: 20, lotes: 0.2, meta: 1080 };
    // A meta do quarto dia deve respeitar o limite de consistência de 30%.
    const ultimoAval = baseAval[baseAval.length - 1] ?? primeiro;
    const diasAvaliacao = Array.from({ length: avaliacao }, (_, i) => structuredClone(baseAval[i] ?? ultimoAval));
    const ultimosCinco = referencia.length === 8 ? referencia.slice(-4) : referencia.slice(-5);
    const primeiroPayout = ultimosCinco[0] ?? { mnq: 2, lotes: 0.2, meta: 200 };
    const diasPayout = Array.from({ length: 5 }, (_, i) => structuredClone(ultimosCinco[i] ?? primeiroPayout));
    versoes[mesa] = [...diasAvaliacao, ...diasPayout];
  }
  asset.diasPorMesa = versoes;
  asset.days = structuredClone(versoes[mesa]!);
  asset.mesaFuturos = mesa;
  asset.attempt.currentDayIndex = Math.min(asset.attempt.currentDayIndex, asset.days.length - 1);
}

export const freshAttempt = (): Attempt => ({ currentDayIndex: 0, cycleCost: 0, custoProprioAcumulado: 0 });
export const freshBonus = (): Bonus => ({ deposito: 0, bonusAtual: 0, bonusGanhoTotal: 0, bonusCap: 3000, log: [] });

export function defaultState(): State {
  const assets = clone(defaultAssetsBase) as unknown as Record<AssetKey, Asset>;
  for (const k of ASSETS) { assets[k].attempt = freshAttempt(); assets[k].bonus = freshBonus(); }
  return { activeTab: "nasdaq", assets, log: [], cfdBalance: 0, totalGasto: 0, forexSaldoReal: 0, counts: { aprovadas: 0, reprovadas: 0 } };
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
  if (!Number.isFinite(p.forexSaldoReal)) p.forexSaldoReal = ASSETS.reduce((v, k) => v + Math.max(0, p.assets[k].bonus.deposito || 0), 0);
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

function debitarCustoDoBonus(s: State, key: AssetKey, custo: number) {
  if (!(custo > 0)) return { proporcaoPropria: 1, custoProprio: 0, custoBonus: 0 };
  const saldoReal = Math.max(0, s.forexSaldoReal ?? 0);
  const custoProprio = Math.min(custo, saldoReal);
  let restante = custo - custoProprio;
  const custoBonus = restante;
  // O crédito da corretora é compartilhado: nunca consumir bônus enquanto houver saldo real.
  for (const k of [key, ...ASSETS.filter((x) => x !== key)]) {
    const b = s.assets[k].bonus;
    const deducao = Math.min(Math.max(0, b.bonusAtual), restante);
    b.bonusAtual = Math.max(0, b.bonusAtual - deducao);
    restante -= deducao;
    if (restante <= 0) break;
  }
  const b = s.assets[key].bonus;
  b.deposito = Math.max(0, (b.deposito || 0) - custoProprio);
  return { proporcaoPropria: custoProprio / custo, custoProprio, custoBonus: custoBonus - restante };
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
  const prev = { prevBonusTodos: Object.fromEntries(ASSETS.map((k) => [k, structuredClone(s.assets[k].bonus)])) as Record<AssetKey, Bonus>, prevForexSaldoReal: s.forexSaldoReal, prevCfdBalance: s.cfdBalance, prevCounts: { ...s.counts }, prevDayIndex: a.attempt.currentDayIndex, prevCycleCost: a.attempt.cycleCost || 0, prevCustoProprioAcumulado: a.attempt.custoProprioAcumulado || 0, prevTotalGasto: s.totalGasto, prevBonusDeposito: a.bonus.deposito || 0, prevBonusAtual: a.bonus.bonusAtual || 0 };
  const taxaCobrada = idx === 0 ? a.params.taxa : 0;
  const custoDoDia = calc.custoSePassar + taxaCobrada;
  const saque = isLast ? a.params.saqueAprovada || 0 : 0;
  const delta = saque - custoDoDia;
  const cicloCusto = prev.prevCycleCost + custoDoDia;
  const deb = debitarCustoDoBonus(s, key, calc.custoSePassar);
  atualizarSaldoReal(s, -calc.custoSePassar);
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
  const prev = { prevBonusTodos: Object.fromEntries(ASSETS.map((k) => [k, structuredClone(s.assets[k].bonus)])) as Record<AssetKey, Bonus>, prevForexSaldoReal: s.forexSaldoReal, prevCfdBalance: s.cfdBalance, prevCounts: { ...s.counts }, prevDayIndex: a.attempt.currentDayIndex, prevCycleCost: a.attempt.cycleCost || 0, prevCustoProprioAcumulado: a.attempt.custoProprioAcumulado || 0, prevTotalGasto: s.totalGasto, prevBonusDeposito: a.bonus.deposito || 0, prevBonusAtual: a.bonus.bonusAtual || 0 };
  const custoTotalCiclo = prev.prevCycleCost + taxaCobrada;
  if (calc.reprova >= 0) a.bonus.deposito = (a.bonus.deposito || 0) + calc.reprova;
  else debitarCustoDoBonus(s, key, -calc.reprova);
  atualizarSaldoReal(s, calc.reprova);
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
  if (typeof last.prevForexSaldoReal === "number") s.forexSaldoReal = last.prevForexSaldoReal;
  if (last.prevBonusTodos) for (const k of ASSETS) s.assets[k].bonus = structuredClone(last.prevBonusTodos[k]);
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
      // resultadoReal já inclui a taxa de avaliação no custo do ciclo.
      // Não somar a taxa de volta: o Profit deve ser líquido.
      return t + e.resultadoReal;
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

export function atualizarSaldoReal(s: State, delta: number) {
  if (!Number.isFinite(delta)) return;
  s.forexSaldoReal = Math.max(0, (s.forexSaldoReal ?? 0) + delta);
}

export function aplicarDeposito(s: State, key: AssetKey, valor: number) {
  if (valor <= 0) return;
  const b = s.assets[key].bonus;
  const espaco = Math.max(0, b.bonusCap - b.bonusGanhoTotal);
  const ganho = Math.min(valor, espaco);
  atualizarSaldoReal(s, valor);
  b.deposito += valor; b.bonusAtual += ganho; b.bonusGanhoTotal += ganho;
  b.log.push({ ts: Date.now(), tipo: "deposito", valor, dia: s.assets[key].attempt.currentDayIndex + 1, bonusGanho: ganho });
}

export function aplicarSaque(s: State, key: AssetKey, valor: number) {
  if (valor <= 0) return;
  const b = s.assets[key].bonus;
  const saldoAntes = s.forexSaldoReal ?? 0;
  if (saldoAntes <= 0 || valor > saldoAntes) return;
  const proporcao = Math.min(1, valor / saldoAntes);
  const bonusReduzido = ASSETS.reduce((total, k) => {
    const credito = s.assets[k].bonus;
    const reduzido = credito.bonusAtual * proporcao;
    credito.bonusAtual = Math.max(0, credito.bonusAtual - reduzido);
    return total + reduzido;
  }, 0);
  atualizarSaldoReal(s, -valor);
  b.deposito = Math.max(0, b.deposito - valor);
  b.log.push({ ts: Date.now(), tipo: "saque", valor, proporcao, bonusReduzido });
}

/** Ajuste de conciliação, sem reescrever saques nem depósitos históricos. */
export function conciliarCreditoForex(s: State, key: AssetKey, creditoConfirmado: number) {
  if (!Number.isFinite(creditoConfirmado) || creditoConfirmado < 0) return;
  const anterior = ASSETS.reduce((total, k) => total + Math.max(0, s.assets[k].bonus.bonusAtual), 0);
  let diferenca = creditoConfirmado - anterior;
  if (diferenca >= 0) s.assets[key].bonus.bonusAtual += diferenca;
  else {
    for (const k of [key, ...ASSETS.filter((x) => x !== key)]) {
      const b = s.assets[k].bonus;
      const reduzido = Math.min(b.bonusAtual, -diferenca);
      b.bonusAtual -= reduzido;
      diferenca += reduzido;
      if (diferenca >= 0) break;
    }
  }
  s.assets[key].bonus.log.push({ ts: Date.now(), tipo: "ajuste_credito", valor: creditoConfirmado - anterior });
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

export interface CaixaDia { dia: number; necessario: number; saldoAntes: number; proprioAntes: number; bonusAntes: number; proprioDisponivel: number; bonusDisponivel: number; excedenteProprioSacavel: number; deposito: number; bonusGanho: number; perda: number; perdaPropria: number; perdaBonus: number; proprioRestante: number; bonusRestante: number; caixaAcumulado: number }
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
