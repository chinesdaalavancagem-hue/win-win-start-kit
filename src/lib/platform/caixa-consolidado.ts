import { aporteMinimoComBonus, computeAssetCalcs, type AssetKey, type State } from "./engine";
import type { Banca } from "./bancas";

export interface PosicaoPlanejada {
  bancaId: string;
  bancaNome: string;
  ativo: AssetKey;
  dia: number;
  margem: number;
  perdaProjetada: number;
  cobertura: number;
}

/**
 * Simulação manual e conservadora para posições hipoteticamente simultâneas.
 * Os bancos não possuem telemetria de posições abertas: só entram as posições
 * explicitamente selecionadas pelo usuário. Nunca subtrair o Forex mais de uma vez.
 */
export function calcularCoberturaSimultanea(o: {
  bancas: Banca[];
  ativosPorBanca: Record<string, AssetKey | undefined>;
  estadoAtivo: State;
  bancaAtivaId?: string | undefined;
  bonusPct: number;
  bonusCapRestante: number;
}) {
  const linhas: PosicaoPlanejada[] = [];
  for (const banca of o.bancas) {
    const ativo = o.ativosPorBanca[banca.id];
    if (!ativo) continue;
    const estado = banca.id === o.bancaAtivaId ? o.estadoAtivo : banca.state;
    const a = estado.assets[ativo];
    if (!a || !a.days.length) continue;
    const indice = Math.max(0, Math.min(a.days.length - 1, a.attempt.currentDayIndex));
    const dia = a.days[indice];
    if (!dia || !Number.isFinite(dia.lotes) || dia.lotes <= 0) continue;
    const calculo = computeAssetCalcs(a, ativo)[indice];
    const margem = Math.max(0, Number.isFinite(a.params.marginPerLot) ? a.params.marginPerLot : 0) * dia.lotes;
    const perdaProjetada = Math.max(0, calculo?.custoSePassar ?? 0);
    const percentual = Math.max(0, Number.isFinite(a.params.stopoutPct) ? a.params.stopoutPct : 0) / 100;
    const cobertura = margem * (1 + percentual) + perdaProjetada;
    linhas.push({ bancaId: banca.id, bancaNome: banca.nome, ativo, dia: indice + 1, margem, perdaProjetada, cobertura });
  }
  const saldoReal = Math.max(0, o.estadoAtivo.forexSaldoReal ?? 0);
  const bonusAtual = Object.values(o.estadoAtivo.assets).reduce(
    (valor, a) => valor + Math.max(0, a.bonus.bonusAtual || 0), 0,
  );
  const necessario = linhas.reduce((valor, linha) => valor + linha.cobertura, 0);
  const disponivel = saldoReal + bonusAtual;
  const falta = Math.max(0, necessario - disponivel);
  const aporteSemBonusNovo = falta;
  const aporteComBonusNovo = aporteMinimoComBonus(falta, o.bonusPct, o.bonusCapRestante);
  return { linhas, necessario, saldoReal, bonusAtual, disponivel, falta, aporteSemBonusNovo, aporteComBonusNovo };
}
