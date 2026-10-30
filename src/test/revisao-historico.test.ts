import { describe,it,expect } from 'vitest';
import { defaultState,handleProfit,handleStop,historicoTotals,normalizeState,podeDesfazerUltimaOperacao } from '@/lib/platform/engine';
import { revisarHistorico,valoresOperacao } from '@/lib/platform/revisao-historico';
import { extrairForex,novaBanca,parseBancas,resumoBanca } from '@/lib/platform/bancas';
function banca(){const s=defaultState();s.forexSaldoReal=5000;s.assets.ouro.params.taxa=100;return s;}
describe('revisão de operações encerradas',()=>{
 it('corrige 160 para 115 pelo resultado CFD, preservando Forex e o registro anterior',()=>{
  const s=banca(); handleStop(s,'ouro',260);const before=structuredClone(s);const input=s.log.map(valoresOperacao);input[0]!.cfd=215;
  const next=revisarHistorico(s,input,1234);
  expect(historicoTotals(s).profit).toBe(160);expect(historicoTotals(next).profit).toBe(115);
  expect(next.log[0]!.delta).toBe(115);expect(extrairForex(next)).toEqual(extrairForex(s));
  expect(next.counts).toEqual(s.counts);expect(next.revisoesHistorico![0]!.anteriores).toEqual(s.log);
  expect(s).toEqual(before);expect(podeDesfazerUltimaOperacao(next)).toBe(false);
  const b=novaBanca('Revisada',next);b.taxaCompra=100;expect(resumoBanca(b).lucro).toBe(115);
  expect(parseBancas(JSON.stringify({bancasVersion:1,activeId:b.id,bancas:[b]})).bancas[0]!.state.revisoesHistorico).toEqual(next.revisoesHistorico);
 });
 it('recalcula custos posteriores, separa ativos e ciclos e permite correção para mais',()=>{
  const s=banca();handleProfit(s,'ouro',-100);handleStop(s,'nasdaq',300);handleStop(s,'ouro',500);handleStop(s,'ouro',260);
  const input=s.log.map(valoresOperacao); input[0]!.cfd=-145;const next=revisarHistorico(s,input);
  expect(next.log[2]!.resultadoReal).toBe(s.log[2]!.resultadoReal-45);
  expect(next.log[1]!.resultadoReal).toBe(s.log[1]!.resultadoReal);
  expect(next.log[3]!.resultadoReal).toBe(s.log[3]!.resultadoReal);
  const again=next.log.map(valoresOperacao);again[3]!.cfd+=30;expect(historicoTotals(revisarHistorico(next,again)).profit).toBe(historicoTotals(next).profit+30);
 });
 it('corrige perda própria, bônus e saque na aprovação',()=>{
  const s=banca();s.assets.ouro.days=s.assets.ouro.days.slice(0,2);s.assets.ouro.params.saqueAprovada=1000;
  handleProfit(s,'ouro',-100);handleProfit(s,'ouro',-200);
  const input=s.log.map(valoresOperacao);input[0]!.cfd=-150;input[0]!.bonus=20;input[1]!.saque=1100;
  const next=revisarHistorico(s,input);expect(next.log[1]!.resultadoReal).toBe(s.log[1]!.resultadoReal+70);
  expect(next.log[0]!.custoProprioDia).toBe(230);
  expect(next.log.reduce((n,e)=>n+e.delta,0)).toBe(650);
 });
 it('não reaplica a antiga taxa da banca sobre uma taxa explicitamente revisada',()=>{
  const s=banca();handleStop(s,'ouro',260);const input=s.log.map(valoresOperacao);input[0]!.taxa=145;
  const next=revisarHistorico(s,input);const b=novaBanca('Teste',next);b.taxaCompra=100;
  expect(resumoBanca(b).lucro).toBe(115);expect(next.totalGasto).toBe(s.totalGasto+45);
 });
 it('mantém exatamente o histórico quando nenhum valor mudou',()=>{
  const s=banca();handleStop(s,'ouro',260);expect(revisarHistorico(s,s.log.map(valoresOperacao))).toEqual(s);
 });
 it('rejeita valores inválidos e históricos sem base segura de recálculo',()=>{
  const s=banca();handleStop(s,'ouro',260);const input=s.log.map(valoresOperacao);input[0]!.cfd=NaN;
  expect(()=>revisarHistorico(s,input)).toThrow();input[0]!.cfd=-10;input[0]!.bonus=20;expect(()=>revisarHistorico(s,input)).toThrow();
  input[0]!.bonus=0;delete s.log[0]!.resultadoReal;expect(()=>revisarHistorico(s,input)).toThrow('antigo');
  expect(normalizeState({...s,revisoesHistorico:'inválido'}).revisoesHistorico).toBeUndefined();
 });
});
