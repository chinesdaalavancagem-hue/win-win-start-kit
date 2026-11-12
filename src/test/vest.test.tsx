import '@testing-library/jest-dom/vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {Bancas} from '../components/platform/Bancas';
import {Platform} from '../components/platform/Platform';
import {definirParametroVest, margemVest, alavancagemVest, normalizeState, defaultState, prepararMesaVest, limitesVest, computeAssetCalcs, projetarPrimeiroPayout, simularSaque2, adicionarDiaGold, handleProfit, undoLast} from '../lib/platform/engine';
import {novaBanca,parseBancas,referenciaDaMesa} from '../lib/platform/bancas';
import {buildOfficialParams,isOfficialParams,applyOfficialParams} from '../lib/platform/official-params';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
vi.mock('@/lib/auditoria-registro',()=>({registrarAuditoria:vi.fn(async()=>{})}));
const setup=()=>{const s=defaultState();prepararMesaVest(s);return s;};
it('10 unidades de ouro têm exposição de 1 MGC, sem assumir ticks CME',()=>{
 const s=setup(),a=s.assets.ouro,c=computeAssetCalcs(a,'ouro')[0]!;
 expect(a.params.taxa).toBe(108.3);expect(a.params.mnq).toBe(1);
 expect(c.pontos).toBe(200);expect(c.pontosReprova).toBe(60);
 expect(c.ticksReprova).toBeUndefined();expect(c.reprova).toBe(240);
 expect(c.liquidoSeReprovar).toBeCloseTo(131.7);expect(c.passa).toBe(-800);
});
it('custos reduzem meta líquida e distância ao piso, sem mudar registros efetivos',()=>{
 const s=setup(),a=s.assets.ouro;a.params.comissaoPorContrato=.2;
 const c=computeAssetCalcs(a,'ouro')[0]!;
 expect(c.pontosReprova).toBe(59.8);
 expect(projetarPrimeiroPayout(a,'ouro')).toEqual({lucro:198,bruto:198,liquido:178.2});
 a.attempt.resultadosMesaEod={'1':150};
 expect(projetarPrimeiroPayout(a,'ouro').liquido).toBe(135);
});
it('piso estático acompanha resultados, reinicia a financiada e conserva 600 após saque integral',()=>{
 const s=setup(),a=s.assets.ouro;
 adicionarDiaGold(a,'avaliacao');a.attempt.resultadosMesaEod={'0':300,'2':-100};
 expect(limitesVest(a,'ouro',1)).toEqual({saldo:10300,piso:9400,distancia:900});
 expect(limitesVest(a,'ouro',2)).toEqual({saldo:10000,piso:9400,distancia:600});
 adicionarDiaGold(a,'financiada');
 expect(limitesVest(a,'ouro',3)).toEqual({saldo:9900,piso:9400,distancia:500});
 const r=simularSaque2(s);expect(r.retirada).toBe(100);expect(r.saldoMesaInicial).toBe(0);
 expect(r.limites).toEqual([600]);expect(r.saque2Bruto).toBe(200);expect(r.saque2Liquido).toBe(180);
});
it('novas contas persistem; arquivos antigos e outras mesas não são reinterpretados',()=>{
 const s=setup(),v={...novaBanca('Vest',s),mesa:'vest' as const,taxaCompra:108.3};
 const top={...novaBanca('Topstep'),mesa:'topstep' as const,taxaCompra:96};
 const old={...novaBanca('Vest antiga'),mesa:'vest'};
 const doc=parseBancas(JSON.stringify({bancasVersion:1,bancas:[top,old,v],mesaAtiva:'vest',activeId:v.id,activeIdsMesa:{vest:v.id}}));
 expect(doc.bancas.map(b=>b.id)).toContain(v.id);expect(doc.contasArquivadas).toEqual([old]);
 expect(doc.bancas.find(b=>b.id===top.id)?.taxaCompra).toBe(96);
 expect(doc.mesaAtiva).toBe('vest');expect(doc.activeIdsMesa?.vest).toBe(v.id);
 expect(referenciaDaMesa(doc,'vest').assets.ouro.days).toEqual(s.assets.ouro.days);
 expect(parseBancas(JSON.stringify(doc)).contasArquivadas).toHaveLength(1);
});
it('publica e aplica parâmetros Vest sem substituir custo de compra ou histórico',()=>{
 const s=setup();s.assets.ouro.params.comissaoPorContrato=.25;
 const payload=buildOfficialParams(s,undefined,'vest');expect(isOfficialParams(payload)).toBe(true);
 const target=setup();target.assets.ouro.params.taxa=99;const log=structuredClone(target.log);
 applyOfficialParams(target,payload);
 expect(target.assets.ouro.params.taxa).toBe(99);expect(target.assets.ouro.params.comissaoPorContrato).toBe(.25);
 expect(target.log).toEqual(log);expect(target.assets.ouro.vestVersion).toBe(1);
});
it('registrar e desfazer ciclo mantém o split Vest e o histórico reversível',()=>{
 const s=setup();handleProfit(s,'ouro',-800);expect(s.assets.ouro.attempt.currentDayIndex).toBe(1);
 handleProfit(s,'ouro',-80);expect(s.log.at(-1)?.saque).toBe(180);
 undoLast(s);expect(s.log).toHaveLength(1);expect(s.assets.ouro.attempt.currentDayIndex).toBe(1);
});
it('cards mostram unidades e pontos; meta geral usa lucro integral, sem 50%',async()=>{
 const s=setup();render(<Platform leftMenuOpen load={async()=>JSON.stringify(s)} save={async()=>true} isAdmin officialAcceptedAt={null} mesaAtiva="vest"/>);
 expect((await screen.findAllByLabelText('Unidades Vest'))[0]).toHaveValue('10');
 expect(screen.queryByLabelText('Alvo em ticks')).toBeNull();
 fireEvent.change(screen.getAllByLabelText('Alvo em pontos')[0]!,{target:{value:'210'}});
 expect(screen.getAllByLabelText('Meta bruta $')[0]).toHaveValue('2100');
 fireEvent.click(screen.getByRole('button',{name:'Meta geral',hidden:true}));
 expect(screen.getByText('Lucro disponível · 100%')).toBeInTheDocument();
 expect(screen.getByLabelText(/Taxa por unidade/)).toBeInTheDocument();
});

