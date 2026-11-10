import {describe,it,expect} from 'vitest';
import {defaultState,taxasMesaDia} from '../lib/platform/engine';
import {buildOfficialParams,isOfficialParams,applyOfficialParams} from '../lib/platform/official-params';
describe('comissão nos parâmetros oficiais',()=>{
 it('publica e aplica por ativo, recalculando taxas sem alterar histórico e caixa',()=>{
 const master=defaultState(), user=defaultState();
 master.assets.ouro.params.comissaoPorContrato=3;
 master.assets.nasdaq.params.comissaoPorContrato=2;
 master.assets.saque2.params.comissaoPorContrato=0;
 master.assets.ouro.days[0]!.mnq=20;
 user.assets.ouro.params.taxa=132; user.forexSaldoReal=500;
 const log=JSON.stringify(user.log), bonus=JSON.stringify(user.assets.ouro.bonus);
 const payload=JSON.parse(JSON.stringify(buildOfficialParams(master)));
 expect(isOfficialParams(payload)).toBe(true); applyOfficialParams(user,payload);
 expect(user.assets.ouro.params.comissaoPorContrato).toBe(3);
 expect(user.assets.nasdaq.params.comissaoPorContrato).toBe(2);
 expect(user.assets.saque2.params.comissaoPorContrato).toBe(0);
 expect(taxasMesaDia(user.assets.ouro,user.assets.ouro.days[0]!)).toBe(60);
 expect(user.assets.ouro.params.taxa).toBe(132);
 expect(user.forexSaldoReal).toBe(500); expect(JSON.stringify(user.log)).toBe(log);
 expect(JSON.stringify(user.assets.ouro.bonus)).toBe(bonus);
 });
 it('aceita publicações antigas e preserva a comissão local',()=>{
 const user=defaultState(); user.assets.ouro.params.comissaoPorContrato=3;
 const payload=buildOfficialParams(defaultState());
 for(const a of Object.values(payload.assets)) delete a.params.comissaoPorContrato;
 expect(isOfficialParams(payload)).toBe(true); applyOfficialParams(user,payload);
 expect(user.assets.ouro.params.comissaoPorContrato).toBe(3);
 });
 it.each([-1,NaN,Infinity,'3',null])('rejeita comissão inválida %s',valor=>{
 const payload=buildOfficialParams(defaultState()); payload.assets.ouro.params.comissaoPorContrato=valor;
 expect(isOfficialParams(payload)).toBe(false);
 });
 it('respeita aplicação em apenas um ativo e comissão zero',()=>{
 const user=defaultState(); user.assets.ouro.params.comissaoPorContrato=3;user.assets.nasdaq.params.comissaoPorContrato=2;
 applyOfficialParams(user,buildOfficialParams(defaultState()),'ouro');
 expect(user.assets.ouro.params.comissaoPorContrato).toBe(0);expect(user.assets.nasdaq.params.comissaoPorContrato).toBe(2);
 });
});
