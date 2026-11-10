import {describe,it,expect} from 'vitest';
import {defaultState,normalizeState,sincronizarParametros} from '../lib/platform/engine';
import {extrairForex,aplicarForex} from '../lib/platform/bancas';
describe('parâmetros vinculados',()=>{
 it('herda comissão da origem e troca entre ouro e nasdaq',()=>{
  const s=defaultState(); s.assets.ouro.params.comissaoPorContrato=3; s.assets.nasdaq.params.comissaoPorContrato=1.5;
  sincronizarParametros(s); expect(s.assets.saque2.params.comissaoPorContrato).toBe(3);
  s.assets.saque2.params.ativoReal='nasdaq'; sincronizarParametros(s);
  expect(s.assets.saque2.params.comissaoPorContrato).toBe(1.5);
 });
 it('leva condições da corretora a todos os ativos e outra mesa sem copiar comissão',()=>{
  const s=defaultState(),antes=structuredClone(s);
  s.assets.ouro.params.stopoutPct=20; s.assets.ouro.bonus.percentual=150;
  sincronizarParametros(s,antes);
  const outra=defaultState(); outra.assets.ouro.params.comissaoPorContrato=1.5;
  const next=aplicarForex(outra,extrairForex(s));
  for(const a of Object.values(next.assets)){expect(a.params.stopoutPct).toBe(20);expect(a.bonus.percentual).toBe(150);}
  expect(next.assets.saque2.params.comissaoPorContrato).toBe(1.5);
  expect(next.log).toEqual(outra.log);
  const previo=structuredClone(next); next.assets.saque2.bonus.percentual=0; sincronizarParametros(next,previo);
  expect(next.assets.ouro.bonus.percentual).toBe(0);
 });
 it('migra legado pela origem preservando depósitos e operações',()=>{
  const s=defaultState(); s.assets.ouro.bonus.percentual=150; s.assets.ouro.params.stopoutPct=20;
  const before=structuredClone(s);
  const n=normalizeState(s);
  expect(n.assets.saque2.bonus.percentual).toBe(150);
  expect(n.assets.saque2.params.stopoutPct).toBe(20);
  expect(n.cfdBalance).toBe(before.cfdBalance); expect(n.log).toEqual(before.log);
 });
});
