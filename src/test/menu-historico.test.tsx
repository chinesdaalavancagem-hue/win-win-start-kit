import { useState } from 'react';
import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { describe,it,expect,vi,beforeEach } from 'vitest';
import { Platform } from '@/components/platform/Platform';
import { defaultState } from '@/lib/platform/engine';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
const state=defaultState();state.activeTab='historico';
const load=async()=>JSON.stringify(state);
function Harness({save=async()=>true}:{save?:(value:string)=>Promise<boolean>}){
 const [open,setOpen]=useState(false);
 return <Platform load={load} save={save} isAdmin officialAcceptedAt={null} leftMenuOpen={open} setLeftMenuOpen={setOpen}/>;
}
beforeEach(()=>{HTMLElement.prototype.scrollIntoView=vi.fn();});
describe('menu permanente no histórico',()=>{
 it('mantém o menu no Histórico e abre Operações diretamente no Gold',async()=>{
  const save=vi.fn(async(_value:string)=>true);render(<Harness save={save}/>);
  expect(await screen.findByRole('button',{name:'Histórico'})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:'Expandir menu'}));
  expect(screen.getByRole('button',{name:'Operações'})).toHaveAttribute('aria-pressed','false');
  fireEvent.click(screen.getByRole('button',{name:'Operações'}));
  expect(screen.getByRole('button',{name:'Gold'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getAllByText('Matriz operacional').length).toBeGreaterThan(0);
  expect(screen.getByRole('button',{name:'Expandir menu'})).toHaveAttribute('aria-expanded','false');
  await waitFor(()=>expect(save).toHaveBeenCalled(),{timeout:2000});
  expect(JSON.parse(save.mock.calls.at(-1)![0]!).activeTab).toBe('ouro');
 });
 it('permite abrir outras seções pelo histórico e conserva o ativo quando já está nos cards',async()=>{
  render(<Harness/>);fireEvent.click(await screen.findByRole('button',{name:'Expandir menu'}));
  fireEvent.click(screen.getByRole('button',{name:'Bônus e saques'}));
  expect(screen.getByRole('button',{name:'Gold'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByLabelText('Saldo real MetaTrader')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Nasdaq'}));
  fireEvent.click(screen.getByRole('button',{name:'Expandir menu'}));fireEvent.click(screen.getByRole('button',{name:'Operações'}));
  expect(screen.getByRole('button',{name:'Nasdaq'})).toHaveAttribute('aria-pressed','true');
  fireEvent.click(screen.getByRole('button',{name:'Histórico'}));
  expect(screen.getByRole('button',{name:'Expandir menu'})).toBeInTheDocument();
 });
});
