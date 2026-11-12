import { useState } from 'react';
import { parseValorFinanceiro } from '@/lib/platform/engine';
import { precosFuturos, TICKS_FUTUROS } from '@/lib/platform/simulacao-futuros';

export function SimulacaoFuturos() {
  const [ativo, setAtivo] = useState<keyof typeof TICKS_FUTUROS>('MGC');
  const [lado, setLado] = useState('compra');
  const [entrada, setEntrada] = useState('');
  const [alvo, setAlvo] = useState('');
  const [stop, setStop] = useState('');
  const e = parseValorFinanceiro(entrada), a = parseValorFinanceiro(alvo), s = parseValorFinanceiro(stop);
  const resultado = e !== null && (a !== null || s !== null) && (!alvo.trim() || a !== null) && (!stop.trim() || s !== null) ? precosFuturos(e, a ?? 0, s ?? 0, TICKS_FUTUROS[ativo], lado === 'compra') : null;
  const campo = 'mt-1 w-full rounded-lg border border-cyan-900 bg-[#091a20] p-3 text-slate-100';
  const formatar = (v: number) => v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  return <section className="rounded-2xl border border-cyan-900 bg-[#071426] p-4 sm:p-6" aria-label="Simulação de preços nos futuros">
    <h2 className="text-xl font-bold text-cyan-300">Simulação · Futuros</h2>
    <p className="mt-2 text-sm text-slate-300">Calcule o preço do alvo e do stop a partir da entrada. Não envia ordens nem altera seus cards.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label>Contrato<select className={campo} value={ativo} onChange={e => setAtivo(e.target.value as keyof typeof TICKS_FUTUROS)}>{Object.keys(TICKS_FUTUROS).map(k => <option key={k}>{k}</option>)}</select></label>
      <label>Direção<select className={campo} value={lado} onChange={e => setLado(e.target.value)}><option value="compra">Compra</option><option value="venda">Venda</option></select></label>
      <label>Preço de entrada<input className={campo} inputMode="decimal" placeholder="Ex.: 3991,5" value={entrada} onChange={e => setEntrada(e.target.value)} /></label>
      <label>Alvo em ticks<input className={campo} inputMode="numeric" placeholder="Ex.: 122" value={alvo} onChange={e => setAlvo(e.target.value)} /></label>
      <label>Stop em ticks<input className={campo} inputMode="numeric" placeholder="Ex.: 100" value={stop} onChange={e => setStop(e.target.value)} /></label>
    </div>
    <p className="mt-3 text-xs text-slate-400">1 tick = {TICKS_FUTUROS[ativo].toLocaleString('pt-BR')} ponto. Use ticks inteiros. A quantidade de contratos não muda estes preços. Pode preencher só o alvo ou só o stop.</p>
    {resultado ? <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-live="polite">
      {a !== null && <div className="rounded-xl border border-emerald-700 p-4 text-emerald-300">Preço do alvo<strong className="block text-2xl">{formatar(resultado.alvo)}</strong></div>}
      {s !== null && <div className="rounded-xl border border-rose-700 p-4 text-rose-300">Preço do stop<strong className="block text-2xl">{formatar(resultado.stop)}</strong></div>}
    </div> : <p className="mt-4 text-sm text-amber-200">Informe uma entrada válida para o tick do contrato e a distância do alvo ou stop.</p>}
    <p className="mt-3 text-xs text-slate-400">Preços calculados, sem cotação ao vivo. A execução pode ocorrer em outro preço, conforme o tipo de ordem e o mercado.</p>
  </section>;
}
