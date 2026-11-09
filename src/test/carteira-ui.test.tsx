import {useState} from 'react';
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {CarteiraPessoal} from '@/components/platform/CarteiraPessoal';
import {Bancas} from '@/components/platform/Bancas';
import {carteiraVazia,type Carteira} from '@/lib/platform/carteira';
import {novaBanca,parseBancas} from '@/lib/platform/bancas';
vi.mock('@/components/platform/Platform',()=>({Platform:({onOpenCarteira}:{onOpenCarteira:()=>void})=><button onClick={onOpenCarteira}>Carteira pessoal</button>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:vi.fn(async()=>({data:{session:null}}))}}}));
vi.mock('@/lib/auditoria-registro',()=>({registrarAuditoria:vi.fn(async()=>{})}));
const save=vi.fn(async(_c:Carteira)=>true);
function Wallet(){const[c,set]=useState(carteiraVazia());return <CarteiraPessoal value={c} bancas={[]} mesas={{}} onSave={async v=>{const ok=await save(v);if(ok)set(v);return ok;}} onClose={()=>{}} onBackup={()=>{}} saldoForex={0}/>;}
describe('carteira interface',()=>{
 it('salva valores brasileiros, mantém lançamentos e apura saldo separado',async()=>{
  render(<Wallet/>);
  fireEvent.change(screen.getByLabelText('Valor total (US$)'),{target:{value:'1.400,00'}});
  fireEvent.change(screen.getByLabelText('Corretora / carteira / origem'),{target:{value:'VT Markets'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar lançamento'}));
  await waitFor(()=>expect(save).toHaveBeenCalled());
  expect(save.mock.calls.at(-1)![0].lancamentos[0]!.valor).toBe(1400);
  expect(await screen.findByText('Salvo na nuvem.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nome da carteira'),{target:{value:'VT Markets'}});
  fireEvent.change(screen.getByLabelText('Saldo atual (US$)'),{target:{value:'1500'}});
  fireEvent.click(screen.getByRole('button',{name:'Atualizar saldo'}));
  await waitFor(()=>expect(save.mock.calls.at(-1)![0].saldos[0]!.valor).toBe(1500));
  expect(screen.getByText(/Meu lucro ou prejuízo · parcial/)).toHaveTextContent('100,00');
 });
 it('falha de salvamento mantém formulário para nova tentativa',async()=>{
  save.mockResolvedValueOnce(false);render(<Wallet/>);
  fireEvent.change(screen.getByLabelText('Valor total (US$)'),{target:{value:'123'}});
  fireEvent.change(screen.getByLabelText('Corretora / carteira / origem'),{target:{value:'VT'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar lançamento'}));
  expect(await screen.findByText(/Falha ao salvar/)).toBeInTheDocument();expect(screen.getByLabelText('Valor total (US$)')).toHaveValue('123');
 });
 it('mostra dez contas por grupo, permite editar a 50 e preserva carteira na troca de conta',async()=>{
  const bancas=Array.from({length:50},(_,i)=>({...novaBanca(`Conta ${i+1}`),criadaEm:1000+i}));
  const doc=parseBancas(JSON.stringify({bancasVersion:1,bancas,activeId:bancas[0]!.id}));
  doc.carteira={...carteiraVazia(),conferida:true};
  const persist=vi.fn(async(_s:string)=>true);
  render(<Bancas load={async()=>JSON.stringify(doc)} save={persist} isAdmin/>);
  fireEvent.click(await screen.findByRole('button',{name:/Minhas contas/i}));
  expect(document.querySelectorAll('article')).toHaveLength(10);
  fireEvent.click(screen.getByRole('button',{name:/Grupo 5/}));
  const articles=Array.from(document.querySelectorAll('article'));
  expect(articles).toHaveLength(10);expect(articles[9]).toHaveTextContent('Conta 50');
  articles[9]!.querySelector('details')!.open=true;
  const prompt=vi.spyOn(window,'prompt').mockReturnValue('Conta corrigida');
  fireEvent.click(within(articles[9]!).getByRole('button',{name:'Renomear'}));
  await waitFor(()=>expect(persist).toHaveBeenCalled());
  const saved=JSON.parse(persist.mock.calls.at(-1)![0]);
  expect(saved.bancas[49].nome).toBe('Conta corrigida');expect(saved.carteira.conferida).toBe(true);prompt.mockRestore();
 });
});
