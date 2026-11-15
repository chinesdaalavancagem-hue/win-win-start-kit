import { aporteMinimoComBonus, computeAssetCalcs, diasAvaliacaoAtivo, metaLiquidaDia, percentualBonus, projetarPrimeiroPayout, type Asset, type AssetKey, type State } from "./engine";

export type Desfecho = { id: string; titulo: string; falhaNoDia: number | null };
export type EventoSimulado = {
  dia: string; fase: string; operacao: string; mesa: number; forexProprio: number; forexBonus: number;
  caixaPessoal: number; movimento: number;
};
export type DiagnosticoDia = {
  dia: number; margem: number; reservaStopout: number; perdaNoTake: number;
  necessidade: number; saldoAntes: number; aporte: number; bonusNovo: number;
  faltaAntesAporte: number; coberturaValida: boolean;
};
export type ResultadoCenario = {
  id: string; titulo: string; eventos: EventoSimulado[]; diagnosticos: DiagnosticoDia[];
  capitalDepositado: number; caixaFinal: number; saldoProprioFinal: number; saldoBonusFinal: number;
  lucroMesa: number; payout: number; resultadoEconomico: number; alertas: string[];
};

const arred = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;
const max = (v: number) => Math.max(0, Number.isFinite(v) ? v : 0);

/** Esta camada é uma simulação isolada: NÃO registra operações no State e NÃO altera app_data. */
export function desfechosPara(a: Asset, key: AssetKey): Desfecho[] {
  const inicio = Math.min(a.days.length, Math.max(0, a.attempt.currentDayIndex));
  return [
    { id: "aprovou", titulo: "Aprovou os dias", falhaNoDia: null },
    ...a.days.slice(inicio).map((_, offset) => {
      const i = inicio + offset;
      return { id: `quebra-${i}`, titulo: `Reprovação D${i + 1}`, falhaNoDia: i };
    }),
  ];
}

