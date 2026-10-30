import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fmtSigned, historicoTotals, tipoLabel, type State } from '@/lib/platform/engine';
import type { Banca } from '@/lib/platform/bancas';
import { revisarHistorico, valoresOperacao, type LancamentoRevisao } from '@/lib/platform/revisao-historico';
const labels={cfd:'Resultado real no CFD ($)',taxa:'Taxa paga nesta operação ($)',bonus:'Bônus utilizado na perda ($)',saque:'Saque recebido da mesa ($)'};
export function RevisarBanca({banca,onClose,onSave}:{banca:Banca;onClose:()=>void;onSave:(state:State)=>Promise<boolean>}) {
  const [indice,setIndice]=useState(0),[busy,setBusy]=useState(false),[erro,setErro]=useState('');
  const [valores,setValores]=useState(()=>banca.state.log.map(e=>Object.fromEntries(Object.entries(valoresOperacao(e)).map(([k,v])=>[k,String(v)])) as Record<keyof LancamentoRevisao,string>));
  const preview=useMemo(()=>{
    try {
      const entradas=valores.map(v=>Object.fromEntries(Object.entries(v).map(([k,n])=>[k,n.trim()===''?NaN:Number(n.replace(',','.'))])) as unknown as LancamentoRevisao);
      return {state:revisarHistorico(banca.state,entradas),erro:''};
    } catch(e) {return {state:null,erro:e instanceof Error?e.message:'Confira os valores.'};}
  },[valores,banca.state]);
  const evento=banca.state.log[indice];
  const alterado=preview.state && JSON.stringify(preview.state.log)!==JSON.stringify(banca.state.log);
  const fechar=()=>{if(!busy && (!alterado || window.confirm('Descartar as correções ainda não salvas?'))) onClose();};
  return <Dialog open onOpenChange={open=>{if(!open)fechar();}}><DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto bg-[#071426] text-slate-100" onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>e.preventDefault()}>
    <DialogHeader><DialogTitle>Revisar operações · {banca.nome}</DialogTitle><DialogDescription>Revise os dias já registrados. O lucro final é calculado pelas operações. Esta revisão não envia ordens e não modifica o saldo Forex atual nem o bônus disponível.</DialogDescription></DialogHeader>
    {!evento ? <p>Esta banca ainda não tem operações registradas.</p> : <form onSubmit={async e=>{
      e.preventDefault(); if(!preview.state || !alterado || busy)return;
      setBusy(true);setErro('');
      try {if(await onSave(preview.state))onClose();else setErro('Não foi possível salvar ou a banca mudou durante a revisão. Suas correções continuam nesta tela.');}
      catch {setErro('Falha ao salvar. Suas correções continuam nesta tela.');} finally {setBusy(false);}
    }}>
      <fieldset disabled={busy} className="grid gap-5 md:grid-cols-[220px_1fr]">
        <nav aria-label="Operações registradas" className="flex max-h-72 flex-col gap-2 overflow-y-auto md:max-h-[55vh]">{banca.state.log.map((e,i)=><button type="button" key={`${e.id}-${i}`} aria-current={indice===i?'step':undefined} onClick={()=>setIndice(i)} className={`rounded-lg border p-3 text-left text-sm ${indice===i?'border-cyan-400 bg-cyan-950':'border-slate-700'}`}>
          {i+1}. {e.asset==='ouro'?'Gold':e.asset==='nasdaq'?'Nasdaq':'Saque 2'} · Dia {e.day}<span className="block text-xs text-slate-300">{tipoLabel(e.tipo,e.asset)}</span><span className="block text-xs text-slate-400">{new Date(e.ts).toLocaleString('pt-BR')}</span>
        </button>)}</nav>
        <section className="space-y-4"><h3 className="font-semibold">Operação {indice+1} · {tipoLabel(evento.tipo,evento.asset)}</h3><p className="text-sm text-slate-400">Informe o resultado liquidado no CFD: ganho positivo, perda negativa. Corrija a taxa somente no dia em que ela foi paga. O bônus utilizado é a parte da perda que saiu do bônus naquela operação.</p>
          <div className="grid gap-3 sm:grid-cols-2">{(Object.keys(labels) as (keyof LancamentoRevisao)[]).filter(k=>k!=='saque'||evento.tipo==='aprovada').map(k=><label key={k} className="text-sm">{labels[k]}<input required inputMode="decimal" value={valores[indice]![k]} onChange={e=>{const value=e.target.value;setValores(v=>v.map((row,i)=>i===indice?{...row,[k]:value}:row));}} className="mt-1 block w-full rounded-lg border border-slate-600 bg-[#030914] p-3"/></label>)}</div>
          <div className="flex justify-between"><Button type="button" variant="outline" disabled={indice===0} onClick={()=>setIndice(i=>i-1)}>Dia anterior</Button><Button type="button" variant="outline" disabled={indice===valores.length-1} onClick={()=>setIndice(i=>i+1)}>Próximo dia</Button></div>
          <div aria-live="polite" className="rounded-xl border border-slate-700 p-4"><p>Resultado líquido registrado: <strong>{fmtSigned(historicoTotals(banca.state).profit)}</strong></p><p>Resultado líquido após revisão: <strong>{preview.state?fmtSigned(historicoTotals(preview.state).profit):'Confira os valores'}</strong></p><p className="mt-2 text-xs text-slate-400">Os totais da banca, do histórico geral e o gráfico serão atualizados ao salvar. O registro anterior fica guardado para auditoria.</p></div>
        </section>
      </fieldset>
      {(erro||preview.erro)&&<p role="alert" className="mt-3 text-rose-300">{erro||preview.erro}</p>}
      <div className="mt-5 flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={fechar}>Cancelar</Button><Button type="submit" disabled={busy||!alterado||!!preview.erro}>{busy?'Salvando…':'Salvar revisão'}</Button></div>
    </form>}
  </DialogContent></Dialog>;
}
