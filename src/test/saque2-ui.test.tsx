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
});
