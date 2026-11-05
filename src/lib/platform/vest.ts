/** Manual, single-position scenario. USDC and broker USD are never silently equated.
 * Sources and verification limits: docs/vest-perpetuos.md (2026-11-05).
 */
export const VEST_MARKETS = {
  "NQ-PERP": { name: "Nasdaq", broker: "US100Cash", micro: "MNQ", unitsPerMicro: 2, maxLeverage: 50, weekendLeverage: 5 },
  "GC-PERP": { name: "Ouro", broker: "GOLD", micro: "MGC", unitsPerMicro: 10, maxLeverage: 25, weekendLeverage: 3 },
} as const;
export type VestMarket = keyof typeof VEST_MARKETS;
export const newVestDraft = () => ({
  market: "NQ-PERP" as VestMarket, side: "buy" as "buy" | "sell",
  quantity: "", entry: "", exit: "", index: "", leverage: "",
  tick: "", quantityStep: "", entryFeePct: "0,0025", exitFeePct: "0,0025",
  fundingPctHour: "", fundingHours: "0", extraCost: "0",
  capital: "", drawdownPct: "", equity: "", dllPct: "0", resetBalance: "", transfers: "0",
  brokerEntry: "", brokerExit: "", brokerLots: "", brokerPointValue: "",
  brokerStep: "", brokerMin: "", brokerMax: "", brokerCosts: "0", usdcUsd: "",
});
export type VestDraft = ReturnType<typeof newVestDraft>;
export type VestField = Exclude<keyof VestDraft, "market" | "side">;
export function normalizeVestDraft(raw: unknown): VestDraft {
  const d = newVestDraft();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const v = raw as Record<string, unknown>;
  for (const k of Object.keys(d) as (keyof VestDraft)[]) {
    if (k === "market") { if (v[k] === "GC-PERP" || v[k] === "NQ-PERP") d[k] = v[k]; }
    else if (k === "side") { if (v[k] === "buy" || v[k] === "sell") d[k] = v[k]; }
    else if (typeof v[k] === "string" && v[k].length <= 40) d[k] = v[k];
  }
  return d;
}
/** Decimal point or Brazilian decimal comma, optional correctly grouped thousands. */
export function vestNumber(text: string): number | null {
  const s = text.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?)$/.test(s)) return null;
  const grouped = s.includes(",") && /^[+-]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s);
  const n = Number((grouped ? s.replace(/\./g, "") : s).replace(",", "."));
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : null;
}
export function isOnStep(value: number, step: number): boolean {
  if (!(step > 0) || !(value >= 0)) return false;
  const steps = value / step;
  return Number.isFinite(steps) && Math.abs(steps - Math.round(steps)) <= 1e-7;
}
export function calculateVest(d: VestDraft) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const read = (key: VestField, label: string, min = 0, strict = false): number | null => {
    const n = vestNumber(d[key]);
    if (n === null || (strict ? n <= min : n < min)) {
      errors.push(`${label}: informe ${strict ? "um valor maior que" : "um valor a partir de"} ${min}.`); return null;
    }
    return n;
  };
  const q = read("quantity", "Quantidade Vest", 0, true);
  const p = read("entry", "Entrada Vest", 0, true);
  const out = read("exit", "Saída Vest", 0, true);
  const index = read("index", "Preço de referência (index)", 0, true);
  const lev = read("leverage", "Alavancagem", 1);
  const fIn = read("entryFeePct", "Taxa de entrada");
  const fOut = read("exitFeePct", "Taxa de saída");
  const hours = read("fundingHours", "Liquidações horárias de funding");
  const fundingRate = hours === 0 ? 0 : vestNumber(d.fundingPctHour);
  if (hours !== null && !Number.isInteger(hours)) errors.push("Funding: informe a quantidade inteira de liquidações horárias.");
  if (fundingRate === null) errors.push("Informe a taxa horária de funding, incluindo o sinal.");
  const extra = read("extraCost", "Outros custos Vest");
  const market = VEST_MARKETS[d.market];
  if (lev !== null && lev > market.maxLeverage) errors.push(`Alavancagem acima do limite regular documentado: ${market.maxLeverage}x.`);
  if ((fIn !== null && fIn >= 100) || (fOut !== null && fOut >= 100)) errors.push("Taxas devem ser inferiores a 100%.");
  const tick = d.tick.trim() ? read("tick", "Variação mínima de preço", 0, true) : null;
  const step = d.quantityStep.trim() ? read("quantityStep", "Passo da quantidade", 0, true) : null;
  if (!tick) warnings.push("Tick Vest não confirmado: resultados em pontos, sem conversão para ticks.");
  if (!step) warnings.push("Passo da quantidade não confirmado: tamanho ainda não validado para uma ordem.");
  if (q !== null && step && !isOnStep(q, step)) errors.push("Quantidade Vest fora do passo informado; ajuste manualmente.");
  if (tick && p !== null && out !== null && (!isOnStep(p, tick) || !isOnStep(out, tick))) errors.push("Preço Vest fora da variação mínima informada.");
  if (errors.length || q === null || p === null || out === null || index === null || lev === null || fIn === null || fOut === null || hours === null || fundingRate === null || extra === null) {
    return { errors, warnings, trade: null, risk: null, broker: null };
  }
  const sign = d.side === "buy" ? 1 : -1;
  const notional = q * index;
  const gross = sign * q * (out - p);
  const fees = q * (p * fIn + out * fOut) / 100;
  const fundingCost = sign * notional * fundingRate / 100 * hours;
  const net = gross - fees - fundingCost - extra;
  const trade = { gross, fees, fundingCost, net, notional, margin: notional / lev,
    pointValue: q, tickValue: tick ? q * tick : null,
    ticks: tick ? Math.abs(out - p) / tick : null, microEquivalent: q / market.unitsPerMicro,
    weekendMargin: notional / market.weekendLeverage };

  let risk: null | { floor: number; dailyFloor: number | null; effectiveFloor: number; room: number; after: number; breached: boolean; atFloor: boolean; marginEnough: boolean; thresholdPrice: number | null; adverseTicks: number | null } = null;
  const wantsRisk = [d.capital, d.equity, d.drawdownPct].some(v => v.trim());
  if (wantsRisk) {
    const beforeErrors = errors.length;
    const capital = read("capital", "Capital inicial", 0, true);
    const equity = read("equity", "Equity antes da operação");
    const dd = read("drawdownPct", "Drawdown (%)", 0, true);
    const dll = read("dllPct", "DLL (%)");
    const reset = dll && dll > 0 ? read("resetBalance", "Saldo no reset diário", 0, true) : 0;
    const transfers = dll && dll > 0 ? vestNumber(d.transfers) : 0;
    if (transfers === null) errors.push("Transferências desde o reset: informe um valor válido.");
    if ((dd !== null && dd >= 100) || (dll !== null && dll >= 100)) errors.push("Limites percentuais devem ser menores que 100%.");
    if (errors.length === beforeErrors && capital !== null && equity !== null && dd !== null && dll !== null && reset !== null && transfers !== null) {
      const floor = capital * (1 - dd / 100);
      const dailyFloor = dll > 0 ? reset * (1 - dll / 100) + transfers : null;
      const effectiveFloor = Math.max(floor, dailyFloor ?? -Infinity);
      const room = Math.max(0, equity - effectiveFloor);
      // Solve net PnL = -room, including entry + price-dependent exit fees.
      const constantCost = q * p * (fIn + fOut) / 100 + fundingCost + extra;
      const delta = (-room + constantCost) / (q * (sign - fOut / 100));
      const thresholdPrice = p + delta;
      const adverseDistance = Math.max(0, -sign * delta);
      risk = { floor, dailyFloor, effectiveFloor, room, after: equity + net,
        breached: equity + net < effectiveFloor, atFloor: Math.abs(equity + net - effectiveFloor) < 1e-8,
        marginEnough: equity >= trade.margin + q * p * fIn / 100,
        thresholdPrice: thresholdPrice > 0 && adverseDistance > 0 ? thresholdPrice : null,
        adverseTicks: tick && thresholdPrice > 0 && adverseDistance > 0 ? Math.floor(Number((adverseDistance / tick).toFixed(8))) + 1 : null };
      if (constantCost >= room) warnings.push("Custos estimados já consomem a folga disponível; não há distância adversa positiva até o piso.");
    }
  }

  let broker: null | { gross: number; net: number; combined: number; priceDifferenceEntry: number; priceDifferenceExit: number; sensitivityRatio: number } = null;
  if ([d.brokerEntry, d.brokerExit, d.brokerLots, d.brokerPointValue].some(v => v.trim())) {
    const beforeErrors = errors.length;
    const bp = read("brokerEntry", "Entrada MT5", 0, true);
    const bo = read("brokerExit", "Saída MT5", 0, true);
    const lots = read("brokerLots", "Lotes MT5", 0, true);
    const pointValue = read("brokerPointValue", "USD por ponto por lote MT5", 0, true);
    const bstep = read("brokerStep", "Passo do lote MT5", 0, true);
    const bmin = read("brokerMin", "Lote mínimo MT5", 0, true);
    const bmax = read("brokerMax", "Lote máximo MT5", 0, true);
    const costs = read("brokerCosts", "Custos MT5");
    const fx = read("usdcUsd", "USD por USDC", 0, true);
    if (lots !== null && bstep && !isOnStep(lots, bstep)) errors.push("Lote MT5 fora do passo permitido.");
    if (lots !== null && bmin !== null && bmax !== null && (lots < bmin || lots > bmax || bmin > bmax)) errors.push("Lote MT5 fora dos limites mínimo/máximo.");
    if (errors.length === beforeErrors && bp !== null && bo !== null && lots !== null && pointValue !== null && costs !== null && fx !== null) {
      const bgross = -sign * lots * pointValue * (bo - bp);
      broker = { gross: bgross, net: bgross - costs, combined: net * fx + bgross - costs,
        priceDifferenceEntry: p - bp, priceDifferenceExit: out - bo,
        sensitivityRatio: lots * pointValue / (q * fx) };
    }
  }
  if (![...Object.values(trade), ...(risk ? Object.values(risk) : []), ...(broker ? Object.values(broker) : [])].every(v => typeof v !== "number" || Number.isFinite(v))) {
    return { errors: ["Valores fora do intervalo de cálculo."], warnings, trade: null, risk: null, broker: null };
  }
  return { errors, warnings, trade, risk, broker };
}
