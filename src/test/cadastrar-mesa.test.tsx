import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe,it,expect,vi } from 'vitest';
import { CadastrarMesa } from '@/components/platform/CadastrarMesa';
describe('cadastro de mesa',()=>{
 it('envia regras, cria identificador único e fecha somente após salvar',async()=>{
  const onSave=vi.fn(async()=>true), onClose=vi.fn();
  render(<CadastrarMesa nomes={[]} onSave={onSave} onClose={onClose}/>);
  fireEvent.change(screen.getByLabelText('Nome da mesa'),{target:{value:'Minha mesa'}});
  fireEvent.click(screen.getByRole('button',{name:'Criar mesa e primeira banca'}));
  await waitFor(()=>expect(onClose).toHaveBeenCalledTimes(1));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({nome:'Minha mesa',avaliacao:3,payout:5,target:3000,lossLimit:2000,id:expect.stringMatching(/^custom_/)}),0);
 });
 it('mantém formulário aberto se a gravação falha',async()=>{
  const onClose=vi.fn(); render(<CadastrarMesa nomes={[]} onSave={async()=>false} onClose={onClose}/>);
  fireEvent.change(screen.getByLabelText('Nome da mesa'),{target:{value:'Minha mesa'}});
  fireEvent.click(screen.getByRole('button',{name:'Criar mesa e primeira banca'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
  expect(onClose).not.toHaveBeenCalled();
 });
 it('não aceita nome duplicado nem dias incompatíveis com a consistência',()=>{
  const onSave=vi.fn(); render(<CadastrarMesa nomes={['Minha mesa']} onSave={onSave} onClose={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Nome da mesa'),{target:{value:'MINHA MESA'}});
  fireEvent.click(screen.getByRole('button',{name:'Criar mesa e primeira banca'}));
  expect(screen.getByRole('alert')).toHaveTextContent('Já existe uma mesa'); expect(onSave).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Dias de avaliação'),{target:{value:'2'}});
  expect(screen.getByRole('button',{name:'Criar mesa e primeira banca'})).toBeDisabled();
 });
});
