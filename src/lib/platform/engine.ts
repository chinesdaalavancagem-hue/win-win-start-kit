import { type MesaPersonalizada, validarMesaPersonalizada, metasAvaliacao } from "./mesas-personalizadas";
import { type VestDraft, normalizeVestDraft } from "./vest";
import { type VestCapital, type VestDailyLimit, vestPlan } from "./vest-oficial";
// Lógica da plataforma Win or Win (portada 1:1 do HTML original).
// O formato do estado salvo em app_data NÃO deve mudar — mantém os dados dos usuários.

export type AssetKey = "nasdaq" | "ouro" | "saque2";
export type TabKey = AssetKey | "historico";

/** mll opcional: limite geral EOD de reprovação só deste dia; sem ele usa params.mll. */
export interface Day { stopPlanejadoTopstep?: number; mnq: number; lotes: number; meta: number; mll?: number }
export const dayMll = (a: Asset, d: Day) => (typeof d.mll === "number" && d.mll > 0 ? d.mll : a.params.mll);
export interface Params {
  /** Débito bruto da mesa no saque; ausente usa o recebimento esperado (legado). */
  saqueDebitadoMesa?: number;
  /** Comissão total de entrada + saída por contrato; ausente mantém o legado sem desconto. */
  comissaoPorContrato?: number;
  mnq: number; hfm: number; mll: number; saldoInicial: number; taxa: number; lucroDesejado: number;
  marginPerLot: number; stopoutPct: number; saqueAprovada: number; folgaExtraPct: number; ativoReal?: "ouro" | "nasdaq";
}
/** Meta do card é bruta: mantém o movimento de preço usado no hedge. */
export function taxasMesaDia(a: Asset, d: Day): number {
  if (a.mesaFuturos === "vest") return 0;
  const taxa = a.params.comissaoPorContrato;
  return typeof taxa === "number" && Number.isFinite(taxa) && taxa >= 0
    ? Math.round(Math.max(0, d.mnq) * taxa * 100) / 100 : 0;
}
export function metaLiquidaDia(a: Asset, d: Day): number {
  return Math.round((d.meta - taxasMesaDia(a, d)) * 100) / 100;
}
/** Resultado informado já é líquido; inclusive zero e prejuízo são preservados. */
export function resultadoMesaDia(a: Asset, indice: number): number {
  return a.attempt.resultadosMesaEod?.[indice] ?? metaLiquidaDia(a, a.days[indice]!);
}
export interface Attempt { resultadosMesaEod?: Record<string, number>; currentDayIndex: number; cycleCost: number; custoProprioAcumulado: number }
export interface BonusLog { ts: number; tipo: "deposito" | "saque" | "reset" | "ajuste_credito" | "reinicio_ciclo"; valor: number; dia?: number; bonusGanho?: number; proporcao?: number; bonusReduzido?: number; depositoZerado?: number }
export interface Bonus { deposito: number; bonusAtual: number; bonusGanhoTotal: number; bonusCap: number; log: BonusLog[] }
export type MesaFuturos = "tradefive" | "lucid" | "mff" | "topstep" | "vest" | MesaPersonalizada["id"];
export const MESAS_FUTUROS: Record<MesaFuturos, { nome: string; consistencia: number; avaliacao: number; payout: number }> = {
  tradefive: { nome: "Tradeify", consistencia: 40, avaliacao: 3, payout: 5 },
  lucid: { nome: "Lucid Trading", consistencia: 50, avaliacao: 2, payout: 5 },
  mff: { nome: "My Funded Futures (MFF)", consistencia: 30, avaliacao: 4, payout: 5 },
  topstep: { nome: "Topstep", consistencia: 55, avaliacao: 2, payout: 5 },
  vest: { nome: "Vest Capital · GC-PERP", consistencia: 0, avaliacao: 1, payout: 1 },
};
export interface Asset { mesaConfig?: MesaPersonalizada; params: Params; days: Day[]; attempt: Attempt; bonus: Bonus; mesaFuturos?: MesaFuturos; diasPorMesa?: Partial<Record<MesaFuturos, Day[]>>; avaliacaoPorMesa?: Partial<Record<MesaFuturos, number>> }
export interface ContinuacaoSaque {
  origem: "ouro" | "nasdaq"; numero: number;
  saldoAntes: number; saldoDepois: number; bruto: number; liquido: number;
  resultadoAcumulado: number; divida: number;
  forexProprio: number; forexBonus: number; bonusUtilizado: number; bonusCap: number;
}
export interface LogEntry {
  /** Fotografia do encerramento; desfazer remove também esta continuidade. */
  continuacaoSaque?: ContinuacaoSaque;
  origemSaque?: "ouro" | "nasdaq";
  resultadoMesa?: number;
  prevAttempt?: Attempt;
  prevResultadosMesaEod?: Record<string, number>;
  revisadoEm?: number;
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
  /** Assinatura do Forex compartilhado após a operação, para reversão segura. */
  assinaturaForexApos?: string;
}
export interface State {
  /** Estudo manual independente; não representa posição nem altera o histórico. */
  vestStudy?: VestDraft;
  vestAccount?: { capital: VestCapital; dailyLimitPercent: VestDailyLimit };
  revisoesHistorico?: { ts: number; anteriores: LogEntry[] }[];
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
      { mnq: 20, lotes: 0.21, meta: 1080 },
      { mnq: 20, lotes: 0.33, meta: 1080 },
      { mnq: 20, lotes: 0.51, meta: 1080 },
      { mnq: 20, lotes: 0.80, meta: 3000 },
      { mnq: 2, lotes: 0.19, meta: 200 },
      { mnq: 2, lotes: 0.21, meta: 200 },
      { mnq: 2, lotes: 0.23, meta: 200 },
      { mnq: 2, lotes: 0.25, meta: 200 },
    ],
  },
  saque2: {
    params: { mnq: 10, hfm: 100, mll: 2000, saldoInicial: 732, taxa: 0, lucroDesejado: 0, marginPerLot: 873, stopoutPct: 50, saqueAprovada: 1300, folgaExtraPct: 20, ativoReal: "ouro" },
    days: [
      { mnq: 5, lotes: 0.03, meta: 200 },
      { mnq: 5, lotes: 0.03, meta: 200 },
      { mnq: 5, lotes: 0.03, meta: 200 },
      { mnq: 5, lotes: 0.04, meta: 200 },
      { mnq: 5, lotes: 0.04, meta: 200 },
    ],
  },
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
export function diasAvaliacaoGold(asset: Asset): number {
  const mesa = asset.mesaFuturos ?? "tradefive";
  return Math.max(0, Math.min(asset.days.length, asset.avaliacaoPorMesa?.[mesa] ?? asset.mesaConfig?.avaliacao ?? MESAS_FUTUROS[mesa]?.avaliacao ?? 3));
}

