import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseBancas } from '@/lib/platform/bancas';
vi.mock('@/components/platform/Platform',()=>({Platform:()=> <div>Cards operacionais</div>}));
vi.mock('@/components/platform/ComprarDesafioModal',()=>({ComprarDesafioModal:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
import { Bancas } from '@/components/platform/Bancas';
describe('cadastro integrado à gestão',()=>{
 it('salva mesa e banca, restaura a seleção e permite alternar sem perder a configuração',async()=>{
  let serialized=JSON.stringify(parseBancas(null));
  const load=async()=>serialized; const save=vi.fn(async(v:string)=>{serialized=v;return true;});
  const view=render(<Bancas load={load} save={save} isAdmin/>);
  fireEvent.click(await screen.findByRole('button',{name:'Cadastrar mesa'}));
  fireEvent.change(screen.getByLabelText('Nome da mesa'),{target:{value:'Mesa teste'}});
  fireEvent.click(screen.getByRole('button',{name:'Criar mesa e primeira banca'}));
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Cadastrar mesa proprietária'})).not.toBeInTheDocument());
  const doc=parseBancas(serialized); const id=doc.mesasPersonalizadas![0]!.id;
  expect(doc.bancas).toHaveLength(2); expect(doc.mesaAtiva).toBe(id);
  expect(doc.bancas[1]!.state.assets.ouro.days).toHaveLength(8);
  fireEvent.change(screen.getByLabelText('Mesa de futuros'),{target:{value:'tradefive'}});
  await waitFor(()=>expect(parseBancas(serialized).mesaAtiva).toBe('tradefive'));
  fireEvent.change(screen.getByLabelText('Mesa de futuros'),{target:{value:id}});
  await waitFor(()=>expect(parseBancas(serialized).mesaAtiva).toBe(id));
  view.unmount(); render(<Bancas load={load} save={save} isAdmin/>);
  expect(await screen.findByLabelText('Mesa de futuros')).toHaveValue(id);
 });
 it('reverte a criação quando o armazenamento rejeita a gravação',async()=>{
  const load=async()=>null; const save=async()=>{throw new Error('offline')};
  render(<Bancas load={load} save={save} isAdmin/>);
  fireEvent.click(await screen.findByRole('button',{name:'Cadastrar mesa'}));
  fireEvent.change(screen.getByLabelText('Nome da mesa'),{target:{value:'Mesa offline'}});
  fireEvent.click(screen.getByRole('button',{name:'Criar mesa e primeira banca'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
  expect(screen.getByLabelText('Mesa de futuros')).toHaveValue('tradefive');
  expect(screen.queryByRole('option',{name:'Mesa offline'})).not.toBeInTheDocument();
 });
});
