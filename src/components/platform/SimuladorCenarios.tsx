import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, GitBranch, Save, ShieldCheck, TrendingUp } from "lucide-react";
import type { AssetKey, State } from "@/lib/platform/engine";
import { desfechosPara, expectativaPonderada, simularDesfecho } from "@/lib/platform/simulador-cenarios";

const usd = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(v);
const numero = (v: number) => Number.isFinite(v) ? v.toFixed(2).replace(".", ",") : "—";
const campo = "w-full rounded-lg border border-cyan-900 bg-[#030b15] px-3 py-2 text-slate-100 outline-none focus:border-cyan-400";
const btn = "rounded-lg border border-cyan-900 px-3 py-2 text-xs font-semibold transition-colors hover:bg-cyan-950";
type Preset = { nome: string; bonus: number; stopout: number; pesos: Record<string, number> };
const defaultPesos = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, i === 0 ? 60 : ids.length > 1 ? 40 / (ids.length - 1) : 0]));

export function SimuladorCenarios({ state, assetKey }: { state: State; assetKey: AssetKey }) {
  const asset = state.assets[assetKey];
  const desfechos = useMemo(() => desfechosPara(asset, assetKey), [asset, assetKey]);
  const [selecionado, selecionar] = useState("aprovou");
  const [bonus, setBonus] = useState<number | null>(null);
  const [stopout, setStopout] = useState<number | null>(null);
  const [pesos, setPesos] = useState<Record<string, number>>({});
  const [nomePreset, setNomePreset] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [alertasAbertos, setAlertasAbertos] = useState(true);

  const bonusEfetivo = bonus ?? asset.bonus.percentual ?? 100;
  const stopoutEfetivo = stopout ?? asset.params.stopoutPct;
  const resultados = useMemo(() => desfechos.map(d => simularDesfecho(state, assetKey, d, {bonusPct: bonusEfetivo, stopoutPct: stopoutEfetivo})),
    [state, assetKey, desfechos, bonusEfetivo, stopoutEfetivo]);
  const pesosEfetivos = { ...defaultPesos(desfechos.map(d => d.id)), ...pesos };
  const expectativa = expectativaPonderada(resultados, desfechos.map(d => pesosEfetivos[d.id] ?? 0));
  const indiceSelecionado = Math.max(0, desfechos.findIndex(d => d.id === selecionado));
  const atual = resultados[indiceSelecionado] ?? resultados[0];
  if (!atual) return <p className="text-slate-300">Sem operações para simular.</p>;
  const haRisco = atual.diagnosticos.some(d => !d.coberturaValida);
  const entradas = atual.eventos;
  const presetsValidos = presets.filter(p => p.nome.trim());

  return <section aria-label="Laboratório de cenários" className="space-y-4">
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-[#13112b] via-[#071525] to-[#061521] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.19em] text-violet-300">Laboratório experimental · branch de teste</p>
          <h2 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">Simulador de cenários e caixa</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">Simulações independentes: nada é registrado como operação, depósito, saque ou alteração de parâmetros oficiais.</p></div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-300">Somente leitura dos seus dados</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-700/50 bg-[#07121e]/80 p-3"><p className="text-xs text-slate-400">Capital novo projetado</p><p className="mt-1 text-xl font-bold text-white">{usd(atual.capitalDepositado)}</p></div>
        <div className="rounded-xl border border-slate-700/50 bg-[#07121e]/80 p-3"><p className="text-xs text-slate-400">Payout estimado</p><p className="mt-1 text-xl font-bold text-emerald-300">{usd(atual.payout)}</p></div>
        <div className="rounded-xl border border-slate-700/50 bg-[#07121e]/80 p-3"><p className="text-xs text-slate-400">Resultado pessoal projetado</p><p className={`mt-1 text-xl font-bold ${atual.resultadoEconomico >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{usd(atual.resultadoEconomico)}</p></div>
        <div className="rounded-xl border border-slate-700/50 bg-[#07121e]/80 p-3"><p className="text-xs text-slate-400">Expectativa dos cenários</p><p className="mt-1 text-xl font-bold text-cyan-300">{expectativa ? usd(expectativa.media) : "—"}</p></div>
      </div>
    </div>

    <div className="rounded-2xl border border-cyan-900/70 bg-[#071321] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-100"><Save className="size-4 text-violet-300"/>Configuração de teste e presets</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-300">Bônus estimado (%)<input aria-label="Bônus estimado" type="number" min="0" max="1000" step="1" className={`mt-1 ${campo}`} value={bonusEfetivo} onChange={e=>setBonus(Math.max(0, Number(e.target.value)||0))}/></label>
        <label className="text-xs text-slate-300">Stop-out de referência (%)<input aria-label="Stop-out de referência" type="number" min="0" max="100" step="1" className={`mt-1 ${campo}`} value={stopoutEfetivo} onChange={e=>setStopout(Math.max(0, Number(e.target.value)||0))}/></label>
      </div>
      <p className="mt-2 text-xs text-slate-400">Os demais dados são os parâmetros atuais da banca. Alterações aqui não são salvas na nuvem e somem ao recarregar a página.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input aria-label="Nome do preset" placeholder="Nome do cenário de teste" className={`min-w-0 flex-1 ${campo}`} value={nomePreset} onChange={e=>setNomePreset(e.target.value)} maxLength={45}/>
        <button type="button" className={btn} disabled={!nomePreset.trim()} onClick={() => {
          const n = nomePreset.trim();if(!n)return;
          setPresets(old => [...old.filter(p => p.nome!==n), {nome:n,bonus:bonusEfetivo,stopout:stopoutEfetivo,pesos:{...pesosEfetivos}}]);
        }}>Salvar preset nesta sessão</button>
      </div>
      {presetsValidos.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{presetsValidos.map(p=><button type="button" key={p.nome} className={btn} onClick={()=>{setBonus(p.bonus);setStopout(p.stopout);setPesos(p.pesos);setNomePreset(p.nome);}}>{p.nome}</button>)}</div>}
    </div>

    <div className="rounded-2xl border border-violet-500/25 bg-[#0b1322] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><GitBranch className="size-4 text-violet-300"/>Escolha o desfecho</div>
      <div className="mb-4 flex flex-wrap gap-2">{desfechos.map(d=><button type="button" key={d.id} aria-pressed={atual.id===d.id}
        className={`${btn} ${atual.id===d.id?"border-violet-400 bg-violet-700/30 text-white":"text-slate-300"}`} onClick={()=>selecionar(d.id)}>{d.titulo}</button>)}</div>
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-cyan-950 bg-[#06101d] p-3"><p className="text-xs text-slate-400">Capital próprio restante</p><p className="text-lg font-bold text-cyan-300">{usd(atual.saldoProprioFinal)}</p></div>
        <div className="rounded-lg border border-cyan-950 bg-[#06101d] p-3"><p className="text-xs text-slate-400">Bônus restante (não sacável)</p><p className="text-lg font-bold text-amber-300">{usd(atual.saldoBonusFinal)}</p></div>
        <div className="rounded-lg border border-cyan-950 bg-[#06101d] p-3"><p className="text-xs text-slate-400">Fluxo do caixa pessoal</p><p className="text-lg font-bold text-slate-100">{usd(atual.caixaFinal)}</p></div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-[#0e1b2d] text-slate-400"><tr>{["Quando","Etapa","Movimento","Saldo mesa Δ","Forex próprio","Bônus","Caixa pessoal"].map(x=><th key={x} className="p-2.5">{x}</th>)}</tr></thead>
        <tbody>{entradas.map((ev,i)=><tr key={i} className="border-t border-slate-800/60 text-slate-200"><td className="p-2.5">{ev.dia}</td><td className="p-2.5">{ev.fase}</td><td className="p-2.5">{ev.operacao}</td><td className="p-2.5 font-mono">{usd(ev.mesa)}</td><td className="p-2.5 font-mono">{usd(ev.forexProprio)}</td><td className="p-2.5 font-mono">{usd(ev.forexBonus)}</td><td className={`p-2.5 font-mono ${ev.caixaPessoal>=0?"text-emerald-300":"text-rose-300"}`}>{usd(ev.caixaPessoal)}</td></tr>)}</tbody>
      </table></div>
      <p className="mt-2 text-xs text-slate-400">Saldo da mesa é a variação acumulada simulada, não o saldo nominal da conta. Resultado pessoal inclui caixa + saldo próprio residual, descontando o saldo próprio já existente no início. O bônus não conta como lucro sacável.</p>
    </div>

    <div className="rounded-2xl border border-amber-500/25 bg-[#10151e] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-100"><ShieldCheck className="size-4 text-amber-300"/>Diagnóstico da cobertura</h3>
        <span className={`text-xs font-semibold ${haRisco?"text-rose-300":"text-amber-300"}`}>{haRisco?"Insuficiência projetada":"Reserva matemática estimada; liquidação não validada"}</span></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[680px] text-xs"><thead className="text-slate-400"><tr>{["Dia","Margem","Reserva stop-out","Perda se passar","Necessário","Saldo antes","Aporte","Situação"].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr></thead><tbody>{atual.diagnosticos.map(d=><tr key={d.dia} className="border-t border-amber-900/30 text-slate-200">{[d.dia,numero(d.margem),numero(d.reservaStopout),numero(d.perdaNoTake),numero(d.necessidade),numero(d.saldoAntes),numero(d.aporte)].map((v,i)=><td className="p-2 font-mono" key={i}>{v}</td>)}<td className={`p-2 font-semibold ${d.coberturaValida?"text-emerald-300":"text-rose-300"}`}>{d.coberturaValida?"Estimativa coberta":"Falta capital"}</td></tr>)}</tbody></table></div>
      <button className={`mt-3 flex items-center gap-2 ${btn}`} type="button" aria-expanded={alertasAbertos} onClick={()=>setAlertasAbertos(v=>!v)}><AlertTriangle className="size-4 text-amber-300"/>{atual.alertas.length} observações e limites {alertasAbertos?"▴":"▾"}</button>
      {alertasAbertos && <ul className="mt-2 space-y-1 text-xs text-amber-100/80">{atual.alertas.map((a,i)=><li key={i}>• {a}</li>)}</ul>}
    </div>

    <div className="rounded-2xl border border-cyan-900/50 bg-[#071321] p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-white"><TrendingUp className="size-4 text-cyan-300"/>Probabilidades personalizadas</h3>
      <p className="mt-1 text-xs text-slate-400">Percentuais ilustrativos editáveis, não probabilidades observadas nem promessa de lucro. Se a soma não for 100%, o cálculo normaliza os pesos e sinaliza isso.</p>
      <div className="mt-3 space-y-3">{desfechos.map((d)=><div key={d.id} className="grid grid-cols-[minmax(0,1fr)_85px] items-center gap-3">
        <label className="min-w-0 text-xs text-slate-200">{d.titulo}<input aria-label={`Probabilidade de ${d.titulo}`} type="range" min="0" max="100" step="1" value={pesosEfetivos[d.id]??0} onChange={e=>setPesos(o=>({...o,[d.id]:Number(e.target.value)}))} className="mt-1 block w-full accent-violet-500"/></label>
        <input type="number" min="0" max="100" aria-label={`Percentual de ${d.titulo}`} value={Math.round((pesosEfetivos[d.id]??0)*100)/100} onChange={e=>setPesos(o=>({...o,[d.id]:Math.max(0,Math.min(100,Number(e.target.value)||0))}))} className={campo}/></div>)}</div>
      {expectativa && <p className="mt-3 text-sm text-cyan-200">Soma dos pesos: <strong>{numero(expectativa.somaPesos)}%</strong> · Média ponderada: <strong>{usd(expectativa.media)}</strong>{expectativa.normalizado?" · Pesos normalizados para calcular a média.":""}</p>}
    </div>

    <div className="flex items-start gap-2 rounded-xl border border-cyan-800/50 bg-[#091827] p-3 text-xs text-slate-300">
      <BookOpen className="mt-0.5 size-4 shrink-0 text-cyan-300"/>
      <p>Laboratório de leitura e comparação, não um motor de ordens. Não avalia regras de elegibilidade, consistência real, latência de hedge, slippage, timing de liquidação nem retenções contratuais. Não use as projeções isoladamente para dimensionar operações.</p>
    </div>
  </section>;
}
