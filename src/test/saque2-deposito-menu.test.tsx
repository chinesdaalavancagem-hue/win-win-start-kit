import {useState} from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {Platform} from '../components/platform/Platform';
import {defaultState,aplicarDeposito,aplicarSaque,podeReverterDeposito,reverterDeposito,normalizeState,handleProfit} from '../lib/platform/engine';
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
vi.mock('@/lib/auditoria-registro',()=>({registrarAuditoria:vi.fn(async()=>{})}));
describe('reversão do depósito',()=>{
 it('restaura exatamente capital, bônus limitado ao teto e acumulado, inclusive após recarregar',()=>{
  const s=defaultState();s.forexSaldoReal=200;
  Object.assign(s.assets.ouro.bonus,{deposito:200,bonusAtual:100,bonusGanhoTotal:2900});
  const antes=structuredClone(s);
  aplicarDeposito(s,'ouro',500);
  expect(s.assets.ouro.bonus.bonusGanhoTotal).toBe(3000);
  const reload=normalizeState(JSON.parse(JSON.stringify(s)));
  expect(podeReverterDeposito(reload,'ouro')).toBe(true);
  expect(reverterDeposito(reload,'ouro')).toBe(true);
  expect(reload).toEqual(antes);
  expect(reverterDeposito(reload,'ouro')).toBe(false);
 });
 it('permite desfazer depósitos consecutivos na ordem inversa, inclusive sem bônus',()=>{
  const s=defaultState();s.assets.ouro.bonus.bonusGanhoTotal=3000;
  const antes=structuredClone(s);
  aplicarDeposito(s,'ouro',100);aplicarDeposito(s,'ouro',200);
  expect(reverterDeposito(s,'ouro')).toBe(true);expect(s.forexSaldoReal).toBe(100);
  expect(reverterDeposito(s,'ouro')).toBe(true);expect(s).toEqual(antes);
 });
 it('não reverte depois de saque, operação, ajuste de saldo ou depósito em outro ativo',()=>{
  for(const mover of [
   (s:ReturnType<typeof defaultState>)=>aplicarSaque(s,'ouro',50),
   (s:ReturnType<typeof defaultState>)=>handleProfit(s,'ouro'),
   (s:ReturnType<typeof defaultState>)=>{s.forexSaldoReal=20;},
   (s:ReturnType<typeof defaultState>)=>aplicarDeposito(s,'nasdaq',10),
  ]) {
   const s=defaultState();aplicarDeposito(s,'ouro',1000);mover(s);
   const antes=structuredClone(s);
   expect(reverterDeposito(s,'ouro')).toBe(false);expect(s).toEqual(antes);
  }
 });
 it('preserva depósitos antigos sem fotografia anterior',()=>{
  const s=defaultState();s.assets.ouro.bonus.log.push({ts:1,tipo:'deposito',valor:100,bonusGanho:100});
  expect(podeReverterDeposito(normalizeState(s),'ouro')).toBe(false);
 });
});
const initial=defaultState();initial.activeTab='ouro';
const load=async()=>JSON.stringify(initial);
function App(){const[open,setOpen]=useState(false);return <Platform load={load} save={async()=>true} isAdmin officialAcceptedAt={null} leftMenuOpen={open} setLeftMenuOpen={setOpen}/>;}
it('fecha o menu fora, mantém o campo utilizável e permite abrir e navegar novamente',async()=>{
 render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:'Expandir menu'}));
 const input=screen.getAllByRole('textbox').find(e=>e.closest('label')?.textContent?.includes('Contratos'))!;
 fireEvent.pointerDown(input);input.focus();
 expect(screen.queryByRole('navigation',{name:'Seções da plataforma'})).not.toBeInTheDocument();
 expect(input).toHaveFocus();fireEvent.change(input,{target:{value:'8'}});expect(input).toHaveValue('8');
 const toggle=screen.getByRole('button',{name:'Expandir menu'});
 fireEvent.pointerDown(toggle);fireEvent.click(toggle);
 const bonus=screen.getByRole('button',{name:'Bônus e saques'});
 fireEvent.pointerDown(bonus);fireEvent.click(bonus);
 expect(screen.getByRole('button',{name:'Aplicar depósito'})).toBeInTheDocument();
});
it('aplica e reverte depósito pela interface com confirmação',async()=>{
 render(<App/>);fireEvent.click(await screen.findByRole('button',{name:'Expandir menu'}));
 fireEvent.click(screen.getByRole('button',{name:'Bônus e saques'}));
 expect(screen.getByRole('button',{name:/Reverter último depósito/})).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Valor do depósito ($)'),{target:{value:'500'}});
 fireEvent.click(screen.getByRole('button',{name:'Aplicar depósito'}));
 expect(screen.getByText('Conquistado: $500')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Reverter último depósito/}));
 fireEvent.click(screen.getByRole('button',{name:'Confirmar reversão do depósito'}));
 expect(screen.getByText('Conquistado: $0')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:/Reverter último depósito/})).toBeDisabled();
});