it('cria conta Vest pela interface com preço padrão e reabre o documento',async()=>{
 const old={...novaBanca('Topstep existente'),mesa:'topstep'};
 const doc={bancasVersion:1,bancas:[old],activeId:'',mesaAtiva:'vest'};
 const save=vi.fn(async(_raw:string)=>true);
 render(<Bancas load={async()=>JSON.stringify(doc)} save={save} isAdmin/>);
 fireEvent.click(await screen.findByRole('button',{name:'Cadastrar banca'}));
 fireEvent.change(screen.getByLabelText('Nome da nova banca'),{target:{value:'Minha Vest 10K'}});
 expect(screen.getByLabelText('Taxa de avaliação em dólares')).toHaveValue('108.30');
 fireEvent.click(screen.getByRole('button',{name:/Criar banca/}));
 await waitFor(()=>expect(save).toHaveBeenCalled());
 const reloaded=parseBancas(save.mock.calls.at(-1)![0]);
 expect(reloaded.bancas).toHaveLength(2);
 const created=reloaded.bancas.find(b=>b.mesa==='vest')!;
 expect(created.taxaCompra).toBe(108.3);expect(created.state.assets.ouro.params.mnq).toBe(1);
 expect(created.state.assets.ouro.days[0]!.meta).toBe(2000);
 expect(created.state.assets.ouro.params.mll).toBe(600);
 expect(reloaded.bancas[0]!.state.log).toEqual(old.state.log);
});

it('alavancagem Vest muda só margem, persiste e acompanha Saque 2',()=>{
 const s=setup(),a=s.assets.ouro;
 const antes=computeAssetCalcs(a,'ouro'),fx=a.params.marginPerLot;
 expect(margemVest(a,'ouro',10)).toBeUndefined();
 definirParametroVest(s,'ouro','vestPrecoIndice',4100);
 expect(margemVest(a,'ouro',10)).toBe(1640);
 definirParametroVest(s,'saque2','vestAlavancagem',10);
 expect(margemVest(a,'ouro',10)).toBe(4100);
 expect(margemVest(s.assets.saque2,'saque2',5)).toBe(2050);
 expect(computeAssetCalcs(a,'ouro')).toEqual(antes);expect(a.params.marginPerLot).toBe(fx);
 definirParametroVest(s,'ouro','vestAlavancagem',26);expect(alavancagemVest(a,'ouro')).toBe(10);
 const restored=normalizeState(JSON.parse(JSON.stringify(s)));expect(restored.assets.ouro.params.vestAlavancagem).toBe(10);
 const payload=buildOfficialParams(s,undefined,'vest');expect(isOfficialParams(payload)).toBe(true);
 const target=setup();applyOfficialParams(target,payload);expect(margemVest(target.assets.ouro,'ouro',10)).toBe(4100);
 payload.assets.ouro.params.vestAlavancagem=26;expect(isOfficialParams(payload)).toBe(false);
});
it('edita alavancagem Vest e mostra margem por card',async()=>{
 const s=setup();render(<Platform load={async()=>JSON.stringify(s)} save={async()=>true} isAdmin officialAcceptedAt={null} mesaAtiva="vest"/>);
 fireEvent.change(await screen.findByLabelText('Alavancagem da Vest'),{target:{value:'10'}});
 const price=screen.getByLabelText(/Preço de índice na Vest/);
 fireEvent.change(price,{target:{value:'4100'}});fireEvent.blur(price);
 await waitFor(()=>expect(screen.getAllByText(/Margem estimada na Vest \(10x\): 4.100 USDC/).length).toBeGreaterThan(0));
});
