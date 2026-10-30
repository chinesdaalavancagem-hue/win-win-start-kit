import {describe,it,expect} from 'vitest';
import {defaultState,reiniciarCicloBonus,aplicarDeposito,normalizeState} from '@/lib/platform/engine';
import {parseBancas,novaBanca,extrairForex,aplicarForex} from '@/lib/platform/bancas';
describe('reinício manual do ciclo promocional',()=>{
 it('zera somente o acumulado e preserva dinheiro, crédito, teto e histórico',()=>{
  const s=defaultState();s.forexSaldoReal=500;s.cfdBalance=700;
  const b=s.assets.ouro.bonus;b.bonusGanhoTotal=3000;b.bonusAtual=150;b.deposito=500;
  const before=structuredClone(s);reiniciarCicloBonus(s,'ouro');
  expect(b.bonusGanhoTotal).toBe(0);expect(b.bonusCap).toBe(3000);
  expect(b.log.at(-1)).toMatchObject({tipo:'reinicio_ciclo',valor:3000});
  const expected=structuredClone(before);expected.assets.ouro.bonus.bonusGanhoTotal=0;expected.assets.ouro.bonus.log=structuredClone(b.log);
  expect(s).toEqual(expected);reiniciarCicloBonus(s,'ouro');expect(b.log).toHaveLength(1);
 });
 it('volta a conceder bônus no próximo depósito sem gerar bônus no clique',()=>{
  const s=defaultState();s.assets.ouro.bonus.bonusGanhoTotal=3000;
  reiniciarCicloBonus(s,'ouro');expect(s.assets.ouro.bonus.bonusAtual).toBe(0);
  aplicarDeposito(s,'ouro',100);expect(s.assets.ouro.bonus.bonusGanhoTotal).toBeGreaterThan(0);
 });
 it('persiste e compartilha o novo contador entre bancas sem apagar registros',()=>{
  const s=defaultState();s.assets.ouro.bonus.bonusGanhoTotal=3000;reiniciarCicloBonus(s,'ouro');
  const b=novaBanca('Teste',s);const doc=parseBancas(JSON.stringify({bancasVersion:1,activeId:b.id,bancas:[b],forex:extrairForex(s)}));
  const restored=aplicarForex(normalizeState(doc.bancas[0]!.state),doc.forex!);
  expect(restored.assets.ouro.bonus.bonusGanhoTotal).toBe(0);
  expect(restored.assets.ouro.bonus.log.at(-1)?.tipo).toBe('reinicio_ciclo');
 });
});
