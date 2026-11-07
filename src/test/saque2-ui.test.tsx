import {render,screen,fireEvent} from '@testing-library/react';
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
  expect(await screen.findByText('Saque 2 vinculado ao ciclo 1 · Gold')).toBeInTheDocument();
  expect(screen.getByText(/Projeção após o primeiro saque/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Gold'}));
  expect(screen.queryByText('Saque 2 vinculado ao ciclo 1 · Gold')).not.toBeInTheDocument();
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
  expect(screen.getByText(/Ciclo 1: lucro financiado.*2.800.*1.400.*1.260/)).toBeInTheDocument();
 });

});
