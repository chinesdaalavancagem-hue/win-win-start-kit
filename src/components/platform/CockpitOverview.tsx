import { useEffect, useState } from "react";
import { CalendarDays, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Coins, Layers, ShieldCheck, Target, TrendingUp, Wallet, X } from "lucide-react";
import { fmt, metaLiquidaDia, type Asset, type AssetKey, type Day, type DayCalc, type MesaFuturos } from "@/lib/platform/engine";

type DayOverview = {
  i: number;
  d: Asset["days"][number];
  c: DayCalc;
  status: "ok" | "alerta" | "risco";
  caixaDia?: { deposito: number } | undefined;
};

export function CockpitOverview({ asset, assetKey, mesa, avaliacaoDias, currentIndex, current, days, onSettle, onApply, canEdit }: {
  asset: Asset;
  assetKey: AssetKey;
  mesa: MesaFuturos;
  avaliacaoDias: number;
  currentIndex: number;
  current: DayOverview;
  days: DayOverview[];
  onSettle: (mode: "profit" | "stop") => void;
  onApply: (indice: number, plano: Day, repetirFinanciada: boolean) => void;
  canEdit: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);
  const [draft, setDraft] = useState<Day>(() => ({ ...current.d }));
  const [repeat, setRepeat] = useState(false);
  const [message, setMessage] = useState("");
  const selected = days[selectedIndex] ?? current;
  const selectedDay = selected.d;
  useEffect(() => { setSelectedIndex(currentIndex); }, [currentIndex, assetKey]);
  useEffect(() => { setDraft({ ...selectedDay }); setRepeat(false); setMessage(""); }, [selectedIndex, assetKey, selectedDay.mnq, selectedDay.lotes, selectedDay.meta, selectedDay.mll, selectedDay.stopPlanejadoTopstep, selectedDay.vestExposicaoUsd]);
  const mudar = (key: keyof Day, raw: string) => {
    const value = Number(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(value) || value < 0) return;
    setDraft(prev => ({ ...prev, [key]: value }));
    setMessage("");
  };
  const financiadaD2 = assetKey !== "saque2" && selectedIndex === avaliacaoDias + 1;
  const editable = canEdit && selectedIndex >= currentIndex;
  const { d, c } = current;
  const dayNumber = currentIndex < avaliacaoDias ? currentIndex + 1 : currentIndex - avaliacaoDias + 1;
  const fase = currentIndex < avaliacaoDias ? "AVALIAÇÃO" : "FINANCIADA";
  const plannedNet = metaLiquidaDia(asset, d);
  const informed = asset.attempt.resultadosMesaEod?.[String(currentIndex)];
  // Resultado informado é o único dado de desempenho disponível no estado: não simular PnL em tempo real.
  const progress = d.meta > 0 && typeof informed === "number" ? Math.max(0, Math.min(100, informed / d.meta * 100)) : 0;
  const limit = c.limiteDoCard ?? asset.params.mll;
  const isVest = mesa === "vest";
  const titleAsset = assetKey === "nasdaq" ? "Nasdaq · MNQ" : assetKey === "ouro" ? (isVest ? "Gold · GC-PERP" : "Gold · MGC") : "Saque 2";
  const canSettle = !isVest || (!!d.vestExposicaoUsd && !!asset.params.vestPrecoIndice);
  const next = days.slice(currentIndex + 1, currentIndex + 4);
  // A curva reflete somente as metas cadastradas, nunca lucros já realizados.
  const chartDays = days.slice(currentIndex, currentIndex + 4);
  const maxMeta = Math.max(1, ...chartDays.map(row => Math.max(0, row.d.meta)));
  const chartPoints = chartDays.map((row, i) => ({ x: 18 + i * (284 / Math.max(1, chartDays.length - 1)), y: 116 - (Math.max(0, row.d.meta) / maxMeta) * 91, label: `D${row.i < avaliacaoDias ? row.i + 1 : row.i - avaliacaoDias + 1}` }));
  const amount = (n: number) => `US$ ${fmt(n)}`;

  return (
    <div className="mb-5 space-y-4" aria-label="Cockpit de operações">
      <section className="rounded-xl border border-cyan-500/60 bg-[linear-gradient(135deg,#0b243d,#061321)] p-3 sm:p-4" aria-label="Card matriz de parâmetros">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Card matriz · planejamento</p><h2 className="text-base font-bold text-white">D{selectedIndex < avaliacaoDias ? selectedIndex + 1 : selectedIndex - avaliacaoDias + 1} {assetKey === "saque2" || selectedIndex >= avaliacaoDias ? "Financiada" : "Avaliação"}</h2><p className="text-[11px] text-slate-400">{selectedIndex === currentIndex ? "Dia operacional atual" : selectedIndex < currentIndex ? "Dia já concluído · somente leitura" : "Dia futuro · simulação de parâmetros"}</p></div>
          <div className="flex items-center gap-2"><button type="button" aria-label="Dia anterior" disabled={selectedIndex <= 0} onClick={() => setSelectedIndex(i => Math.max(0, i - 1))} className="rounded-lg border border-cyan-700 p-2 text-cyan-200 disabled:opacity-30"><ChevronLeft className="size-5" /></button><span className="font-mono text-xs text-slate-300">{selectedIndex + 1} / {days.length}</span><button type="button" aria-label="Próximo dia" disabled={selectedIndex >= days.length - 1} onClick={() => setSelectedIndex(i => Math.min(days.length - 1, i + 1))} className="rounded-lg border border-cyan-700 p-2 text-cyan-200 disabled:opacity-30"><ChevronRight className="size-5" /></button></div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([{ key: "mnq", label: mesa === "vest" ? "Unidades" : "Contratos" }, { key: "lotes", label: "Lotes CFD" }, { key: "meta", label: "Meta bruta ($)" }, { key: mesa === "topstep" ? "stopPlanejadoTopstep" : "mll", label: "Loss limit ($)" }] as { key: keyof Day; label: string }[]).map(({key,label}) => <label key={key} className="min-w-0 rounded-lg border border-[#214766] bg-[#091a2d] p-2"><span className="block text-[11px] font-semibold text-slate-300">{label}</span><input aria-label={label} type="number" min="0" step="any" disabled={!editable} value={draft[key] ?? (key === "mll" || key === "stopPlanejadoTopstep" ? selected.c.limiteDoCard ?? asset.params.mll : 0)} onChange={e => mudar(key, e.target.value)} className="mt-1 w-full min-w-0 rounded-md border border-[#244a68] bg-[#071321] px-2 py-1.5 font-mono text-base font-bold text-cyan-200 outline-none focus:border-cyan-400 disabled:opacity-50" /></label>)}
        </div>
        {mesa === "vest" && <label className="mt-2 block text-xs text-slate-300">Exposição Vest (US$)<input type="number" min="0" step="any" disabled={!editable} value={draft.vestExposicaoUsd ?? 0} onChange={e => mudar("vestExposicaoUsd", e.target.value)} className="mt-1 w-full rounded-lg border border-[#244a68] bg-[#071321] px-3 py-2 text-white" /></label>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {financiadaD2 && editable && <label className="flex items-center gap-2 text-xs font-semibold text-amber-200"><input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} className="size-4 accent-cyan-400" />Aplicar também a todos os dias financiados seguintes</label>}
          <button type="button" disabled={!editable} onClick={() => { onApply(selectedIndex, draft, repeat && financiadaD2); setMessage(repeat && financiadaD2 ? "Parâmetros enviados ao D2 e aos dias financiados seguintes." : "Parâmetros enviados ao card selecionado."); }} className="ml-auto rounded-lg bg-cyan-400 px-5 py-2 text-sm font-bold text-[#062031] hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">OK · Aplicar parâmetros</button>
        </div>
        {message && <p role="status" className="mt-2 text-xs text-emerald-300">{message}</p>}
        <p className="mt-2 text-[11px] text-slate-400">A seta navega pelo planejamento; não avança o ciclo nem registra aprovação ou reprovação. Os cards reais abaixo são atualizados somente ao clicar em OK.</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Meta do dia", value: amount(d.meta), icon: Target, color: "text-cyan-300" },
          { label: isVest ? "Limite de perda" : "Limite EOD", value: amount(limit), icon: ShieldCheck, color: "text-amber-300" },
          { label: isVest ? "Exposição Vest" : "Contratos", value: isVest ? amount(d.vestExposicaoUsd ?? 0) : `${fmt(d.mnq)} ${assetKey === "nasdaq" ? "MNQ" : "MGC"}`, icon: ChartNoAxesCombined, color: "text-amber-300" },
        ].map(({ label, value, icon: Icon, color }) => <div key={label} className="rounded-xl border border-[#214766] bg-[linear-gradient(145deg,#0c2138,#071526)] px-4 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.17)]">
          <div className="flex items-center gap-4"><Icon className={`size-8 shrink-0 ${color}`} /><div className="min-w-0"><p className="text-sm font-medium text-blue-100">{label}</p><p className="truncate font-mono text-xl font-bold tracking-tight text-cyan-300 sm:text-2xl">{value}</p></div></div>
        </div>)}
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <section className="rounded-xl border border-cyan-500/70 bg-[linear-gradient(145deg,#091d33,#061321)] p-4 shadow-[inset_3px_0_0_#06b6d4,0_16px_30px_rgba(0,0,0,0.2)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3"><TrendingUp className="size-7 text-cyan-400" /><div><h2 className="text-xl font-extrabold text-white">D{dayNumber} · {fase}</h2><p className="text-xs text-slate-400">Avaliação de desempenho e cobertura do dia</p></div></div><span className="rounded-full border border-cyan-600/70 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-cyan-200">{titleAsset}</span></div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Meta bruta" value={amount(d.meta)} icon={Target} />
            <Metric label={informed === undefined ? "Líquido previsto" : "Resultado informado"} value={amount(informed ?? plannedNet)} icon={ChartNoAxesCombined} color="text-emerald-400" />
            <Metric label={isVest ? "Exposição (US$)" : "Contratos"} value={isVest ? amount(d.vestExposicaoUsd ?? 0) : fmt(d.mnq)} icon={Layers} />
            <Metric label="Lotes CFD" value={fmt(d.lotes)} icon={Coins} />
          </div>
          <div className="mt-5"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-100">Progresso da meta</span><strong className="font-mono text-lg text-white">{fmt(progress)}%</strong></div><div role="progressbar" aria-label="Progresso baseado no resultado informado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-3 overflow-hidden rounded-full bg-[#18334d]"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate-400">{informed === undefined ? "Sem resultado realizado informado para este dia · progresso começa em 0%." : `${amount(informed)} informado / ${amount(d.meta)} de meta.`}</p></div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#21415b] pt-4 text-xs"><span className="inline-flex items-center gap-1 text-emerald-300"><span className="size-2 rounded-full bg-emerald-400" />Ciclo ativo</span><span className="inline-flex items-center gap-1 text-slate-300"><CalendarDays className="size-4" />Dia {dayNumber}</span><span className="inline-flex items-center gap-1 text-slate-300"><ShieldCheck className="size-4" />Cobertura: {current.status === "ok" ? "Coberta" : current.status === "alerta" ? "Atenção" : "Risco"}</span><div className="flex w-full gap-2 sm:ml-auto sm:w-auto"><button disabled={!canSettle} type="button" onClick={() => onSettle("profit")} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-cyan-500 bg-cyan-950/50 px-3 py-2 font-semibold text-cyan-300 disabled:opacity-40 sm:flex-none"><Check className="size-4" />Aprovar</button><button disabled={!canSettle} type="button" onClick={() => onSettle("stop")} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-amber-600 bg-amber-950/30 px-3 py-2 font-semibold text-amber-200 disabled:opacity-40 sm:flex-none"><X className="size-4" />Reprovar</button></div></div>
          <p className="mt-2 text-[11px] text-slate-500">Os botões abrem a confirmação no card operacional, onde você informa o resultado real do CFD.</p>
        </section>

        <section className="rounded-xl border border-[#214766] bg-[linear-gradient(145deg,#0b2035,#061321)] p-4 sm:p-5"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-100"><TrendingUp className="size-6 text-cyan-400" />Projeção de cobertura</h2><p className="mb-4 text-xs text-slate-400">Estimativas do plano atual; não são ganhos realizados.</p><div className="grid grid-cols-2 gap-2"><Metric label="Aporte recomendado" value={amount(current.caixaDia?.deposito ?? 0)} icon={Wallet} color="text-cyan-300" /><Metric label="Líquido se reprovar" value={canSettle ? amount(c.liquidoSeReprovar) : "—"} icon={CircleDollarSign} color={c.liquidoSeReprovar >= 0 ? "text-emerald-400" : "text-rose-400"} /></div>{!canSettle && <p className="mt-2 text-[11px] text-amber-300">Informe a exposição e a cotação de referência para calcular o hedge.</p>}<p className="mt-4 text-xs font-medium text-slate-300">Metas planejadas dos próximos dias</p><svg aria-label="Gráfico das metas planejadas" role="img" viewBox="0 0 320 150" className="mt-2 h-40 w-full"><path d="M18 25H302 M18 70H302 M18 116H302" stroke="#1b3c57" strokeWidth="1" strokeDasharray="3 5" /><polyline fill="none" stroke="#20e0ed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={chartPoints.map(p => `${p.x},${p.y}`).join(" ")} />{chartPoints.map(p => <g key={p.x}><circle cx={p.x} cy={p.y} r="4" fill="#8df9ff" /><text x={p.x} y="142" textAnchor="middle" fill="#9dbcd1" fontSize="11">{p.label}</text></g>)}</svg></section>
      </div>

      <section className="rounded-xl border border-[#214766] bg-[linear-gradient(145deg,#0b2035,#061321)] p-4 sm:p-5"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-100"><CalendarDays className="size-6 text-cyan-400" />Próximos dias</h2><p className="mb-3 text-xs text-slate-400">Planejamento e metas dos próximos dias do ciclo</p><div className="overflow-x-auto"><table className="w-full min-w-[590px] text-left text-sm"><thead className="bg-[#142b43] text-xs text-slate-300"><tr><th className="rounded-l-lg p-2">Dia</th><th className="p-2">Tipo</th><th className="p-2">Meta do dia</th><th className="p-2">Limite</th><th className="p-2">{isVest ? "Exposição" : "Contratos"}</th><th className="rounded-r-lg p-2">Status</th></tr></thead><tbody>{next.map(row => <tr key={row.i} className="border-b border-[#19334e] text-slate-200"><td className="p-2 font-bold text-cyan-300">D{row.i < avaliacaoDias ? row.i + 1 : row.i - avaliacaoDias + 1}</td><td className="p-2">{row.i < avaliacaoDias ? "Avaliação" : "Financiada"}</td><td className="p-2">{amount(row.d.meta)}</td><td className="p-2">{amount(row.c.limiteDoCard ?? asset.params.mll)}</td><td className="p-2">{isVest ? amount(row.d.vestExposicaoUsd ?? 0) : fmt(row.d.mnq)}</td><td className="p-2"><span className="inline-flex items-center gap-1 text-sky-300"><Clock3 className="size-4" />Programado</span></td></tr>)}</tbody></table>{!next.length && <p className="p-3 text-xs text-slate-400">Nenhum próximo dia cadastrado.</p>}</div></section>
    </div>
  );
}

function Metric({ label, value, icon: Icon, color = "text-slate-100" }: { label: string; value: string; icon: typeof Target; color?: string }) {
  return <div className="min-w-0 rounded-xl border border-[#21415e] bg-[#0b1b2d] p-3"><p className="flex items-center gap-2 text-[11px] text-slate-300"><Icon className="size-4 shrink-0 text-sky-300" />{label}</p><p className={`mt-2 break-words font-mono text-lg font-bold ${color}`}>{value}</p></div>;
}
