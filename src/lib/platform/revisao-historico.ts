import { ASSETS, type AssetKey, type LogEntry, type State } from './engine';
export interface LancamentoRevisao { cfd: number; taxa: number; saque: number; bonus: number }
const num = (n: unknown, fallback = 0): number => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
export function valoresOperacao(e: LogEntry): LancamentoRevisao {
  const taxa = num(e.taxaCobrada), saque = num(e.saque);
  const cfd = num(e.cfdReal, e.tipo === 'reprovada' ? num(e.bruto, e.delta + taxa) : -num(e.custoDia, saque - taxa - e.delta));
  return {cfd, taxa, saque, bonus: num(e.custoBonusDia)};
}
/** Revisão contábil: mantém o Forex conciliado e nunca refaz operações na corretora. */
export function revisarHistorico(original: State, valores: LancamentoRevisao[], agora = Date.now()): State {
  if (valores.length !== original.log.length) throw new Error('O histórico mudou. Reabra a revisão.');
  valores.forEach((v,i)=>{
    if (![v.cfd,v.taxa,v.saque,v.bonus].every(Number.isFinite) || Math.abs(v.cfd)>1e9 || v.taxa<0 || v.saque<0 || v.bonus<0 || Math.max(v.taxa,v.saque,v.bonus)>1e9) throw new Error(`Valor inválido na operação ${i+1}.`);
    if (v.bonus>Math.max(0,-v.cfd)) throw new Error(`O bônus utilizado não pode superar a perda CFD na operação ${i+1}.`);
    if (original.log[i]!.tipo!=='aprovada' && v.saque!==0) throw new Error('Saque só pode ser corrigido no encerramento aprovado.');
  });
  const changed = valores.map((v,i)=>JSON.stringify(v)!==JSON.stringify(valoresOperacao(original.log[i]!)));
  if (!changed.some(Boolean)) return structuredClone(original);
  const s=structuredClone(original);
  const diffs=Object.fromEntries(ASSETS.map(k=>[k,{custo:0,proprio:0}])) as Record<AssetKey,{custo:number;proprio:number}>;
  let saldoDiff=0, taxaDiff=0;
  s.log.forEach((e,i)=>{
    const old=original.log[i]!, a=valoresOperacao(old), v=valores[i]!, d=diffs[e.asset];
    const ownOld=old.tipo==='reprovada'?0:-a.cfd-a.bonus+a.taxa;
    const ownNew=old.tipo==='reprovada'?0:-v.cfd-v.bonus+v.taxa;
    d.custo += v.taxa-a.taxa + (e.tipo==='reprovada'?0:a.cfd-v.cfd);
    d.proprio += e.tipo==='reprovada'?v.taxa-a.taxa:ownNew-ownOld;
    const novoDelta=old.delta+(v.cfd-a.cfd)-(v.taxa-a.taxa)+(v.saque-a.saque);
    saldoDiff += novoDelta-old.delta;
    taxaDiff += v.taxa-a.taxa;
    if (changed[i] || d.custo!==0 || d.proprio!==0) {
      // Registros antigos sem base de cálculo não podem ser corrigidos por aproximação.
      if ((e.tipo==='aprovada'||e.tipo==='reprovada') && !Number.isFinite(old.resultadoReal)) throw new Error('Este encerramento antigo não tem os dados necessários para recalcular com segurança.');
      e.cfdReal=v.cfd; e.taxaCobrada=v.taxa; e.saque=v.saque;
      e.delta=novoDelta; e.spread=v.cfd-num(e.cfdTeorico,v.cfd);
      e.custoCiclo=num(old.custoCiclo,num(old.prevCycleCost)+(e.tipo==='reprovada'?a.taxa:-a.cfd+a.taxa))+d.custo;
      if(e.tipo==='reprovada') {
        e.bruto=v.cfd; e.resultadoReal=old.resultadoReal+(v.cfd-a.cfd)-d.custo;
        e.custoProprioCiclo=num(old.custoProprioCiclo)+d.proprio-(v.taxa-a.taxa);
      } else {
        e.custoDia=-v.cfd; e.custoBonusDia=v.bonus; e.custoProprioDia=ownNew;
        e.proporcaoPropria=v.cfd<0?(Math.max(0,-v.cfd)-v.bonus)/-v.cfd:1;
        if(e.tipo==='aprovada') { e.custoProprioCiclo=num(old.custoProprioCiclo)+d.proprio; e.resultadoReal=old.resultadoReal+(v.saque-a.saque)-d.proprio; }
      }
      e.revisadoEm=agora;
    }
    e.saldoApos=old.saldoApos+saldoDiff;
    // Os snapshots antigos não representam o histórico revisado; não restaurá-los no Forex.
    delete e.assinaturaForexApos;
    if(e.tipo!=='profit') {d.custo=0;d.proprio=0;}
  });
  s.totalGasto+=taxaDiff;
  for(const key of ASSETS) {
    s.assets[key].attempt.cycleCost+=diffs[key].custo;
    s.assets[key].attempt.custoProprioAcumulado+=diffs[key].proprio;
  }
  s.revisoesHistorico=[...(s.revisoesHistorico??[]),{ts:agora,anteriores:structuredClone(original.log)}];
  return s;
}