export function removerDiaGold(asset: Asset, indice: number): void {
  if (indice < 0 || indice >= asset.days.length) return;
  const mesa = asset.mesaFuturos ?? "tradefive";
  const avaliacao = diasAvaliacaoGold(asset);
  asset.days.splice(indice, 1);
  asset.avaliacaoPorMesa = { ...asset.avaliacaoPorMesa, [mesa]: indice < avaliacao ? avaliacao - 1 : avaliacao };
  if (indice < asset.attempt.currentDayIndex) asset.attempt.currentDayIndex--;
  asset.attempt.currentDayIndex = Math.min(asset.attempt.currentDayIndex, Math.max(0, asset.days.length - 1));
}

export function adicionarDiaGold(asset: Asset, fase: "avaliacao" | "financiada"): void {
  const mesa = asset.mesaFuturos ?? "tradefive";
  const avaliacao = diasAvaliacaoGold(asset);
  const modelo = asset.days[fase === "avaliacao" ? Math.max(0, avaliacao - 1) : asset.days.length - 1] ?? { mnq: 1, lotes: 1, meta: 150 };
  const posicao = fase === "avaliacao" ? avaliacao : asset.days.length;
  asset.days.splice(posicao, 0, structuredClone(modelo));
  asset.avaliacaoPorMesa = { ...asset.avaliacaoPorMesa, [mesa]: avaliacao + (fase === "avaliacao" ? 1 : 0) };
  if (posicao <= asset.attempt.currentDayIndex && asset.days.length > 1) asset.attempt.currentDayIndex++;
}

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
    // Limites EOD de uma mesa não devem ser herdados automaticamente por outra.
    diasPayout.forEach((dia, i) => { if (i > 0) delete dia.mll; });
    versoes[mesa] = [...diasAvaliacao, ...diasPayout];
    if (mesa === "topstep") {
      // Duas metas de 1.500 somam o alvo de avaliação de US$ 3.000,
      // mantendo o maior dia em 50% (abaixo do limite de 55%).
      versoes[mesa] = [
        ...diasAvaliacao.map((dia) => ({ ...dia, meta: 1500, mll: 2000 })),
        ...diasPayout.map((dia) => ({ ...dia, meta: 150 })),
      ];
    }
  }
  asset.diasPorMesa = versoes;
  asset.days = structuredClone(versoes[mesa]!);
  asset.mesaFuturos = mesa;
  asset.attempt.currentDayIndex = Math.min(asset.attempt.currentDayIndex, asset.days.length - 1);
}

/** Plano de avaliação Vest, exclusivo da banca, sem integração automática de ordens. */
export function prepararBancaVest(s: State, capital: VestCapital = 50000, dll: VestDailyLimit = 0): void {
  const plano = vestPlan(capital,dll);
  s.vestAccount = {capital, dailyLimitPercent:dll};
  const ouro = s.assets.ouro;
  ouro.mesaFuturos = "vest";
  ouro.avaliacaoPorMesa = {...ouro.avaliacaoPorMesa, vest:1};
  ouro.days = [{mnq:10,lotes:0.01,meta:plano.target,mll:plano.staticDrawdown},
               {mnq:10,lotes:0.01,meta:100,mll:plano.staticDrawdown}];
  ouro.diasPorMesa = {...ouro.diasPorMesa, vest:structuredClone(ouro.days)};
  ouro.params.mnq = 1;
  ouro.params.mll = plano.staticDrawdown;
  ouro.params.taxa = plano.fee;
  ouro.params.saqueAprovada = 0;
  ouro.attempt = freshAttempt();
  s.assets.nasdaq.mesaFuturos = "vest";
  s.assets.nasdaq.days = [{mnq:0,lotes:0,meta:0}];
  s.assets.saque2.mesaFuturos = "vest";
}

