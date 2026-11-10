import {describe,it,expect} from 'vitest';
import {defaultState,normalizeState,aplicarDeposito,reverterDeposito,percentualBonus,aporteMinimoComBonus} from '../lib/platform/engine';
describe('percentual do bônus',()=>{
 it.each([0,25,100,150])('aplica %s por cento sem modificar capital próprio',pct=>{
 const s=defaultState(); s.assets.ouro.bonus.percentual=pct;
 aplicarDeposito(s,'ouro',500);
 expect(s.forexSaldoReal).toBe(500);
 expect(s.assets.ouro.bonus.bonusAtual).toBe(500*pct/100);
 expect(s.assets.ouro.bonus.bonusGanhoTotal).toBe(500*pct/100);
 reverterDeposito(s,'ouro');
 expect(s.forexSaldoReal).toBe(0); expect(s.assets.ouro.bonus.bonusAtual).toBe(0);
 expect(percentualBonus(s.assets.ouro.bonus)).toBe(pct);
 });
 it('mantém bônus anterior e respeita teto restante',()=>{
 const s=defaultState(); aplicarDeposito(s,'ouro',500);
 s.assets.ouro.bonus.percentual=150; s.assets.ouro.bonus.bonusCap=1000;
 aplicarDeposito(s,'ouro',500);
 expect(s.assets.ouro.bonus.bonusAtual).toBe(1000);
 expect(s.assets.ouro.bonus.log[0].bonusGanho).toBe(500);
 });
 it('normaliza backups antigos e preserva zero e 150',()=>{
 const s=defaultState(); delete s.assets.ouro.bonus.percentual;
 s.assets.nasdaq.bonus.percentual=0; s.assets.saque2.bonus.percentual=150;
 const restored=normalizeState(JSON.parse(JSON.stringify(s)));
 expect(percentualBonus(restored.assets.ouro.bonus)).toBe(100);
 expect(restored.assets.nasdaq.bonus.percentual).toBe(0);
 expect(restored.assets.saque2.bonus.percentual).toBe(150);
 });
 it('calcula aporte com 150% e teto parcial',()=>{
 expect(aporteMinimoComBonus(1250,150,1500)).toBe(500);
 expect(aporteMinimoComBonus(1250,150,100)).toBe(1150);
 });
});
