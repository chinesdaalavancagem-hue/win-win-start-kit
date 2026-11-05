import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VestSimulator } from '@/components/platform/VestSimulator';
import { Platform } from '@/components/platform/Platform';
import { defaultState } from '@/lib/platform/engine';
import { newVestDraft, type VestDraft } from '@/lib/platform/vest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
vi.mock('@/lib/auditoria-registro',()=>({registrarAuditoria:vi.fn(async()=>{})}));
function Harness(){const[d,set]=useState<VestDraft>(newVestDraft());return <VestSimulator value={d} onChange={set}/>;}
describe('Vest simulator in platform',()=>{
 it('shows incomplete inputs and calculates Portuguese decimals without inventing ticks',()=>{
  render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Conferir simulação'}));
  expect(screen.getByRole('alert')).toHaveTextContent('Quantidade Vest');
  for(const[label,value]of [['Quantidade Vest (unidades)','2'],['Entrada Vest','20000'],['Saída Vest','20100'],['Preço de referência (index)','20000'],['Alavancagem (x)','50']]){
   fireEvent.change(screen.getByLabelText(label!,{exact:false}),{target:{value}});
  }
  expect(screen.getByText('197,995 USDC')).toBeInTheDocument();
  expect(screen.getByText(/Tick Vest não confirmado/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Mercado Vest'),{target:{value:'GC-PERP'}});
  expect(screen.getByLabelText('Entrada Vest')).toHaveValue('');
  expect(screen.getByLabelText('Lotes MT5')).toHaveValue('');
 });
 it('opens from history, saves study without altering operations, and exits using asset buttons',async()=>{
  const initial=defaultState();initial.activeTab='historico';
  const load=async()=>JSON.stringify(initial); const save=vi.fn(async(_v:string)=>true);
  function App(){const[open,set]=useState(false);return <Platform load={load} save={save} isAdmin={false} officialAcceptedAt={null} leftMenuOpen={open} setLeftMenuOpen={set}/>;}
  render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'Expandir menu'}));
  fireEvent.click(screen.getByRole('button',{name:'Vest · Perpétuos'}));
  expect(screen.getByRole('region',{name:'Simulador Vest'})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Quantidade Vest (unidades)',{exact:false}),{target:{value:'12,5'}});
  await waitFor(()=>expect(save).toHaveBeenCalled(),{timeout:2000});
  const saved=JSON.parse(save.mock.calls.at(-1)![0]!);
  expect(saved.vestStudy.quantity).toBe('12,5'); expect(saved.log).toEqual(initial.log);
  expect(saved.cfdBalance).toBe(initial.cfdBalance);expect(saved.counts).toEqual(initial.counts);
  fireEvent.click(screen.getByRole('button',{name:'Histórico'}));
  expect(screen.queryByRole('region',{name:'Simulador Vest'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Expandir menu'}));fireEvent.click(screen.getByRole('button',{name:'Vest · Perpétuos'}));
  expect(screen.getByLabelText('Quantidade Vest (unidades)',{exact:false})).toHaveValue('12,5');
 });
});
