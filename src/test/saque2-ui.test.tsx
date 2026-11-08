import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {Platform} from '../components/platform/Platform';
import {defaultState} from '../lib/platform/engine';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
vi.mock('@/lib/auditoria-registro',()=>({registrarAuditoria:vi.fn(async()=>{})}));
describe('continuidade visível no Saque 2',()=>{
 it('mostra vínculo por ativo e mantém projeções fora dos dados reais',async()=>{
  const initial=defaultState(); initial.activeTab='saque2';
  const original=JSON.stringify(initial), save=vi.fn(async()=>true);
  render(<Platform load={async()=>original} save={save} isAdmin={true} officialAcceptedAt={null}/>);
  expect(await screen.findByText('Saque 2 · Ciclo 2 · Gold')).toBeInTheDocument();
  expect(screen.getByText(/Forex próprio projetado na abertura/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Gold'}));
  expect(screen.queryByText('Saque 2 · Ciclo 2 · Gold')).not.toBeInTheDocument();
  expect(JSON.stringify(initial)).toBe(original);
 });
 it('usa na continuidade o recebimento exibido em Meta geral, não o saque manual antigo',async()=>{
  const initial=defaultState();initial.activeTab='ouro';
  const a=initial.assets.ouro;a.mesaFuturos='lucid';a.params.saqueAprovada=9999;
  a.days=[625,625,2000,200,200,200,200].map(meta=>({mnq:10,lotes:.21,meta}));
  render(<Platform load={async()=>JSON.stringify(initial)} save={async()=>true} isAdmin={true} officialAcceptedAt={null} mesaAtiva="lucid" leftMenuOpen={true}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Meta geral'}));
  expect(screen.getByText('$ 1.400')).toBeInTheDocument();
  expect(screen.getByText('$ 1.260')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Saque 2'}));
  expect(screen.getByText(/Saldo mantido na mesa.*1.400.*base do saque/)).toBeInTheDocument();
 });

 it('registra cinco Profits, salva o saque e exibe a Meta geral do ciclo seguinte',async()=>{
  HTMLElement.prototype.scrollIntoView=vi.fn();
  const initial=defaultState();initial.activeTab='saque2';
  const a=initial.assets.ouro;a.mesaFuturos='lucid';a.params.mll=1000;
  a.days=[625,625,2000,200,200,200,200].map(meta=>({mnq:10,lotes:.21,meta}));
  initial.assets.saque2.days=Array.from({length:5},()=>({mnq:2,lotes:.03,meta:200}));
  const save=vi.fn(async(_v:string)=>true);
  render(<Platform load={async()=>JSON.stringify(initial)} save={save} isAdmin={true} officialAcceptedAt={null} mesaAtiva="lucid" leftMenuOpen={true}/>);
  await screen.findByText('Saque 2 · Ciclo 2 · Gold');
  fireEvent.click(screen.getByRole('button',{name:'Meta geral'}));
  expect(screen.getByText('$ 2.400')).toBeInTheDocument();
  expect(screen.getByText('$ 1.200')).toBeInTheDocument();
  expect(screen.getByText('$ 1.080')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Operações'}));
  for(let i=0;i<5;i++) {
    fireEvent.click(screen.getByRole('button',{name:'✅ Profit (bateu a meta)'}));
    fireEvent.click(screen.getByRole('button',{name:'confirmar'}));
  }
  expect(screen.getByText('Saque 2 · Ciclo 3 · Gold')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Meta geral'}));
  expect(screen.getByText('$ 2.200')).toBeInTheDocument();
  expect(screen.getByText('$ 1.100')).toBeInTheDocument();
  expect(screen.getByText('$ 990')).toBeInTheDocument();
  await waitFor(()=>expect(save).toHaveBeenCalled(),{timeout:2000});
  const saved=JSON.parse(save.mock.calls.at(-1)![0]!);
  expect(saved.log.at(-1).continuacaoSaque.saldoDepois).toBe(1200);
 });

});


it('edita a comissão, recalcula Meta geral e salva o parâmetro',async()=>{
 const initial=defaultState();initial.activeTab='ouro';
 const a=initial.assets.ouro;a.mesaFuturos='lucid';
 a.days=Array.from({length:7},()=>({mnq:20,lotes:.21,meta:685}));
 const save=vi.fn(async(_v:string)=>true);
 render(<Platform load={async()=>JSON.stringify(initial)} save={save} isAdmin={true} officialAcceptedAt={null} mesaAtiva="lucid" leftMenuOpen={true}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Meta geral'}));
 const field=screen.getByRole('textbox',{name:/Taxa por contrato/});
 fireEvent.change(field,{target:{value:'3'}});fireEvent.blur(field);
 expect(screen.getByText('$ 3.125')).toBeInTheDocument();
 expect(screen.getByText('$ 1.562,5')).toBeInTheDocument();
 await waitFor(()=>expect(save.mock.calls.some(([v])=>JSON.parse(v).assets.ouro.params.comissaoPorContrato===3)).toBe(true));
 fireEvent.click(screen.getByRole('button',{name:'Operações'}));
 expect(screen.getAllByText('Taxas: $60 · Líquido previsto: $625')).toHaveLength(7);
});