export function simularDesfecho(state: State, key: AssetKey, desfecho: Desfecho, overrides?: { bonusPct?: number; stopoutPct?: number }): ResultadoCenario {
  const a = state.assets[key], calcs = computeAssetCalcs(a, key);
  const inicio = Math.min(a.days.length, Math.max(0, a.attempt.currentDayIndex));
  const avaliacao = diasAvaliacaoAtivo(a, key);
  const payoutProposto = key === "saque2" ? 0 : projetarPrimeiroPayout(a, key).liquido;
  const bonusPct = max(overrides?.bonusPct ?? percentualBonus(a.bonus));
  const stopout = max(overrides?.stopoutPct ?? a.params.stopoutPct);
  const tetoRestante = Math.max(0, max(a.bonus.bonusCap) - max(a.bonus.bonusGanhoTotal));
  let capRestante = tetoRestante;
  let proprio = max(state.forexSaldoReal ?? Object.values(state.assets).reduce((v, x) => v + max(x.bonus.deposito), 0));
  let bonus = Object.values(state.assets).reduce((v, x) => v + max(x.bonus.bonusAtual), 0);
  const proprioInicial = proprio;
  let depositado = 0, caixaPessoal = 0, mesa = 0, payout = 0;
  const eventos: EventoSimulado[] = [], diagnosticos: DiagnosticoDia[] = [], alertas: string[] = [];

  function registrar(dia: string, fase: string, operacao: string, movimento = 0) {
    caixaPessoal = arred(caixaPessoal + movimento);
    eventos.push({ dia, fase, operacao, mesa: arred(mesa), forexProprio: arred(proprio), forexBonus: arred(bonus), caixaPessoal, movimento: arred(movimento) });
  }

  const taxa = inicio === 0 && key !== "saque2" ? max(a.params.taxa) : 0;
  if (taxa) registrar("D0", "Desafio", "Custo de compra / avaliação", -taxa);

  for (let i = inicio; i < a.days.length; i++) {
    const d = a.days[i]!, c = calcs[i]!;
    const fase = i < avaliacao ? "Avaliação" : key === "saque2" ? "Novo saque" : "Financiada";
    const margem = arred(max(a.params.marginPerLot) * max(d.lotes));
    // Reserva conservadora de planejamento. Stop-out não é uma cobrança adicional de margem.
    const reservaStopout = arred(margem * stopout / 100);
    const perdaNoTake = arred(max(c.custoSePassar));
    const necessidade = arred(margem + reservaStopout + perdaNoTake);
    const saldoAntes = arred(proprio + bonus);
    const falta = Math.max(0, arred(necessidade - saldoAntes));
    const aporte = arred(aporteMinimoComBonus(falta, bonusPct, capRestante));
    const bonusNovo = arred(Math.min(capRestante, aporte * bonusPct / 100));
    const totalDepois = saldoAntes + aporte + bonusNovo;
    diagnosticos.push({
      dia: i + 1, margem, reservaStopout, perdaNoTake, necessidade, saldoAntes, aporte, bonusNovo,
      faltaAntesAporte: falta, coberturaValida: totalDepois + 0.011 >= necessidade
    });
    if (falta > 0) alertas.push(`D${i + 1}: faltavam US$ ${falta.toFixed(2)} antes do aporte projetado.`);
    if (totalDepois + 0.011 < necessidade) alertas.push(`D${i + 1}: cobertura insuficiente mesmo após o aporte estimado.`);
    if (aporte > 0) {
      proprio = arred(proprio + aporte);
      bonus = arred(bonus + bonusNovo);
      capRestante = arred(Math.max(0, capRestante - bonusNovo));
      depositado = arred(depositado + aporte);
      registrar(`D${i + 1}`, "Aporte CFD", `Depósito próprio ${aporte.toFixed(2)}; bônus projetado ${bonusNovo.toFixed(2)}`, -aporte);
    }

    if (desfecho.falhaNoDia === i) {
      mesa = arred(mesa - max(c.limiteDoCard));
      registrar(`D${i + 1}`, fase, `Mesa reprova: limite projetado ${max(c.limiteDoCard).toFixed(2)}`);
      // Ganho de Forex é lançado no capital próprio projetado; não contabilizar bônus como saque.
      proprio = arred(proprio + max(c.reprova));
      registrar(`D${i + 1}`, "Hedge CFD", `Resultado Forex positivo teórico ${max(c.reprova).toFixed(2)}`);
      break;
    }

    mesa = arred(mesa + metaLiquidaDia(a, d));
    registrar(`D${i + 1}`, fase, `Mesa atinge meta líquida ${metaLiquidaDia(a,d).toFixed(2)}`);
    // Débito real em primeiro lugar; somente excesso consome o bônus promocional.
    const perdaPropria = Math.min(proprio, perdaNoTake);
    const perdaBonus = Math.min(bonus, Math.max(0, perdaNoTake - perdaPropria));
    proprio = arred(proprio - perdaPropria);
    bonus = arred(bonus - perdaBonus);
    registrar(`D${i + 1}`, "Hedge CFD", `Perda Forex ${perdaNoTake.toFixed(2)} (próprio ${arred(perdaPropria).toFixed(2)}; bônus ${arred(perdaBonus).toFixed(2)})`);
    if (perdaNoTake > perdaPropria + perdaBonus + 0.01)
      alertas.push(`D${i + 1}: perda projetada excede capital próprio e bônus; liquidação pode antecipar o resultado.`);
  }

  if (desfecho.falhaNoDia === null && inicio < a.days.length && key !== "saque2") {
    payout = max(payoutProposto);
    // A projeção é do ciclo configurado, não comprova elegibilidade de saque.
    if (payout > 0) registrar("Saque", "Payout", `Recebimento teórico com split ${payout.toFixed(2)}`, payout);
    alertas.push("Saque condicionado às regras e à elegibilidade efetiva da mesa. O cenário não garante payout.");
  }
  const caixaFinal = arred(caixaPessoal + proprio - proprioInicial);
  if (bonus > 0) alertas.push("Bônus promocional não foi tratado como dinheiro sacável.");
  if (a.mesaFuturos === "vest" && max(a.params.vestPrecoIndice) <= 0)
    alertas.push("Vest: cotação de referência ausente; resultados CFD exigem preço válido.");
  alertas.push("Margem e stop-out são aproximações; spread, slippage e liquidação real podem modificar o resultado.");

  return {
    id: desfecho.id, titulo: desfecho.titulo, eventos, diagnosticos, capitalDepositado: depositado,
    caixaFinal, saldoProprioFinal: proprio, saldoBonusFinal: bonus,
    lucroMesa: mesa, payout, resultadoEconomico: caixaFinal, alertas
  };
}

export function expectativaPonderada(resultados: ResultadoCenario[], pesos: number[]) {
  const soma = pesos.reduce((v, p) => v + max(p), 0);
  if (soma <= 0 || !Number.isFinite(soma)) return null;
  return {
    somaPesos: soma,
    media: arred(resultados.reduce((v, r, i) => v + r.resultadoEconomico * max(pesos[i] ?? 0) / soma, 0)),
    normalizado: Math.abs(soma - 100) > 0.01,
  };
}
