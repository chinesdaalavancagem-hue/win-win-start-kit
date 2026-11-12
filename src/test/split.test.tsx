import '@testing-library/jest-dom/vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {defaultState,prepararMesaVest,definirSplit,percentualSplit,normalizeState,projetarPrimeiroPayout,simularSaque2,handleProfit} from '../lib/platform/engine';
import {buildOfficialParams,isOfficialParams,applyOfficialParams} from '../lib/platform/official-params';
import {Platform} from '../components/platform/Platform';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
vi.mock('@/lib/auditoria-registro',()=>({registrarAuditoria:vi.fn(async()=>{})}));
it('aplica 70/80/90/95% ao lucro solicitado nos dois ciclos e preserva débito bruto',()=>{
 for(const pct of [70,80,90,95]){
  const s=defaultState();prepararMesaVest(s);s.assets.ouro.days[1]!.meta=1000;s.assets.saque2.days[0]!.meta=1000;
  definirSplit(s,pct);
  expect(projetarPrimeiroPayout(s.assets.ouro,'ouro')).toEqual({lucro:1000,bruto:1000,liquido:pct*10});
  const r=simularSaque2(s);expect(r.saque2Bruto).toBe(1000);expect(r.saque2Liquido).toBe(pct*10);expect(r.saldoMesaInicial).toBe(0);
 }
});
it('mantém 90% no legado, rejeita inválidos e não reescreve saques registrados',()=>{
 const s=defaultState();prepararMesaVest(s);expect(percentualSplit(s.assets.ouro)).toBe(90);
 handleProfit(s,'ouro');handleProfit(s,'ouro');const log=structuredClone(s.log);
 definirSplit(s,70);expect(s.log).toEqual(log);expect(s.log.at(-1)?.saque).toBe(180);
 for(const bad of [-1,101,NaN])definirSplit(s,bad);
 expect(percentualSplit(s.assets.ouro)).toBe(70);
 s.assets.ouro.params.splitPct=101;expect(normalizeState(s).assets.ouro.params.splitPct).toBe(90);
});
it('publica split, preserva configuração ao importar arquivo antigo e mantém regra 50% da Lucid',()=>{
 const s=defaultState();s.assets.ouro.mesaFuturos='lucid';definirSplit(s,80);
 const p=buildOfficialParams(s,undefined,'lucid');expect(isOfficialParams(p)).toBe(true);
 const target=defaultState();applyOfficialParams(target,p);expect(percentualSplit(target.assets.ouro)).toBe(80);
 delete p.assets.ouro.params.splitPct;definirSplit(target,70);applyOfficialParams(target,p,'ouro');expect(percentualSplit(target.assets.ouro)).toBe(70);
 const r=projetarPrimeiroPayout(s.assets.ouro,'ouro');expect(r.liquido).toBeCloseTo(r.bruto*.8);
 p.assets.ouro.params.splitPct=101;expect(isOfficialParams(p)).toBe(false);
});
it('campo editável recalcula e salva o percentual em todos os ativos da conta',async()=>{
 const s=defaultState();prepararMesaVest(s);s.assets.ouro.days[1]!.meta=1000;
 const save=vi.fn(async(_raw:string)=>true);
 render(<Platform leftMenuOpen load={async()=>JSON.stringify(s)} save={save} isAdmin officialAcceptedAt={null} mesaAtiva="vest"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Meta geral',hidden:true}));
 const input=screen.getByLabelText(/Split do trader/);fireEvent.change(input,{target:{value:'95'}});fireEvent.blur(input);
 expect(screen.getByText('Recebe · split 95%')).toBeInTheDocument();
 await waitFor(()=>expect(save).toHaveBeenCalled());
 const saved=JSON.parse(save.mock.calls.at(-1)![0]);
 for(const key of ['ouro','nasdaq','saque2']) expect(saved.assets[key].params.splitPct).toBe(95);
 expect(saved.log).toEqual([]);
});