/** Aplica regras apenas ao criar uma banca nova. Não reescreve planos existentes. */
export function prepararMesaPersonalizada(state: State, mesa: MesaPersonalizada, referencia?: State): void {
  const erro = validarMesaPersonalizada(mesa);
  if (erro) throw new Error(erro);
  for (const key of ASSETS) {
    const asset = state.assets[key];
    asset.mesaConfig = structuredClone(mesa);
    asset.mesaFuturos = mesa.id;
    const avaliacao = key === "saque2" ? [] : metasAvaliacao(mesa);
    asset.avaliacaoPorMesa = {[mesa.id]: avaliacao.length};
    const origem = referencia?.assets[key];
    const diasAvaliacaoOrigem = origem ? diasAvaliacaoAtivo(origem, key) : 0;
    asset.days = [...avaliacao, ...Array.from({length: mesa.payout}, () => mesa.metaFinanciada)]
      .map((meta, i) => {
        // Associa D1 avaliação a D1 avaliação e D1 financiada a D1 financiada.
        const fase = origem?.days.slice(i < avaliacao.length ? 0 : diasAvaliacaoOrigem,
          i < avaliacao.length ? diasAvaliacaoOrigem : undefined);
        const dia = fase?.[i < avaliacao.length ? i : i - avaliacao.length];
        return {mnq: dia?.mnq ?? 0, lotes: dia?.lotes ?? 0, meta, mll: mesa.lossLimit};
      });
    asset.params.mll = mesa.lossLimit;
    asset.params.saqueAprovada = mesa.saque;
    asset.attempt = freshAttempt();
  }
}
export function diasAvaliacaoAtivo(asset: Asset, key: AssetKey): number {
  return key === "saque2" ? 0 : key === "ouro" || asset.mesaConfig ? diasAvaliacaoGold(asset) : 3;
}
export function nomeMesa(mesa: MesaFuturos, config?: MesaPersonalizada): string {
  return config?.id === mesa ? config.nome : MESAS_FUTUROS[mesa]?.nome ?? "Mesa personalizada";
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
  if (p.vestStudy !== undefined) p.vestStudy = normalizeVestDraft(p.vestStudy);
  if (p.revisoesHistorico !== undefined && !Array.isArray(p.revisoesHistorico)) delete p.revisoesHistorico;
  if (!p.assets.saque2) p.assets.saque2 = clone(defaultAssetsBase.saque2);
  for (const k of ASSETS) {
    const a = p.assets[k];
    if (a.mesaConfig && validarMesaPersonalizada(a.mesaConfig)) delete a.mesaConfig;
    if (!a.attempt) a.attempt = freshAttempt();
    if (a.attempt.resultadosMesaEod !== undefined) {
      const valores = a.attempt.resultadosMesaEod;
      a.attempt.resultadosMesaEod = Object.fromEntries(Object.entries(valores && typeof valores === "object" ? valores : {})
        .filter(([k,v]) => (k === "posSaque" || /^\d+$/.test(k)) && typeof v === "number" && Number.isFinite(v)));
    }
    if (typeof a.attempt.cycleCost !== "number") a.attempt.cycleCost = 0;
    if (typeof a.attempt.custoProprioAcumulado !== "number") a.attempt.custoProprioAcumulado = 0;
    if (!a.bonus) a.bonus = freshBonus();
    if (a.params.saqueDebitadoMesa !== undefined && (!Number.isFinite(a.params.saqueDebitadoMesa) || a.params.saqueDebitadoMesa < 0)) delete a.params.saqueDebitadoMesa;
    if (a.params.comissaoPorContrato !== undefined && (typeof a.params.comissaoPorContrato !== "number" || !Number.isFinite(a.params.comissaoPorContrato) || a.params.comissaoPorContrato < 0)) delete a.params.comissaoPorContrato;
    const d = defaultAssetsBase[k].params;
    if (typeof a.params.marginPerLot !== "number") a.params.marginPerLot = d.marginPerLot;
    if (typeof a.params.stopoutPct !== "number") a.params.stopoutPct = d.stopoutPct;
    if (typeof a.params.saqueAprovada !== "number") a.params.saqueAprovada = 0;
    if (typeof a.params.folgaExtraPct !== "number") a.params.folgaExtraPct = d.folgaExtraPct;
  }
  if (p.assets.saque2.params.ativoReal !== "ouro" && p.assets.saque2.params.ativoReal !== "nasdaq") p.assets.saque2.params.ativoReal = "ouro";
  if (!Array.isArray(p.log)) p.log = [];
  for (const e of p.log) {
    if (e.continuacaoSaque !== undefined) {
      const c = e.continuacaoSaque;
      const campos = ["numero", "saldoAntes", "saldoDepois", "bruto", "liquido", "resultadoAcumulado", "divida", "forexProprio", "forexBonus", "bonusUtilizado", "bonusCap"];
      if (!c || !["ouro", "nasdaq"].includes(c.origem) || !campos.every(k => Number.isFinite(c[k])) || !Number.isInteger(c.numero) || c.numero < 2) delete e.continuacaoSaque;
    }
  }
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

/** Interpreta quantias inseridas manualmente sem converter entradas inválidas em zero.
 * Aceita 1200,50, 1.200,50 e 1200.50; rejeita texto, Infinity e negativos.
 */
export function parseValorFinanceiro(input: string): number | null {
  const value = input.trim().replace(/\s/g, "");
  if (!value) return null;
  const brasileiro = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(value);
  const simples = /^\d+(?:[.,]\d+)?$/.test(value);
  if (!brasileiro && !simples) return null;
  const normalizado = brasileiro ? value.replace(/\./g, "").replace(",", ".") : value.replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Resultado CFD pode ser negativo (perda); rejeita quantias malformadas. */
export function parseResultadoCfd(input: string): number | null {
  const s = input.trim();
  const negative = s.startsWith("-");
  const unsigned = s.startsWith("-") || s.startsWith("+") ? s.slice(1) : s;
  const value = parseValorFinanceiro(unsigned);
  if (value === null) return null;
  return negative ? -value : value;
}

export function clampDayIndex(a: Asset): number {
  if (a.days.length === 0) { a.attempt.currentDayIndex = 0; return -1; }
  if (a.attempt.currentDayIndex >= a.days.length) a.attempt.currentDayIndex = a.days.length - 1;
  if (a.attempt.currentDayIndex < 0) a.attempt.currentDayIndex = 0;
  return a.attempt.currentDayIndex;
}

export interface DayCalc {
  limiteDoCard?: number;
  ticksReprova?: number | undefined;
  valorTickMesa?: number;
  pontos: number; custoSePassar: number; passa: number; pontosReprova: number; reprova: number;
  dividaHoje: number; alvoBruto: number; liquidoSeReprovar: number; bateuAlvo: boolean;
}

/** Topstep 50K. Valores de abertura de cada sessão, após o ajuste EOD anterior. */
export function limitesTopstep(a: Asset, key: AssetKey, indice: number) {
  const avaliacao = diasAvaliacaoAtivo(a, key);
  const inicial = indice < avaliacao ? 50000 : 0;
  const resultados = a.attempt.resultadosMesaEod ?? {};
  const posSaque = key === "saque2";
  let saldo = posSaque ? resultados.posSaque ?? 0 : inicial;
  let piso = posSaque ? 0 : inicial - a.params.mll;
  for (let i = indice < avaliacao ? 0 : avaliacao; i < indice; i++) {
    const resultado = resultadoMesaDia(a, i);
    saldo = Math.round((saldo + resultado) * 100) / 100;
    piso = Math.max(piso, Math.min(inicial, Math.round((saldo - a.params.mll) * 100) / 100));
  }
  return { saldo, piso, distancia: Math.max(0, Math.round((saldo - piso) * 100) / 100) };
}

/** Tradeify 50K: avaliação móvel sem trava; Sim Funded trava em 50.100. */
export function limitesTradeify(a: Asset, key: AssetKey, indice: number) {
  const avaliacao = diasAvaliacaoAtivo(a, key);
  const financiada = indice >= avaliacao;
  const resultados = a.attempt.resultadosMesaEod ?? {};
  const posSaque = key === "saque2";
  let piso = posSaque ? 50100 : 50000 - a.params.mll;
  let saldo = posSaque ? resultados.posSaque ?? piso : 50000;
  for (let i = financiada ? avaliacao : 0; i < indice; i++) {
    saldo = Math.round((saldo + (resultadoMesaDia(a, i))) * 100) / 100;
    const novoPiso = Math.round((saldo - a.params.mll) * 100) / 100;
    piso = Math.max(piso, financiada ? Math.min(50100, novoPiso) : novoPiso);
  }
  return { saldo, piso, distancia: Math.max(0, Math.round((saldo - piso) * 100) / 100) };
}

/** Lucid Flex: valores relativos ao saldo nominal, válidos também para 25K. */
export function limitesLucid(a: Asset, key: AssetKey, indice: number) {
  const avaliacao = diasAvaliacaoAtivo(a, key);
  let saldo = 0, piso = -a.params.mll;
  for (let i = indice < avaliacao ? 0 : avaliacao; i < indice; i++) {
    saldo = Math.round((saldo + (resultadoMesaDia(a, i))) * 100) / 100;
    piso = Math.max(piso, Math.min(100, saldo - a.params.mll));
  }
  return {saldo, piso, distancia: Math.max(0, Math.round((saldo - piso) * 100) / 100)};
}

/** Projeção sobre metas planejadas, não um limite efetivo confirmado pela mesa. */
export function lossLimitGoldProjetado(a: Asset, indice: number): number {
  if (a.mesaFuturos === "lucid") return limitesLucid(a, "ouro", indice).distancia;
  if (a.mesaFuturos === "topstep") return limitesTopstep(a, "ouro", indice).distancia;
  if (a.mesaFuturos === "vest") return a.params.mll;
  if (a.mesaConfig) return a.params.mll;
  if ((a.mesaFuturos ?? "tradefive") === "tradefive") return limitesTradeify(a, "ouro", indice).distancia;
  const avaliacao = diasAvaliacaoGold(a);
  if (indice <= avaliacao) return a.params.mll;
  const metasAnteriores = a.days.slice(avaliacao, indice).reduce((soma, _dia, i) => soma + resultadoMesaDia(a, avaliacao + i), 0);
  return Math.max(0, a.params.mll * (1 + metasAnteriores / 50000));
}

export function lossLimitGoldEfetivo(a: Asset, indice: number): number {
  if (a.mesaFuturos === "topstep") return limitesTopstep(a, "ouro", indice).distancia;
  if (a.mesaFuturos === "vest") return a.params.mll;
  if (a.mesaConfig) return dayMll(a, a.days[indice] ?? {mnq:0, lotes:0, meta:0});
  const manual = a.days[indice]?.mll;
  return typeof manual === "number" && Number.isFinite(manual) && manual > 0 ? manual : lossLimitGoldProjetado(a, indice);
}

export function computeAssetCalcs(a: Asset, key: AssetKey, continuidade?: { divida: number; limites: number[] }): DayCalc[] {
  const { mnq: mnqPt, hfm: hfmPt, taxa, lucroDesejado } = a.params;
  const incluiPretensao = key === "saque2";
  let divida = taxa + (continuidade?.divida ?? 0);
  return a.days.map((d) => {
    // Vest GC-PERP: d.mnq armazena unidades Vest (USDC 1 por ponto por unidade).
    // Nunca reutilizar o multiplicador de contratos CME, que pode ter sido editado.
    const exp = a.mesaFuturos === "vest" && key === "ouro" ? d.mnq : d.mnq * mnqPt;
    const pontos = exp > 0 ? d.meta / exp : 0;
    const custoSePassar = pontos * d.lotes * hfmPt;
    const indice = a.days.indexOf(d);
    const stopManual = d.stopPlanejadoTopstep;
    const limiteAutomatico = continuidade?.limites[indice];
    const limite = limiteAutomatico !== undefined && !(Number.isFinite(d.mll) && (d.mll ?? 0) > 0) && !(Number.isFinite(d.stopPlanejadoTopstep) && (d.stopPlanejadoTopstep ?? 0) > 0) ? limiteAutomatico : a.mesaFuturos === "topstep" ? (typeof stopManual === "number" && Number.isFinite(stopManual) && stopManual > 0
      ? stopManual : limitesTopstep(a, key, indice).distancia) : a.mesaFuturos === "tradefive" && !d.mll ? limitesTradeify(a, key, indice).distancia
      : a.mesaFuturos === "lucid" && d.mll === undefined ? limitesLucid(a, key, indice).distancia
      : key === "ouro" || a.mesaConfig ? lossLimitGoldEfetivo(a, indice) : dayMll(a, d);
    const pontosAtePiso = exp > 0 ? limite / exp : 0;
    const ativo = key === "saque2" ? (a.params.ativoReal ?? "ouro") : key;
    const ticksPorPonto = ativo === "ouro" ? 10 : 4;
    // Primeiro tick negociável que toca ou atravessa o piso da mesa.
    const ticksReprova = exp > 0
      ? Math.ceil(Number((pontosAtePiso * ticksPorPonto).toFixed(10))) : undefined;
    const pontosReprova = ticksReprova === undefined ? pontosAtePiso : ticksReprova / ticksPorPonto;
    const reprova = pontosReprova * d.lotes * hfmPt;
    const dividaReal = divida;
    const dividaHoje = incluiPretensao ? dividaReal + lucroDesejado : dividaReal;
    const alvoBruto = incluiPretensao ? dividaHoje : dividaReal + lucroDesejado;
    const liquidoSeReprovar = reprova - dividaReal;
    divida += custoSePassar;
    return { pontos, limiteDoCard: limite, ticksReprova, valorTickMesa: exp / ticksPorPonto, custoSePassar, passa: -custoSePassar, pontosReprova, reprova, dividaHoje, alvoBruto, liquidoSeReprovar, bateuAlvo: liquidoSeReprovar >= lucroDesejado * 0.98 };
  });
}

export function nextLogId(s: State) { return s.log.reduce((m, e) => Math.max(m, e.id || 0), 0) + 1; }
/** Inclui saldo, resultado CFD, crédito, depósitos e logs de movimentação. */
function assinaturaForex(s: State): string {
  return JSON.stringify({
    cfdBalance: s.cfdBalance, forexSaldoReal: s.forexSaldoReal,
    bonus: ASSETS.map((key) => s.assets[key].bonus),
  });
}
function pushLog(s: State, e: Omit<LogEntry, "id" | "ts">) {
  s.log.push({ ...e, id: nextLogId(s), ts: Date.now(), assinaturaForexApos: assinaturaForex(s) } as LogEntry);
}
export function podeDesfazerUltimaOperacao(s: State): boolean {
  const last = s.log.at(-1);
  // Sem assinatura (registros antigos), não há como garantir que o saldo não mudou.
  return !!last?.assinaturaForexApos && last.assinaturaForexApos === assinaturaForex(s);
}

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
  const calc = { ...calculosDoEstado(s, key)[idx]! };
  const teorico = -calc.custoSePassar;
  if (typeof realCfd === "number" && Number.isFinite(realCfd)) calc.custoSePassar = -realCfd;
  const isLast = idx === a.days.length - 1;
  const prev = { prevAttempt: structuredClone(a.attempt), ...(a.attempt.resultadosMesaEod ? { prevResultadosMesaEod: {...a.attempt.resultadosMesaEod} } : {}), prevBonusTodos: Object.fromEntries(ASSETS.map((k) => [k, structuredClone(s.assets[k].bonus)])) as Record<AssetKey, Bonus>, prevForexSaldoReal: s.forexSaldoReal, prevCfdBalance: s.cfdBalance, prevCounts: { ...s.counts }, prevDayIndex: a.attempt.currentDayIndex, prevCycleCost: a.attempt.cycleCost || 0, prevCustoProprioAcumulado: a.attempt.custoProprioAcumulado || 0, prevTotalGasto: s.totalGasto, prevBonusDeposito: a.bonus.deposito || 0, prevBonusAtual: a.bonus.bonusAtual || 0 };
  const taxaCobrada = idx === 0 ? a.params.taxa : 0;
  const custoDoDia = calc.custoSePassar + taxaCobrada;
  const resultadoMesa = resultadoMesaDia(a, idx);
  const continuacao = key === "saque2" ? simularSaque2(s, 100, {indice: idx, custo: calc.custoSePassar, resultadoMesa}) : null;
  const saque = isLast ? continuacao?.segundo.saque ?? a.params.saqueAprovada ?? 0 : 0;
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
  const registroSaque = continuacao && isLast ? {
    origem: continuacao.origemKey, numero: continuacao.numeroCiclo,
    saldoAntes: continuacao.baseSaque2, saldoDepois: continuacao.baseSaque2 - continuacao.saque2Bruto!,
    bruto: continuacao.saque2Bruto!, liquido: saque,
    resultadoAcumulado: continuacao.resultadoAcumulado,
    divida: Math.max(0, continuacao.dividaAnterior - continuacao.segundo.resultadoFinal),
    forexProprio: continuacao.segundo.proprioRecuperavel, forexBonus: continuacao.segundo.bonusRestante,
    bonusUtilizado: continuacao.bonusUtilizado + continuacao.segundo.bonusTotal, bonusCap: continuacao.segundo.bonusCap,
  } satisfies ContinuacaoSaque : undefined;
  pushLog(s, { ...(continuacao ? {origemSaque: continuacao.origemKey, resultadoMesa} : {}), ...(registroSaque ? {continuacaoSaque: registroSaque} : {}), asset: key, day: idx + 1, tipo, delta, saldoApos: s.cfdBalance, custoDia: calc.custoSePassar, custoCiclo: cicloCusto, taxaCobrada, saque, proporcaoPropria: deb.proporcaoPropria, custoProprioDia, custoBonusDia: deb.custoBonus, custoProprioCiclo: isLast ? custoProprioAcumulado : null, resultadoReal, cfdTeorico: teorico, cfdReal: -calc.custoSePassar, spread: -calc.custoSePassar - teorico, ...prev });
}

export function handleStop(s: State, key: AssetKey, realCfd?: number) {
  const a = s.assets[key];
  const idx = clampDayIndex(a);
  if (idx < 0) return;
  const calc = { ...calculosDoEstado(s, key)[idx]! };
  const teorico = calc.reprova;
  if (typeof realCfd === "number" && Number.isFinite(realCfd)) calc.reprova = realCfd;
  const taxaCobrada = idx === 0 ? a.params.taxa : 0;
  const delta = calc.reprova - taxaCobrada;
  const prev = { prevAttempt: structuredClone(a.attempt), ...(a.attempt.resultadosMesaEod ? { prevResultadosMesaEod: {...a.attempt.resultadosMesaEod} } : {}), prevBonusTodos: Object.fromEntries(ASSETS.map((k) => [k, structuredClone(s.assets[k].bonus)])) as Record<AssetKey, Bonus>, prevForexSaldoReal: s.forexSaldoReal, prevCfdBalance: s.cfdBalance, prevCounts: { ...s.counts }, prevDayIndex: a.attempt.currentDayIndex, prevCycleCost: a.attempt.cycleCost || 0, prevCustoProprioAcumulado: a.attempt.custoProprioAcumulado || 0, prevTotalGasto: s.totalGasto, prevBonusDeposito: a.bonus.deposito || 0, prevBonusAtual: a.bonus.bonusAtual || 0 };
  const custoTotalCiclo = prev.prevCycleCost + taxaCobrada;
  if (calc.reprova >= 0) a.bonus.deposito = (a.bonus.deposito || 0) + calc.reprova;
  else debitarCustoDoBonus(s, key, -calc.reprova);
  atualizarSaldoReal(s, calc.reprova);
  const resultadoReal = calc.reprova - custoTotalCiclo;
  s.cfdBalance += delta;
  s.totalGasto += taxaCobrada;
  s.counts.reprovadas++;
  a.attempt = freshAttempt();
  pushLog(s, { ...(key === "saque2" ? {origemSaque: a.params.ativoReal === "nasdaq" ? "nasdaq" as const : "ouro" as const} : {}), asset: key, day: idx + 1, tipo: "reprovada", delta, saldoApos: s.cfdBalance, bruto: calc.reprova, taxaCobrada, custoCiclo: custoTotalCiclo, proporcaoPropria: 1, custoProprioDia: 0, custoBonusDia: 0, custoProprioCiclo: prev.prevCustoProprioAcumulado, resultadoReal, cfdTeorico: teorico, cfdReal: calc.reprova, spread: calc.reprova - teorico, ...prev });
}

export function undoLast(s: State) {
  if (!podeDesfazerUltimaOperacao(s)) return;
  const last = s.log[s.log.length - 1];
  if (!last) return;
  if (typeof last.prevCfdBalance === "number") s.cfdBalance = last.prevCfdBalance;
  if (typeof last.prevForexSaldoReal === "number") s.forexSaldoReal = last.prevForexSaldoReal;
  if (last.prevBonusTodos) for (const k of ASSETS) s.assets[k].bonus = structuredClone(last.prevBonusTodos[k]);
  if (last.prevCounts) s.counts = last.prevCounts;
  if (typeof last.prevTotalGasto === "number") s.totalGasto = last.prevTotalGasto;
  const a = s.assets[last.asset];
  if (last.prevAttempt) a.attempt = structuredClone(last.prevAttempt);
  if (last.prevResultadosMesaEod) a.attempt.resultadosMesaEod = {...last.prevResultadosMesaEod};
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
  const ciclos = s.log.filter((e) => e.tipo === "aprovada" || e.tipo === "reprovada");
  // Usar os valores registrados na época da operação, nunca parâmetros atuais da banca.
  const profit = ciclos.reduce((total, e) => {
    if (typeof e.resultadoReal === "number" && Number.isFinite(e.resultadoReal)) return total + e.resultadoReal;
    if (e.tipo === "aprovada" && typeof e.custoProprioCiclo === "number") return total + (e.saque ?? 0) - e.custoProprioCiclo;
    return total;
  }, 0);
  const resultadoReal = ciclos.reduce((total, e) =>
    total + (typeof e.resultadoReal === "number" && Number.isFinite(e.resultadoReal) ? e.resultadoReal : 0), 0);
  const custoProprio = ciclos.reduce((total, e) =>
    total + (typeof e.custoProprioCiclo === "number" && Number.isFinite(e.custoProprioCiclo) ? Math.max(0, e.custoProprioCiclo) : 0), 0);
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
  if (!Number.isFinite(valor) || valor <= 0) return;
  const b = s.assets[key].bonus;
  const espaco = Math.max(0, b.bonusCap - b.bonusGanhoTotal);
  const ganho = Math.min(valor, espaco);
  atualizarSaldoReal(s, valor);
  b.deposito += valor; b.bonusAtual += ganho; b.bonusGanhoTotal += ganho;
  b.log.push({ ts: Date.now(), tipo: "deposito", valor, dia: s.assets[key].attempt.currentDayIndex + 1, bonusGanho: ganho });
}

export function aplicarSaque(s: State, key: AssetKey, valor: number) {
  if (!Number.isFinite(valor) || valor <= 0) return;
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
  // O saldo real é global. Reduzir apenas o depósito do ativo selecionado
  // deixa valores antigos disponíveis em outros ativos e distorce os indicadores.
  // Os campos "deposito" são parcelas históricas de capital próprio, não
  // representam todo o saldo Forex (que também incorpora lucros/prejuízos).
  for (const assetKey of ASSETS) {
    const credit = s.assets[assetKey].bonus;
    credit.deposito = Math.max(0, credit.deposito * (1 - proporcao));
  }
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

/** Reinicia apenas o acumulado promocional; saldos e lançamentos anteriores são preservados. */
export function reiniciarCicloBonus(s: State, key: AssetKey) {
  const b = s.assets[key].bonus;
  if (!(b.bonusGanhoTotal > 0)) return;
  b.log.push({ ts: Date.now(), tipo: "reinicio_ciclo", valor: b.bonusGanhoTotal });
  b.bonusGanhoTotal = 0;
}

export function resetBonus(s: State, key: AssetKey) {
  const b = s.assets[key].bonus;
  if (!(b.bonusAtual || 0) && !(b.deposito || 0) && !(b.bonusGanhoTotal || 0)) return;
  b.log.push({ ts: Date.now(), tipo: "reset", valor: b.bonusAtual, depositoZerado: b.deposito || 0 });
  b.bonusAtual = 0; b.deposito = 0; b.bonusGanhoTotal = 0;
}

/** Dinheiro novo mínimo que cobre a falta, contando somente bônus ainda concedível. */
export function aporteMinimoComBonus(falta: number, bonusPct: number, espacoBonus: number): number {
  const necessidade = Math.max(0, Number.isFinite(falta) ? falta : 0);
  const taxa = Math.max(0, Number.isFinite(bonusPct) ? bonusPct : 0) / 100;
  const teto = Math.max(0, Number.isFinite(espacoBonus) ? espacoBonus : 0);
  if (necessidade === 0 || taxa === 0 || teto === 0) return necessidade;
  return Math.max(necessidade / (1 + taxa), necessidade - teto);
}

/** Projeta depósitos sobre o Forex compartilhado, consumindo o teto promocional uma única vez. */
export function projetarAportesFuturos(o: {
  necessidades: number[]; perdas: number[]; indiceAtual: number;
  saldoReal: number; bonusAtual: number; bonusPct: number; bonusCapRestante: number;
}) {
  let proprio = Math.max(0, o.saldoReal || 0);
  let bonus = Math.max(0, o.bonusAtual || 0);
  let capRestante = Math.max(0, o.bonusCapRestante || 0);
  const taxa = Math.max(0, o.bonusPct || 0) / 100;
  return o.necessidades.map((necessario, indice) => {
    const proprioAntes = proprio, bonusAntes = bonus;
    const saldoAntes = proprioAntes + bonusAntes;
    if (indice < o.indiceAtual) return { proprioAntes, bonusAntes, saldoAntes, deposito: 0, bonusGanho: 0 };
    const falta = Math.max(0, necessario - saldoAntes);
    const deposito = aporteMinimoComBonus(falta, o.bonusPct, capRestante);
    const bonusGanho = Math.min(deposito * taxa, capRestante);
    capRestante = Math.max(0, capRestante - bonusGanho);
    const perda = Math.max(0, o.perdas[indice] || 0);
    const restante = Math.max(0, perda - (proprio + deposito));
    proprio = Math.max(0, proprio + deposito - perda);
    bonus = Math.max(0, bonus + bonusGanho - restante);
    return { proprioAntes, bonusAntes, saldoAntes, deposito, bonusGanho };
  });
}

/** Aporte fracionado: deposita só a parte que, somada ao bônus (pct% do depósito, limitado ao teto), cobre o necessário do dia. */
export function calcAporteFracionado(o: { margem: number; stopoutPct: number; custoDia: number; bonusPct: number; bonusCap: number; bancaIntegral: number }) {
  const margem = Math.max(0, o.margem || 0);
  const total = margem * (1 + Math.max(0, o.stopoutPct || 0) / 100) + Math.max(0, o.custoDia || 0);
  const cap = Number.isFinite(o.bonusCap) ? Math.max(0, o.bonusCap) : 0;
  const proprio = aporteMinimoComBonus(total, o.bonusPct, cap);
  const bonus = total - proprio;
  const economia = Math.max(0, (o.bancaIntegral || 0) - proprio);
  return { total, proprio, bonus, economia };
}

/** Mesma base da Meta geral: até cinco dias financiados, sem lucro da avaliação.
 * Projeção 50%/90%; Lucid limita o saque bruto projetado a US$ 2.000.
 * Elegibilidade efetiva deve ser conferida na mesa.
 */
export function projetarPrimeiroPayout(a: Asset, key: AssetKey) {
  const avaliacao = diasAvaliacaoAtivo(a, key);
  const lucro = a.days.slice(avaliacao, avaliacao + 5).reduce((total, d, i) =>
    total + resultadoMesaDia(a, avaliacao + i), 0);
  const brutoSemTeto = Math.round(Math.max(0, lucro) * 0.5 * 100) / 100;
  const bruto = a.mesaFuturos === "lucid" ? Math.min(2000, brutoSemTeto) : brutoSemTeto;
  const liquido = Math.round(bruto * 0.9 * 100) / 100;
  return {lucro, bruto, liquido};
}

export interface CaixaDia { dia: number; necessario: number; saldoAntes: number; proprioAntes: number; bonusAntes: number; proprioDisponivel: number; bonusDisponivel: number; excedenteProprioSacavel: number; deposito: number; bonusGanho: number; perda: number; perdaPropria: number; perdaBonus: number; proprioRestante: number; bonusRestante: number; caixaAcumulado: number }
/** Caixa do ciclo completo: simula passar em todos os dias (pior caso de caixa) com aporte fracionado e bônus com teto. */
export function calcCaixaCiclo(a: Asset, key: AssetKey, bonusPct: number, inicio?: { proprio: number; bonus: number; bonusUtilizado: number }, calcs = computeAssetCalcs(a, key), saqueProjetado?: number) {
  const p = Math.max(0, bonusPct || 0) / 100;
  const cap = Number.isFinite(a.bonus.bonusCap) ? Math.max(0, a.bonus.bonusCap) : 0;
  const taxa = a.params.taxa || 0;
  const proprioInicial = Math.max(0, inicio?.proprio ?? 0);
  let proprio = proprioInicial, bonus = Math.max(0, inicio?.bonus ?? 0), bonusTotal = 0, depositado = 0, perdaPropriaTotal = 0, perdaBonusTotal = 0;
  const dias: CaixaDia[] = a.days.map((d, i) => {
    const perda = Math.max(0, calcs[i]?.custoSePassar ?? 0);
    const necessario = (a.params.marginPerLot || 0) * d.lotes * (1 + Math.max(0, a.params.stopoutPct || 0) / 100) + perda;
    const proprioAntes = proprio;
    const bonusAntes = bonus;
    const saldoAntes = proprioAntes + bonusAntes;
    const falta = Math.max(0, necessario - saldoAntes);
    const espaco = Math.max(0, cap - (inicio?.bonusUtilizado ?? 0) - bonusTotal);
    const deposito = aporteMinimoComBonus(falta, bonusPct, espaco);
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
  const saque = saqueProjetado ?? (key !== "saque2" && a.mesaFuturos !== "vest" ? projetarPrimeiroPayout(a, key).liquido : a.params.saqueAprovada || 0);
  const caixaMaximo = taxa + depositado;
  const recuperado = proprio + saque;
  const totalPerda = dias.reduce((acc, d) => acc + d.perda, 0);
  return { dias, taxa, totalDepositado: depositado, totalPerda, perdaPropriaTotal, perdaBonusTotal, caixaMaximo, proprioRecuperavel: proprio, saque, recuperado, resultadoFinal: recuperado - caixaMaximo - proprioInicial, bonusTotal, bonusRestante: bonus, bonusCap: cap };
}


/** Continuidade apenas calculada: não grava saldo, bônus, histórico ou depósitos reais. */
export function simularSaque2(s: State, bonusPct = 100, operacao?: {indice: number; custo: number; resultadoMesa: number}) {
  const segundo = s.assets.saque2;
  const origemKey: "ouro" | "nasdaq" = segundo.params.ativoReal === "nasdaq" ? "nasdaq" : "ouro";
  const origem = s.assets[origemKey];
  const payout = projetarPrimeiroPayout(origem, origemKey);
  const primeiro = calcCaixaCiclo(origem, origemKey, bonusPct);
  const retirada = origem.mesaFuturos === "vest" ? origem.params.saqueDebitadoMesa ?? origem.params.saqueAprovada : payout.bruto;
  const lucroMesa = payout.lucro;
  const mesa = origem.mesaFuturos ?? "tradefive";
  // Valores relativos ao saldo nominal: assim 25K e 50K usam a mesma regra.
  const pisoTravado = mesa === "topstep" ? 0 : mesa === "lucid" || mesa === "tradefive" ? 100 : undefined;
  const anteriores = s.log.filter(e => e.asset === "saque2" && e.origemSaque === origemKey);
  const fechamento = [...anteriores].reverse().find(e => e.tipo !== "profit");
  const ultimo = fechamento?.tipo === "aprovada" ? fechamento.continuacaoSaque : undefined;
  const numeroCiclo = ultimo ? ultimo.numero + 1 : 2;
  const saldoMesaInicial = ultimo?.saldoDepois ?? lucroMesa - retirada;
  const resultadoAnterior = ultimo?.resultadoAcumulado ?? primeiro.resultadoFinal;
  const dividaAnterior = ultimo?.divida ?? Math.max(0, -primeiro.resultadoFinal);
  const forexProprioInicial = ultimo?.forexProprio ?? primeiro.proprioRecuperavel;
  const forexBonusInicial = ultimo?.forexBonus ?? primeiro.bonusRestante;
  const bonusUtilizado = ultimo?.bonusUtilizado ?? primeiro.bonusTotal;
  const diasRegistrados = anteriores.filter(e => e.tipo === "profit" && (!fechamento || e.id > fechamento.id));
  const resultados = {...segundo.attempt.resultadosMesaEod};
  for (const e of diasRegistrados) if (Number.isFinite(e.resultadoMesa)) resultados[e.day - 1] = e.resultadoMesa!;
  if (operacao) resultados[operacao.indice] = operacao.resultadoMesa;
  let saldoMesa = saldoMesaInicial;
  const limites = segundo.days.map((d, i) => {
    const folga = pisoTravado === undefined ? dayMll(segundo, d) : Math.max(0, Math.round((saldoMesa - pisoTravado) * 100) / 100);
    saldoMesa += resultados[i] ?? metaLiquidaDia(segundo, d);
    return folga;
  });
  // Transporta o resultado próprio líquido: o payout já recupera custos do ciclo 1.
  // Perda coberta pelo bônus não é dívida do usuário; saldo CFD restante não é perda.
  // Resultado positivo do ciclo 1 não gera crédito para as metas do ciclo 2.
  // Apenas o déficit próprio não recuperado pelo primeiro saque é transportado.
  const divida = dividaAnterior;
  const calcs = computeAssetCalcs(segundo, "saque2", {divida, limites});
  // Os dias efetivamente cadastrados compõem o ciclo; por padrão são cinco.
  const lucroSegundoCiclo = segundo.days.reduce((total, d, i) => total + (resultados[i] ?? metaLiquidaDia(segundo, d)), 0);
  const baseSaque2 = Math.max(0, saldoMesaInicial + lucroSegundoCiclo);
  const saque2Bruto = Math.min(mesa === "lucid" ? 2000 : Infinity, Math.round(baseSaque2 * 0.5 * 100) / 100);
  const saque2Liquido = Math.round(saque2Bruto * 0.9 * 100) / 100;
  const calcsCaixa = calcs.map((c, i) => {
    const registro = diasRegistrados.find(e => e.day === i + 1);
    const custo = operacao?.indice === i ? operacao.custo : typeof registro?.cfdReal === "number" ? -registro.cfdReal : c.custoSePassar;
    return {...c, custoSePassar: custo};
  });
  const segundoCaixa = calcCaixaCiclo({...segundo, bonus: {...segundo.bonus, bonusCap: ultimo?.bonusCap ?? origem.bonus.bonusCap}}, "saque2", bonusPct, {
    proprio: forexProprioInicial, bonus: forexBonusInicial, bonusUtilizado,
  }, calcsCaixa, saque2Liquido);
  return { numeroCiclo, saldoMesaInicial, resultadoAnterior, dividaAnterior, forexProprioInicial, forexBonusInicial, bonusUtilizado, origemKey, primeiro, segundo: segundoCaixa, calcs, limites, lucroMesa, retirada, lucroSegundoCiclo, baseSaque2, saque2Bruto, saque2Liquido,
    resultadoAcumulado: resultadoAnterior + segundoCaixa.resultadoFinal };
}

export function calculosDoEstado(s: State, key: AssetKey): DayCalc[] {
  return key === "saque2" ? simularSaque2(s).calcs : computeAssetCalcs(s.assets[key], key);
}

