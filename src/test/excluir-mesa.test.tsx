import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {excluirMesaPersonalizada,novaBanca,parseBancas,type BancasDoc} from '@/lib/platform/bancas';
import {prepararMesaPersonalizada} from '@/lib/platform/engine';
import type {MesaPersonalizada} from '@/lib/platform/mesas-personalizadas';
vi.mock('@/components/platform/Platform',()=>({Platform:()=> <div>Operações</div>}));
vi.mock('@/components/platform/ComprarDesafioModal',()=>({ComprarDesafioModal:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
import {Bancas} from '@/components/platform/Bancas';
const rule:MesaPersonalizada={id:'custom_delete01',nome:'Minha mesa',avaliacao:3,payout:5,consistencia:40,consistenciaFinanciada:0,target:3000,lossLimit:2000,metaFinanciada:200,saque:500};
function document():BancasDoc {const doc=parseBancas(null);const b=novaBanca('Banca da mesa');b.mesa=rule.id;prepararMesaPersonalizada(b.state,rule);doc.bancas.push(b);doc.mesasPersonalizadas=[rule];doc.mesaAtiva=rule.id;doc.activeId=b.id;doc.activeIdsMesa={[rule.id]:b.id};doc.forex!.forexSaldoReal=123;return doc;}
afterEach(()=>vi.restoreAllMocks());
describe('exclusão de mesa personalizada',()=>{
 it('remove catálogo, bancas e seleção sem alterar Forex ou outras bancas, inclusive após reabrir',()=>{
  const doc=document(),copy=structuredClone(doc);const next=excluirMesaPersonalizada(doc,rule.id);
  expect(next.bancas).toEqual([doc.bancas[0]]);expect(next.forex).toEqual(doc.forex);expect(next.mesasPersonalizadas).toEqual([]);
  expect(next.mesaAtiva).toBe('tradefive');expect(next.activeIdsMesa![rule.id]).toBeUndefined();
  expect(parseBancas(JSON.stringify(next)).bancas.some(b=>b.mesa===rule.id)).toBe(false);expect(doc).toEqual(copy);
 });
 it('protege mesas padrão e mantém uma banca válida ao excluir a última mesa com bancas',()=>{
  const doc=document();expect(()=>excluirMesaPersonalizada(doc,'topstep')).toThrow();
  doc.bancas=doc.bancas.slice(1);const next=excluirMesaPersonalizada(doc,rule.id);
  expect(next.bancas).toHaveLength(1);expect(next.bancas[0]!.state.log).toEqual([]);expect(next.mesaAtiva).toBe('tradefive');expect(next.forex).toEqual(doc.forex);
 });
 it('permite cancelar e depois excluir com confirmação explícita',async()=>{
  let raw=JSON.stringify(document());const save=vi.fn(async(v:string)=>{raw=v;return true;});const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  render(<Bancas load={async()=>raw} save={save} isAdmin/>);
  fireEvent.click(await screen.findByRole('button',{name:'Excluir mesa'}));expect(save).not.toHaveBeenCalled();
  expect(confirm.mock.calls[0]![0]).toContain('históricos');confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button',{name:'Excluir mesa'}));await waitFor(()=>expect(save).toHaveBeenCalled());
  expect(parseBancas(raw).mesasPersonalizadas).toEqual([]);expect(screen.getByLabelText('Mesa de futuros')).toHaveValue('tradefive');
 });
 it('restaura a mesa caso a gravação na nuvem falhe',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true);const raw=JSON.stringify(document());
  render(<Bancas load={async()=>raw} save={async()=>false} isAdmin/>);
  fireEvent.click(await screen.findByRole('button',{name:'Excluir mesa'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
  expect(screen.getByLabelText('Mesa de futuros')).toHaveValue(rule.id);
 });
});
