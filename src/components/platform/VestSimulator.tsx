import { useMemo, useState } from "react";
import { calculateVest, newVestDraft, VEST_MARKETS, type VestDraft, type VestField, type VestMarket } from "@/lib/platform/vest";

const fmt = (n: number, digits = 4) => n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const inputClass = "mt-1 w-full min-w-0 rounded-lg border border-cyan-900 bg-[#061322] p-2 text-sm text-slate-100 outline-none focus:border-cyan-400";
const panelClass = "rounded-xl border border-cyan-900/70 bg-[#071426] p-4";

export function VestSimulator({ value, onChange }: { value?: VestDraft | undefined; onChange: (value: VestDraft) => void }) {
  const d = value ?? newVestDraft();
  const [showErrors, setShowErrors] = useState(false);
  const result = useMemo(() => calculateVest(d), [d]);
  const market = VEST_MARKETS[d.market];
  const set = (key: keyof VestDraft, text: string) => onChange({ ...d, [key]: text });
  const field = (key: VestField, label: string, helper?: string) => <label className="block min-w-0 text-xs text-slate-300" key={key}>
    {label}<input className={inputClass} type="text" inputMode="decimal" value={d[key]} maxLength={40}
      onChange={e => set(key, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    {helper && <span className="mt-1 block text-[11px] text-slate-400">{helper}</span>}
  </label>;
  const stat = (label: string, number: number | null, unit = "USDC") => <div className="min-w-0 rounded-lg bg-black/20 p-3" key={label}>
    <dt className="text-xs text-slate-300">{label}</dt><dd className="mt-1 break-words font-mono text-lg font-semibold text-cyan-100">{number === null ? "A confirmar" : `${fmt(number)} ${unit}`}</dd>
  </div>;
  const changeMarket = (market: VestMarket) => {
    // Prices, broker contract specs and tick grids belong to a particular market.
    const empty = newVestDraft();
    onChange({ ...empty, market, side: d.side, capital: d.capital, drawdownPct: d.drawdownPct,
      equity: d.equity, dllPct: d.dllPct, resetBalance: d.resetBalance, transfers: d.transfers });
    setShowErrors(false);
  };
  return <section aria-label="Simulador Vest" className="space-y-4 text-slate-100">
    <div className={panelClass}>
      <h2 className="text-xl font-bold text-cyan-200">Vest · Perpétuos</h2>
      <p className="mt-2 text-sm text-slate-300">Simule uma posição e compare com o MT5. O estudo é salvo nesta conta pelo salvamento da plataforma. Não envia ordens nem registra lucro no histórico.</p>
      <p className="mt-2 text-xs text-amber-200">Preços manuais, sem cotação ao vivo. Use preços de execução estimados (compra no ask, venda no bid), já considerando spread e slippage. Contas e regras consultadas em 05/11/2026.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">Mercado Vest<select className={inputClass} value={d.market} onChange={e => changeMarket(e.target.value as VestMarket)}>
          <option value="NQ-PERP">Nasdaq · NQ-PERP</option><option value="GC-PERP">Ouro · GC-PERP</option>
        </select></label>
        <label className="text-xs text-slate-300">Direção na Vest<select className={inputClass} value={d.side} onChange={e => set("side", e.target.value)}>
          <option value="buy">Compra (MT5 oposto: venda)</option><option value="sell">Venda (MT5 oposto: compra)</option>
        </select></label>
      </div>
      <p className="mt-2 text-xs text-slate-400">Trocar o mercado limpa os preços e as especificações do ativo anterior.</p>
      <p className="mt-3 text-sm">1 unidade = 1 USDC por ponto de preço. Exposição de 1 {market.micro} ≈ {market.unitsPerMicro} unidades Vest, antes de custos e diferenças de cotação.{d.market === "GC-PERP" && " Equivalência GC inferida do contrato linear e das 10 onças do MGC."}</p>
    </div>

    <div className={panelClass}>
      <h3 className="mb-3 font-semibold">Posição e preços</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("quantity", "Quantidade Vest (unidades)", "Não é o valor em USDC do campo Amount.")}
        {field("entry", "Entrada Vest")}{field("exit", "Saída Vest")}
        {field("index", "Preço de referência (index)", "Referência constante usada na estimativa de margem e funding.")}
        {field("leverage", "Alavancagem (x)", `Limite regular documentado: ${market.maxLeverage}x; temporário: ${market.weekendLeverage}x.`)}
        {field("tick", "Variação mínima do preço (tick)", "Confirme no contrato Vest. Não copiar o tick do CME automaticamente.")}
        {field("quantityStep", "Passo da quantidade Vest", "Confirme o incremento permitido na prévia da ordem.")}
      </div>
    </div>

    <details className={panelClass} open>
      <summary className="cursor-pointer font-semibold">Taxas e funding</summary>
      <p className="my-3 text-xs text-slate-400">Ouro e índices: maker 0%; taker 0,0025% por execução. Ordem limitada não garante execução maker. Ajuste as taxas ao tipo efetivo de execução.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("entryFeePct", "Taxa de entrada (%)")}{field("exitFeePct", "Taxa de saída (%)")}
        {field("fundingHours", "Liquidações horárias de funding", "0 somente se não houver nenhuma cobrança/recebimento no cenário.")}
        {field("fundingPctHour", "Funding por hora (%)", "Com sinal. Positivo: compra paga; negativo: venda paga.")}
        {field("extraCost", "Outros custos Vest (USDC)", "Não conte spread novamente se já está nos preços.")}
      </div>
      <p className="mt-3 text-xs text-slate-400">Funding estimado com taxa, quantidade e index constantes. O realizado varia a cada liquidação horária.</p>
    </details>

    <details className={panelClass}>
      <summary className="cursor-pointer font-semibold">Piso da conta e distância até o limite</summary>
      <p className="my-3 text-xs text-slate-400">Opcional. Preencha os valores do plano contratado. A documentação lista 6% nas avaliações de 5K/10K/25K e 2% ou 4% nas Instant; não extrapolamos esses percentuais para a 50K anunciada. Piso geral fixo, sem trailing.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("capital", "Capital inicial Vest (USDC)")}{field("drawdownPct", "Drawdown do contrato (%)")}
        {field("equity", "Equity antes da operação (USDC)", "Simulação com a conta sem outras posições abertas.")}
        {field("dllPct", "DLL do contrato (%)", "Use 0 para plano sem DLL.")}
        {field("resetBalance", "Saldo no reset diário (USDC)", "20h de Nova York; exclui P&L aberto, inclui colateral reservado.")}
        {field("transfers", "Transferências desde o reset (USDC)", "Crédito positivo; saque negativo. Ajusta apenas o piso diário.")}
      </div>
    </details>

    <details className={panelClass}>
      <summary className="cursor-pointer font-semibold">Comparar com {market.broker} no MT5</summary>
      <p className="my-3 text-xs text-slate-400">Opcional, com direção inversa à Vest. Preencha a especificação real da corretora e preços próprios do MT5. A sensibilidade em USD por ponto por lote é tick value ÷ tick size, quando o contrato for linear e a conta estiver em USD.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {field("brokerEntry", "Entrada MT5")}{field("brokerExit", "Saída MT5")}{field("brokerLots", "Lotes MT5")}
        {field("brokerPointValue", "USD por ponto por lote MT5", "Variação de 1,00 no preço; não confundir com o Point de exibição do MT5.")}
        {field("brokerStep", "Passo do lote MT5")}{field("brokerMin", "Lote mínimo MT5")}{field("brokerMax", "Lote máximo MT5")}
        {field("brokerCosts", "Custos MT5 (USD)", "Comissão e swap/custos não embutidos nos preços.")}
        {field("usdcUsd", "USD por USDC", "Informe a conversão do cenário; 1 apenas se assumir paridade.")}
      </div>
    </details>

    <button type="button" className="rounded-lg border border-cyan-600 bg-cyan-950 px-4 py-2 font-semibold" onClick={() => setShowErrors(true)}>Conferir simulação</button>
    {showErrors && result.errors.length > 0 && <ul role="alert" className="list-inside list-disc rounded-xl border border-amber-700 p-4 text-sm text-amber-200">{result.errors.map(e => <li key={e}>{e}</li>)}</ul>}
    {result.trade ? <div className={panelClass} aria-live="polite">
      <h3 className="mb-3 font-semibold">Resultado estimado Vest</h3>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stat("P&L bruto", result.trade.gross)}{stat("Taxas de entrada + saída", result.trade.fees)}
        {stat("Funding (positivo = custo)", result.trade.fundingCost)}{stat("P&L líquido Vest", result.trade.net)}
        {stat("Valor nocional", result.trade.notional)}{stat("Margem inicial estimada", result.trade.margin)}
        {stat("Valor por ponto da posição", result.trade.pointValue)}{stat("Valor por tick da posição", result.trade.tickValue)}
        {stat("Movimento do cenário", result.trade.ticks, "ticks")}
        {stat("Exposição equivalente CME", result.trade.microEquivalent, market.micro)}
        {stat("Margem com limite temporário", result.trade.weekendMargin)}
      </dl>
      {result.risk && <>
        <h3 className="mb-3 mt-5 font-semibold">Limites da conta</h3>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {stat("Piso geral fixo", result.risk.floor)}
          {result.risk.dailyFloor !== null && stat("Piso diário ajustado", result.risk.dailyFloor)}
          {stat("Folga antes da operação", result.risk.room)}{stat("Equity ao final do cenário", result.risk.after)}
          {stat("Preço estimado no piso", result.risk.thresholdPrice, "pontos")}
          {stat("Ticks adversos para ultrapassar o piso", result.risk.adverseTicks, "ticks")}
        </dl>
        <p className="mt-3 text-sm text-amber-200">{result.risk.breached ? "Cenário termina abaixo do piso: reprovação." : result.risk.atFloor ? "Cenário no piso: sem folga." : "Cenário termina acima do piso; não valida o trajeto intradiário."} {!result.risk.marginEnough && "Equity insuficiente para margem inicial + taxa de entrada estimadas."}</p>
        <p className="mt-2 text-xs text-slate-400">Distância considera as taxas e o funding estimados. Não é o Fail Price oficial nem o preço de liquidação: mark price, margem de manutenção e outras posições podem encerrar a operação antes. Tocar o piso não é o mesmo que ultrapassá-lo.</p>
      </>}
      {result.broker && <>
        <h3 className="mb-3 mt-5 font-semibold">Comparação com MT5 · cenário, não garantia</h3>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {stat("P&L líquido MT5", result.broker.net, "USD")}
          {stat("Vest + MT5 (antes de payout)", result.broker.combined, "USD")}
          {stat("Diferença de preços na entrada", result.broker.priceDifferenceEntry, "pontos")}
          {stat("Diferença de preços na saída", result.broker.priceDifferenceExit, "pontos")}
          {stat("Sensibilidade MT5 / Vest", result.broker.sensitivityRatio * 100, "%")}
        </dl>
        <p className="mt-2 text-xs text-slate-400">Soma de P&L, sem taxa de compra da conta, profit split ou custos de saque. Lucro simulado na Vest não é dinheiro disponível para sacar. Diferença de preços não comprova arbitragem executável.</p>
      </>}
      {result.errors.length > 0 && <p className="mt-3 text-sm text-amber-200">Comparação ou limites incompletos. Use “Conferir simulação” para ver os campos pendentes.</p>}
      <ul className="mt-3 list-inside list-disc text-xs text-amber-200">{result.warnings.map(w => <li key={w}>{w}</li>)}</ul>
    </div> : <p className="text-sm text-slate-400">Preencha posição, preços, index e alavancagem para calcular. Campos vazios não viram zero automaticamente.</p>}

    <details className={panelClass}>
      <summary className="cursor-pointer font-semibold">Especificações, horários e fontes</summary>
      <p className="mt-3 text-xs text-slate-300">O tick e o passo de quantidade não foram confirmados na consulta pública; precisam ser informados. Na sexta, às 16h de Nova York, há redução temporária de alavancagem e possível redução/fechamento de posições. Ouro e índices ficam bloqueados de sexta 17h a domingo 18h de Nova York, inclusive para fechar posições.</p>
      <p className="mt-3 text-xs text-slate-300">A Vest informa que API de negociação não está disponível em contas do programa. Este estudo não habilita integração automática nem comprova permissão da mesa para hedge externo.</p>
      <ul className="mt-3 space-y-2 text-xs text-cyan-300">
        {[
          ["Unidades, equivalência e margem", "trading/cross-margin-and-leverage"],
          ["Contratos e preços", "platform/perpetual-contract-specifications"],
          ["Taxas e horários", "trading/markets"], ["Funding", "trading/funding-mechanism"],
          ["Limites de perda", "vest-capital/loss-limits"], ["Limites temporários", "trading/temporary-leverage-limits-tll"],
        ].map(([label, path]) => <li key={path}><a className="underline" href={`https://docs.vestmarkets.com/${path}`} target="_blank" rel="noreferrer">{label}</a></li>)}
      </ul>
    </details>
  </section>;
}
