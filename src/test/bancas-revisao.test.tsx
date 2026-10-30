import { render,screen,fireEvent,waitFor,within } from '@testing-library/react';
import { describe,it,expect,vi } from 'vitest';
import { novaBanca,parseBancas,type Banca } from '@/lib/platform/bancas';
import { handleStop,historicoTotals } from '@/lib/platform/engine';
vi.mock('@/components/platform/Platform',()=>({Platform:({bancasGlobais}:{bancasGlobais:Banca[]})=><output aria-label="Total de todas as bancas">{bancasGlobais.reduce((n,b)=>n+historicoTotals(b.state).profit,0)}</output>}));
vi.mock('@/components/platform/ComprarDesafioModal',()=>({ComprarDesafioModal:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
import { Bancas } from '@/components/platform/Bancas';
function initial(){const b=novaBanca('Encerrada');b.state.assets.ouro.params.taxa=100;handleStop(b.state,'ouro',260);return JSON.stringify({bancasVersion:1,activeId:b.id,bancas:[b]});}
describe('revisão salva no documento de bancas',()=>{
 it('atualiza o histórico global e conserva a revisão após reabrir',async()=>{
  let raw=initial();const load=async()=>raw;const save=async(v:string)=>{raw=v;return true;};
  const view=render(<Bancas load={load} save={save} isAdmin/>);
  fireEvent.click(await screen.findByRole('button',{name:/Minhas bancas/i}));
  fireEvent.click(screen.getByRole('button',{name:'Revisar operações'}));
  fireEvent.change(screen.getByLabelText('Resultado real no CFD ($)'),{target:{value:'215'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar revisão'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByLabelText('Total de todas as bancas')).toHaveTextContent('115');
  expect(historicoTotals(parseBancas(raw).bancas[0]!.state).profit).toBe(115);
  view.unmount();render(<Bancas load={load} save={save} isAdmin/>);
  expect(await screen.findByLabelText('Total de todas as bancas')).toHaveTextContent('115');
 });
 it('não confirma nem aplica resultado quando a gravação falha',async()=>{
  const raw=initial();render(<Bancas load={async()=>raw} save={async()=>false} isAdmin/>);
  fireEvent.click(await screen.findByRole('button',{name:/Minhas bancas/i}));fireEvent.click(screen.getByRole('button',{name:'Revisar operações'}));
  fireEvent.change(screen.getByLabelText('Resultado real no CFD ($)'),{target:{value:'215'}});fireEvent.click(screen.getByRole('button',{name:'Salvar revisão'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
  expect(within(screen.getByRole('dialog')).getByLabelText('Resultado real no CFD ($)')).toHaveValue('215');
  expect(historicoTotals(parseBancas(raw).bancas[0]!.state).profit).toBe(160);
 });
});
