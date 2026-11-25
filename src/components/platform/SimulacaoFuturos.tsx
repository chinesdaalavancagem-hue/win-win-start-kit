import { useMemo, useState } from 'react';
import { parseValorFinanceiro } from '@/lib/platform/engine';
import { precosFuturos, TICKS_FUTUROS } from '@/lib/platform/simulacao-futuros';

const VALOR_TICK_POR_CONTRATO = { MGC: 1, GC: 10, MNQ: 0.5, NQ: 5 } as const;

export function SimulacaoFuturos() {
  const [ativo, setAtivo] = useState<keyof typeof TICKS_FUTUROS>('MGC');
  const [lado, setLado] = useState('compra');
  const [entrada, setEntrada] = useState('');
  const [alvo, setAlvo] = useState('');
  const [stop, setStop] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [modo, setModo] = useState<'ticks' | 'valor'>('ticks');
  const [alvoFinanceiro, setAlvoFinanceiro] = useState('');
  const [stopFinanceiro, setStopFinanceiro] = useState('');

  const e = parseValorFinanceiro(entrada);
  const a = parseValorFinanceiro(alvo);
  const s = parseValorFinanceiro(stop);
  const qtd = parseValorFinanceiro(quantidade);
  const ganhoDesejado = parseValorFinanceiro(alvoFinanceiro);
  const perdaDesejada = parseValorFinanceiro(stopFinanceiro);
  const valorTick = VALOR_TICK_POR_CONTRATO[ativo];
  const quantidadeValida = qtd !== null && Number.isInteger(qtd) && qtd > 0;
  const ticksAlvo = modo === 'ticks' ? a : ganhoDesejado !== null && quantidadeValida ? Math.round(ganhoDesejado / (valorTick * qtd)) : null;
  const ticksStop = modo === 'ticks' ? s : perdaDesejada !== null && quantidadeValida ? Math.round(perdaDesejada / (valorTick * qtd)) : null;
  const resultado = useMemo(() => {
    if (e === null || !quantidadeValida || (ticksAlvo === null && ticksStop === null)) return null;
    return precosFuturos(e, ticksAlvo ?? 0, ticksStop ?? 0, TICKS_FUTUROS[ativo], lado === 'compra');
  }, [e, quantidadeValida, ticksAlvo, ticksStop, ativo, lado]);

  const campo = 'mt-1 w-full rounded-lg border border-cyan-900 bg-[#091a20] p-3 text-slate-100';
  const formatar = (v: number) => v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const dinheiro = (ticks: number | null) => ticks === null ? null : ticks * valorTick * (qtd ?? 0);
  const botaoModo = (valor: 'ticks' | 'valor', texto: string) => <button type="button" aria-pressed={modo === valor} onClick={() => setModo(valor)} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${modo === valor ? 'border-cyan-400 bg-cyan-950 text-cyan-200' : 'border-slate-700 bg-[#091525] text-slate-300'}`}>{texto}</button>;

  return <section className="rounded-2xl border border-cyan-900 bg-[#071426] p-4 sm:p-6" aria-label="Simulação de preços nos futuros">
    <h2 className="text-xl font-bold text-cyan-300">Simulação · Futuros</h2>
    <p className="mt-2 text-sm text-slate-300">Calcule preço de alvo e stop e veja o resultado financeiro conforme a quantidade de contratos. Não envia ordens nem altera seus cards.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label>Contrato<select className={campo} value={ativo} onChange={e => setAtivo(e.target.value as keyof typeof TICKS_FUTUROS)}>{Object.keys(TICKS_FUTUROS).map(k => <option key={k}>{k}</option>)}</select></label>
      <label>Direção<select className={campo} value={lado} onChange={e => setLado(e.target.value)}><option value="compra">Compra</option><option value="venda">Venda</option></select></label>
      <label>Preço de entrada<input className={campo} inputMode="decimal" placeholder="Ex.: 3991,5" value={entrada} onChange={e => setEntrada(e.target.value)} /></label>
      <label>Quantidade de contratos (micros)<input className={campo} type="number" min="1" step="1" inputMode="numeric" value={quantidade} onChange={e => setQuantidade(e.target.value)} /></label>
    </div>
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Modo de cálculo">
      {botaoModo('ticks', 'Informar ticks')}
      {botaoModo('valor', 'Informar valor em US$')}
    </div>
    {modo === 'ticks' ? <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <label>Alvo em ticks<input className={campo} inputMode="numeric" placeholder="Ex.: 122" value={alvo} onChange={e => setAlvo(e.target.value)} /></label>
      <label>Stop em ticks<input className={campo} inputMode="numeric" placeholder="Ex.: 100" value={stop} onChange={e => setStop(e.target.value)} /></label>
    </div> : <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <label>Quanto deseja ganhar? (US$)<input className={campo} inputMode="decimal" placeholder="Ex.: 300" value={alvoFinanceiro} onChange={e => setAlvoFinanceiro(e.target.value)} /></label>
      <label>Quanto aceita perder? (US$)<input className={campo} inputMode="decimal" placeholder="Ex.: 200" value={stopFinanceiro} onChange={e => setStopFinanceiro(e.target.value)} /></label>
    </div>}
    <p className="mt-3 text-xs text-slate-400">1 tick = {TICKS_FUTUROS[ativo].toLocaleString('pt-BR')} ponto · valor por tick/contrato: US$ {formatar(valorTick)} · use ticks inteiros. No modo financeiro, a distância é arredondada para o tick inteiro mais próximo e o valor efetivo é exibido abaixo.</p>
    {resultado ? <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-live="polite">
      {ticksAlvo !== null && <div className="rounded-xl border border-emerald-700 p-4 text-emerald-300">
        <span>Preço do alvo</span><strong className="block text-2xl">{formatar(resultado.alvo)}</strong>
        <p className="mt-1 text-xs">{ticksAlvo} ticks · ganho estimado: <strong>US$ {formatar(dinheiro(ticksAlvo) ?? 0)}</strong></p>
      </div>}
      {ticksStop !== null && <div className="rounded-xl border border-rose-700 p-4 text-rose-300">
        <span>Preço do stop</span><strong className="block text-2xl">{formatar(resultado.stop)}</strong>
        <p className="mt-1 text-xs">{ticksStop} ticks · perda estimada: <strong>US$ {formatar(dinheiro(ticksStop) ?? 0)}</strong></p>
      </div>}
    </div> : <p className="mt-4 text-sm text-amber-200">Informe uma entrada válida, quantidade inteira de contratos e o alvo ou stop para calcular.</p>}
    <p className="mt-3 text-xs text-slate-400">Valores brutos, sem taxas, comissões ou slippage. Preços calculados, sem cotação ao vivo; a execução pode ocorrer em outro preço.</p>
  </section>;
}
