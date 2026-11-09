import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { Banca } from '@/lib/platform/bancas';
import { importarCompras, valorCompraRegistrada, resumoCarteira, TIPOS_CARTEIRA, type Carteira, type LancamentoCarteira, type SaldoCarteira, type TipoLancamento } from '@/lib/platform/carteira';
import { parseValorFinanceiro } from '@/lib/platform/engine';

const hoje = () => new Date().toLocaleDateString('en-CA');
const usd = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
const campo = 'w-full rounded-lg border border-cyan-900 bg-[#071426] p-2 text-sm text-slate-100';
const novo = (): LancamentoCarteira => ({id: crypto.randomUUID(), data: hoje(), tipo: 'deposito', valor: 0, descricao: '', local: '', destino: '', externo: true, quantidade: 1});

export function CarteiraPessoal({ value, bancas, mesas, onSave, onClose, onBackup, saldoForex }: {
  value: Carteira; bancas: Banca[]; mesas: Record<string, {nome: string}>;
  onSave: (c: Carteira) => Promise<boolean>; onClose: () => void; onBackup: () => void; saldoForex: number;
}) {
  const [entry, setEntry] = useState(novo), [valor, setValor] = useState('');
  const [saldo, setSaldo] = useState<SaldoCarteira>({id: crypto.randomUUID(), nome: '', valor: 0, data: hoje()});
  const [valorSaldo, setValorSaldo] = useState('');
  const [busy, setBusy] = useState(false), [aviso, setAviso] = useState('');
  const [filtro, setFiltro] = useState(''), [pagina, setPagina] = useState(0);
  const r = resumoCarteira(value);
  const semPreco = bancas.filter(b => !value.lancamentos.some(e => e.origemConta === b.id) && valorCompraRegistrada(b) === null);
  const lancamentos = [...value.lancamentos].filter(e => `${e.descricao} ${e.local} ${TIPOS_CARTEIRA[e.tipo]}`.toLowerCase().includes(filtro.toLowerCase())).sort((a,b) => b.data.localeCompare(a.data));
  const paginaAtual = Math.min(pagina, Math.max(0, Math.ceil(lancamentos.length / 10) - 1));
  const guardar = async (next: Carteira) => {
    setBusy(true); setAviso('Salvando na nuvem…');
    try { const ok = await onSave(next); setAviso(ok ? 'Salvo na nuvem.' : 'Falha ao salvar. Tente novamente antes de fechar.'); return ok; }
    catch { setAviso('Falha ao salvar. Tente novamente antes de fechar.'); return false; }
    finally { setBusy(false); }
  };
  const editar = (e: LancamentoCarteira) => {setEntry({...e}); setValor(String(e.valor)); document.getElementById('carteira-lancamento')?.scrollIntoView({behavior:'smooth'});};
  return <Dialog open onOpenChange={open => {if (!open && !busy) onClose();}}>
    <DialogContent className="max-h-[92dvh] w-[96vw] max-w-5xl overflow-y-auto border-cyan-900 bg-[#06101f] p-4 text-slate-100 sm:p-6">
      <DialogTitle className="text-xl text-cyan-200">Carteira pessoal</DialogTitle>
      <DialogDescription className="text-slate-400">Quanto saiu do seu bolso, quanto você sacou e onde o dinheiro está agora.</DialogDescription>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {([['Do meu bolso para o Forex', r.aportes], ['Gastei comprando contas', r.compras], ['Saquei das mesas', r.payouts], ['Saquei do Forex', r.saquesForex], ['Voltou para meu bolso', r.recebido], ['Ainda nas corretoras / cripto', r.saldo]] as const).map(([label,n]) => <div key={label} className="min-w-0 rounded-xl border border-cyan-900 bg-[#091827] p-3"><p className="text-xs text-slate-400">{label}</p><p className={`mt-1 break-words text-lg font-bold ${n < 0 ? 'text-rose-300' : 'text-cyan-200'}`}>{usd(n)}</p></div>)}
      </div>
      <div className="rounded-xl border border-cyan-900 bg-[#091827] p-3">
        <p className="text-sm">{value.conferida ? 'Meu lucro ou prejuízo' : 'Meu lucro ou prejuízo · parcial'}: <strong className={r.resultado < 0 ? 'text-rose-300' : 'text-emerald-300'}>{usd(r.resultado)}</strong></p>
        <p className="mt-1 text-xs text-slate-400">Dinheiro que voltou ao bolso + o que ainda tenho − tudo que saiu do meu bolso ({usd(r.investido)}).</p>
      </div>
      <p className="text-sm text-cyan-100">Saque que foi para cripto ainda não voltou para o seu bolso. Escolha o destino ao registrar.</p>
      <div role="status" className="text-sm text-amber-200">{aviso || (value.conferida ? 'Valores conferidos por você.' : 'Registre as movimentações e informe quanto tem hoje.')}</div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} variant="outline" onClick={() => {
          const next = importarCompras(value, bancas, mesas), count = next.lancamentos.length - value.lancamentos.length;
          if (!count) {setAviso('Nenhuma compra nova com valor pago cadastrado. Compras já importadas não são repetidas.'); return;}
          if (window.confirm(`Importar ${count} compra(s)? São consideradas pagas com dinheiro externo. Se usou saldo de uma carteira, edite a origem após importar. Não registre essas mesmas compras manualmente.`)) void guardar(next);
        }}>Importar compras cadastradas</Button>
        <Button variant="outline" onClick={onBackup}>Baixar backup completo</Button>
      </div>
      <p className="text-xs text-slate-400">Já importou suas contas? Não precisa digitá-las outra vez. O botão adiciona apenas compras ainda não importadas.</p>
      {semPreco.length > 0 && <p role="status" className="text-xs text-amber-200">{semPreco.length} conta(s) sem preço de compra confirmado: {semPreco.map(b => b.nome).join(", ")}. Confira o valor pago em Minhas Contas e importe novamente.</p>}
      <section className="rounded-xl border border-cyan-900 p-3" aria-label="Compras por mesa">
        <h3 className="font-semibold">Comprei {Object.values(r.mesas).reduce((n,m)=>n+m.quantidade,0)} contas · {usd(r.compras)}</h3>
        {Object.entries(r.mesas).length ? <ul className="mt-2 space-y-1 text-sm">{Object.entries(r.mesas).map(([nome,m]) => <li key={nome} className="flex justify-between gap-2"><span>{nome} · {m.quantidade} contas</span><strong>{usd(m.valor)}</strong></li>)}</ul> : <p className="mt-2 text-sm text-slate-400">Importe suas contas ou registre as compras manualmente.</p>}
      </section>
      <form id="carteira-lancamento" className="space-y-3 rounded-xl border border-cyan-900 p-3" onSubmit={async e => {
        e.preventDefault(); const n = parseValorFinanceiro(valor);
        if (n === null || !Number.isFinite(n) || n <= 0 || !entry.local.trim() || !entry.data || !Number.isInteger(entry.quantidade) || entry.quantidade < 1 || (entry.tipo === 'transferencia' && (!entry.destino.trim() || entry.destino.trim() === entry.local.trim()))) {setAviso('Confira o valor, a data, o local e a quantidade. Transferências precisam de um destino diferente.'); return;}
        const salvo = {...entry, valor: Math.round(n*100)/100};
        const next = {...value, conferida:false, lancamentos: value.lancamentos.some(x => x.id === salvo.id) ? value.lancamentos.map(x => x.id === salvo.id ? salvo : x) : [...value.lancamentos,salvo]};
        if(await guardar(next)){setEntry(novo());setValor('');}
      }}>
        <h3 className="font-semibold">{value.lancamentos.some(e => e.id === entry.id) ? 'Editar lançamento' : 'Novo lançamento'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">O que aconteceu?<select className={campo} value={entry.tipo} onChange={e => setEntry({...entry, tipo:e.target.value as TipoLancamento, externo:!['saque_forex','payout'].includes(e.target.value)})}>{Object.entries(TIPOS_CARTEIRA).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs">Data<Input type="date" required className={campo} value={entry.data} onChange={e=>setEntry({...entry,data:e.target.value})}/></label>
          <label className="text-xs">Valor total (US$)<Input inputMode="decimal" required className={campo} placeholder="1400,00" value={valor} onChange={e=>setValor(e.target.value)}/></label>
          <label className="text-xs">{entry.tipo==='compra' ? 'Mesa proprietária' : 'Corretora / carteira / origem'}<Input required className={campo} value={entry.local} onChange={e=>setEntry({...entry,local:e.target.value})} placeholder="Ex.: Lucid, VT Markets ou Binance" maxLength={100}/></label>
          <label className="text-xs">Observação (opcional)<Input className={campo} value={entry.descricao} onChange={e=>setEntry({...entry,descricao:e.target.value})} maxLength={200}/></label>
          {entry.tipo==='compra' && <label className="text-xs">Quantidade de contas<Input type="number" min={1} step={1} required className={campo} value={entry.quantidade} onChange={e=>setEntry({...entry,quantidade:Number(e.target.value)})}/></label>}
          {entry.tipo==='transferencia' && <label className="text-xs">Carteira de destino<Input className={campo} required value={entry.destino} onChange={e=>setEntry({...entry,destino:e.target.value})}/></label>}
          {['compra','despesa','payout','saque_forex'].includes(entry.tipo) && <label className="text-xs">{['payout','saque_forex'].includes(entry.tipo) ? 'Para onde foi o dinheiro?' : 'De onde saiu o dinheiro?'}<select className={campo} value={entry.externo?'fora':'dentro'} onChange={e=>setEntry({...entry,externo:e.target.value==='fora'})}><option value="fora">{['payout','saque_forex'].includes(entry.tipo) ? 'Direto para meu bolso / banco pessoal' : 'Do meu bolso / banco pessoal'}</option><option value="dentro">{['payout','saque_forex'].includes(entry.tipo) ? 'Ficou na cripto ou em outra corretora' : 'Do saldo que eu já tinha no Forex / cripto'}</option></select></label>}
        </div>
        <p className="text-xs text-slate-400">{entry.tipo==='compra' ? 'Informe o valor total das contas compradas. Ex.: 10 contas de US$ 70 = US$ 700.' : entry.tipo==='saque' ? 'Use quando o dinheiro saiu da cripto e chegou ao seu banco pessoal. Se já marcou um saque como direto para o bolso, não registre novamente.' : entry.tipo==='deposito' ? 'Somente dinheiro novo do seu bolso. Se veio da cripto, escolha “Movi dinheiro entre corretoras / cripto”.' : 'Registre cada movimento uma única vez. Informe o valor realmente recebido, após taxas.'}</p>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Salvar lançamento</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>{setEntry(novo());setValor('');}}>Limpar / cancelar edição</Button></div>
      </form>
      <section className="space-y-3 rounded-xl border border-cyan-900 p-3" aria-label="Saldos atuais">
        <h3 className="font-semibold">Quanto tenho hoje?</h3>
        <p className="text-xs text-slate-400">Informe cada corretora ou carteira separadamente: por exemplo, VT Markets US$ 500 e Binance US$ 300. Sem bônus e sem o saldo nominal da mesa. Atualize estes valores após movimentações; eles não mudam automaticamente.</p>
        <form className="grid gap-2 sm:grid-cols-4" onSubmit={async e=>{
          e.preventDefault(); const n=parseValorFinanceiro(valorSaldo);
          if(n===null||!Number.isFinite(n)||n<0||!saldo.nome.trim()||!saldo.data){setAviso('Informe nome, data e saldo válido (zero é permitido).');return;}
          const existente=value.saldos.find(s=>s.id===saldo.id||s.nome.toLowerCase()===saldo.nome.trim().toLowerCase());
          const novoSaldo={...saldo,id:existente?.id??saldo.id,nome:saldo.nome.trim(),valor:Math.round(n*100)/100};
          if(await guardar({...value,conferida:false,saldos:existente?value.saldos.map(s=>s.id===existente.id?novoSaldo:s):[...value.saldos,novoSaldo]})){setSaldo({id:crypto.randomUUID(),nome:'',valor:0,data:hoje()});setValorSaldo('');}
        }}>
          <label className="text-xs">Nome da carteira<Input className={campo} required value={saldo.nome} maxLength={100} onChange={e=>setSaldo({...saldo,nome:e.target.value})}/></label>
          <label className="text-xs">Saldo atual (US$)<Input className={campo} required inputMode="decimal" value={valorSaldo} onChange={e=>setValorSaldo(e.target.value)}/></label>
          <label className="text-xs">Saldo em<Input className={campo} required type="date" value={saldo.data} onChange={e=>setSaldo({...saldo,data:e.target.value})}/></label>
          <Button disabled={busy} className="self-end" type="submit">Atualizar saldo</Button>
        </form>
        {value.saldos.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 text-sm"><span>{s.nome} · {s.data.split('-').reverse().join('/')} · <strong>{usd(s.valor)}</strong></span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setSaldo({...s});setValorSaldo(String(s.valor));}}>Editar saldo</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(window.confirm(`Remover saldo de ${s.nome}? Isso altera o patrimônio calculado.`))void guardar({...value,conferida:false,saldos:value.saldos.filter(x=>x.id!==s.id)});}}>Excluir</Button></div></div>)}
      </section>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={value.conferida} disabled={busy} onChange={e => void guardar({...value, conferida: e.target.checked})} />Já registrei tudo e conferi os saldos de hoje.</label>
      <details className="space-y-2" aria-label="Extrato da carteira"><summary className="cursor-pointer font-semibold">Ver ou corrigir minhas movimentações ({value.lancamentos.length})</summary>
        <h3 className="font-semibold">Extrato · {value.lancamentos.length} lançamentos</h3>
        <Input className={campo} aria-label="Pesquisar lançamentos" placeholder="Pesquisar mesa, corretora ou descrição" value={filtro} onChange={e=>{setFiltro(e.target.value);setPagina(0);}}/>
        {lancamentos.slice(paginaAtual*10,paginaAtual*10+10).map(e=><div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-3 text-sm"><div className="min-w-0"><p className="font-semibold">{TIPOS_CARTEIRA[e.tipo]} · {usd(e.valor)}</p><p className="break-words text-xs text-slate-400">{e.data.split('-').reverse().join('/')} · {e.local}{e.destino?` → ${e.destino}`:''} · {e.descricao}{e.tipo==='compra'?` · ${e.quantidade} conta(s)`:''}{e.origemConta?' · importada':''}</p>{['compra','despesa','payout','saque_forex'].includes(e.tipo)&&<p className="text-xs text-slate-400">{e.externo ? (['payout','saque_forex'].includes(e.tipo) ? 'Recebido direto no bolso' : 'Pago com dinheiro do bolso') : 'Dinheiro nas corretoras / cripto'}</p>}</div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>editar(e)}>Editar</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{if(window.confirm('Excluir este lançamento da carteira?'))void guardar({...value,conferida:false,lancamentos:value.lancamentos.filter(x=>x.id!==e.id)});}}>Excluir</Button></div></div>)}
        {!lancamentos.length&&<p className="text-sm text-slate-400">Nenhum lançamento encontrado.</p>}
        <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={!paginaAtual} onClick={()=>setPagina(paginaAtual-1)}>Anterior</Button><span className="text-xs">{paginaAtual+1} / {Math.max(1,Math.ceil(lancamentos.length/10))}</span><Button variant="outline" disabled={(paginaAtual+1)*10>=lancamentos.length} onClick={()=>setPagina(paginaAtual+1)}>Próxima</Button></div>
      </details>
    </DialogContent>
  </Dialog>;
}
