import {describe,it,expect} from 'vitest';
import {defaultState,definirAlavancagem,normalizeState,sincronizarParametros,computeAssetCalcs} from '../lib/platform/engine';
describe('alavancagem e margem',()=>{
 it('calibra legado, reduz margem, preserva exposição e histórico e acompanha Saque 2',()=>{
 const s=defaultState(); s.assets.ouro.params.marginPerLot=810;
 const log=structuredClone(s.log), dias=structuredClone(s.assets.ouro.days), calcs=computeAssetCalcs(s.assets.ouro,'ouro');
 definirAlavancagem(s,'ouro',500); expect(s.assets.ouro.params.marginPerLot).toBe(810);
 definirAlavancagem(s,'ouro',1000); expect(s.assets.ouro.params.marginPerLot).toBe(405);
 expect(s.assets.saque2.params.marginPerLot).toBe(405);
 expect(s.assets.saque2.params.alavancagem).toBe(1000);
 expect(s.assets.ouro.days).toEqual(dias); expect(s.log).toEqual(log);
 expect(computeAssetCalcs(s.assets.ouro,'ouro')).toEqual(calcs);
 definirAlavancagem(s,'saque2',500); expect(s.assets.ouro.params.marginPerLot).toBe(810);
 });
 it('respeita margem manual atualizada e conserva a referência após recarregar',()=>{
 const s=defaultState(); definirAlavancagem(s,'ouro',500); s.assets.ouro.params.marginPerLot=820;
 const n=normalizeState(JSON.parse(JSON.stringify(s))); definirAlavancagem(n,'ouro',1000);
 expect(n.assets.ouro.params.marginPerLot).toBe(410);
 n.assets.saque2.params.ativoReal='nasdaq'; definirAlavancagem(n,'nasdaq',200); sincronizarParametros(n);
 expect(n.assets.saque2.params.alavancagem).toBe(200);
 expect(n.assets.saque2.params.marginPerLot).toBe(n.assets.nasdaq.params.marginPerLot);
 });
 it('rejeita entradas inválidas e não inventa alavancagem nos backups antigos',()=>{
 const s=normalizeState(defaultState()); expect(s.assets.ouro.params.alavancagem).toBeUndefined();
 for(const v of [0,-1,NaN,Infinity]) definirAlavancagem(s,'ouro',v);
 expect(s.assets.ouro.params.alavancagem).toBeUndefined();
 s.assets.ouro.params.alavancagem=-500; normalizeState(s); expect(s.assets.ouro.params.alavancagem).toBeUndefined();
 });
});
