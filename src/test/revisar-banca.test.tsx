import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { describe,it,expect,vi } from 'vitest';
import { RevisarBanca } from '@/components/platform/RevisarBanca';
import { novaBanca } from '@/lib/platform/bancas';
import { handleStop,historicoTotals } from '@/lib/platform/engine';
function make(){const b=novaBanca('Minha banca');b.state.assets.ouro.params.taxa=100;handleStop(b.state,'ouro',260);return b;}
describe('interface de revisão',()=>{
 it('edita operação sem campo de lucro e só fecha depois de salvar',async()=>{
  const b=make(),save=vi.fn(async(_state: import("@/lib/platform/engine").State)=>true),close=vi.fn();render(<RevisarBanca banca={b} onSave={save} onClose={close}/>);
  expect(screen.queryByLabelText(/lucro/i)).toBeNull();
  fireEvent.change(screen.getByLabelText('Resultado real no CFD ($)'),{target:{value:'215'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar revisão'}));await waitFor(()=>expect(close).toHaveBeenCalledOnce());
  expect(historicoTotals(save.mock.calls[0]![0]!).profit).toBe(115);
  expect(historicoTotals(b.state).profit).toBe(160);
 });
 it('mantém correções disponíveis se a nuvem rejeita o salvamento',async()=>{
  const close=vi.fn();render(<RevisarBanca banca={make()} onSave={async()=>false} onClose={close}/>);
  fireEvent.change(screen.getByLabelText('Resultado real no CFD ($)'),{target:{value:'215'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar revisão'}));expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
  expect(screen.getByLabelText('Resultado real no CFD ($)')).toHaveValue('215');expect(close).not.toHaveBeenCalled();
 });
});
