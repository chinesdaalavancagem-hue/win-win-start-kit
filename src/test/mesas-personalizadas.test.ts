import { describe, it, expect } from 'vitest';
import { defaultState, prepararMesaPersonalizada, selecionarMesaGold, diasAvaliacaoAtivo, lossLimitGoldEfetivo } from '../lib/platform/engine';
import { novaBanca, parseBancas } from '../lib/platform/bancas';
import { validarMesaPersonalizada, metasAvaliacao, normalizarMesasPersonalizadas, type MesaPersonalizada } from '../lib/platform/mesas-personalizadas';
import { buildOfficialParams, isOfficialParams, applyOfficialParams } from '../lib/platform/official-params';
const mesa: MesaPersonalizada = {id:'custom_testmesa1',nome:'Minha mesa',avaliacao:3,payout:6,consistencia:40,consistenciaFinanciada:20,target:3000,lossLimit:1750,metaFinanciada:200,saque:500};
describe('mesas personalizadas', () => {
  it('gera fases, metas e limites sem sugerir contratos ou lotes', () => {
    const s = defaultState(); prepararMesaPersonalizada(s,mesa);
    for (const key of ['ouro','nasdaq','saque2'] as const) {
      const a=s.assets[key];
      expect(a.days).toHaveLength(key==='saque2'?6:9);
      expect(diasAvaliacaoAtivo(a,key)).toBe(key==='saque2'?0:3);
      expect(a.days.every(d=>d.mnq===0 && d.lotes===0 && d.mll===1750)).toBe(true);
      expect(a.days.slice(-6).every(d=>d.meta===200)).toBe(true);
    }
    expect(s.assets.ouro.days.slice(0,3).map(d=>d.meta)).toEqual([1000,1000,1000]);
    expect(lossLimitGoldEfetivo(s.assets.ouro,4)).toBe(1750);
    s.assets.ouro.days[4]!.mll=1600;
    expect(lossLimitGoldEfetivo(s.assets.ouro,4)).toBe(1600);
  });
  it('preserva regras e edições ao salvar, reabrir e selecionar a mesa', () => {
    const b=novaBanca('Teste'); b.mesa=mesa.id; prepararMesaPersonalizada(b.state,mesa);
    b.state.assets.ouro.days[0]!.lotes=.37; b.state.counts.reprovadas=2;
    const doc=parseBancas(JSON.stringify({bancasVersion:1,activeId:b.id,mesaAtiva:mesa.id,bancas:[b],mesasPersonalizadas:[mesa]}));
    expect(doc.mesaAtiva).toBe(mesa.id); expect(doc.mesasPersonalizadas).toEqual([mesa]);
    const restored=doc.bancas[0]!; selecionarMesaGold(restored.state.assets.ouro,mesa.id);
    expect(restored.mesa).toBe(mesa.id); expect(restored.state.assets.ouro.days[0]!.lotes).toBe(.37);
    expect(restored.state.counts.reprovadas).toBe(2);
  });
  it.each([{avaliacao:2},{avaliacao:0},{payout:31},{consistencia:-1},{lossLimit:0},{target:NaN},{nome:''},{id:'__proto__'},{payout:3}])('rejeita regras incompatíveis %j', patch=>{
    expect(validarMesaPersonalizada({...mesa,...patch})).not.toBeNull();
  });
  it('preserva o cadastro mesmo após excluir todas as bancas',()=>{
    const doc=parseBancas(JSON.stringify({bancasVersion:1,activeId:'',mesaAtiva:mesa.id,bancas:[],mesasPersonalizadas:[mesa]}));
    expect(doc.mesasPersonalizadas).toEqual([mesa]); expect(doc.mesaAtiva).toBe(mesa.id); expect(doc.bancas).toEqual([]);
  });
  it('distribui centavos sem alterar o target e elimina duplicatas inválidas',()=>{
    expect(metasAvaliacao({...mesa,target:3000.01})).toEqual([1000.01,1000,1000]);
    expect(normalizarMesasPersonalizadas([mesa,mesa,{...mesa,id:'ruim'}])).toEqual([mesa]);
  });
  it('mantém exportação/importação dos parâmetros sem substituir saldo ou histórico',()=>{
    const source=defaultState(); prepararMesaPersonalizada(source,mesa);
    const payload=buildOfficialParams(source,undefined,mesa.id);
    expect(isOfficialParams(payload)).toBe(true);
    const dest=defaultState(); dest.cfdBalance=500; dest.counts.reprovadas=3;
    applyOfficialParams(dest,payload);
    expect(dest.assets.ouro.mesaConfig).toEqual(mesa);
    expect(diasAvaliacaoAtivo(dest.assets.nasdaq,'nasdaq')).toBe(3);
    expect(dest.cfdBalance).toBe(500); expect(dest.counts.reprovadas).toBe(3);
    delete payload.assets.ouro.mesaConfig; expect(isOfficialParams(payload)).toBe(false);
  });
});
