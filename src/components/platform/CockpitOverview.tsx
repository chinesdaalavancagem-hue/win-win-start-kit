import { exposicaoVestUsd, useEffect, useState } from "react";
import { CalendarDays, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Coins, Layers, ShieldCheck, Target, TrendingUp, Wallet, X } from "lucide-react";
import { computeAssetCalcs, fmt, metaLiquidaDia, type Asset, type AssetKey, type Day, type DayCalc, type MesaFuturos } from "@/lib/platform/engine";

type DayOverview = {
  i: number;
  d: Asset["days"][number];
  c: DayCalc;
  status: "ok" | "alerta" | "risco";
  caixaDia?: { deposito: number } | undefined;
};

export function CockpitOverview({ asset, assetKey, mesa, avaliacaoDias, currentIndex, current, days, selectedIndex, onSelectDay, onSettle, onApply, canEdit, onBrokerChange, onSpreadChange, onAdjustAll }: {
  asset: Asset;
  assetKey: AssetKey;
  mesa: MesaFuturos;
  avaliacaoDias: number;
  currentIndex: number;
  current: DayOverview;
  days: DayOverview[];
  selectedIndex: number;
  onSelectDay: (indice: number) => void;
  onSettle: (mode: "profit" | "stop") => void;
  onApply: (indice: number, plano: Day, repetirFinanciada: boolean) => void;
  canEdit: boolean;
  onBrokerChange: (broker: "manual" | "hfm" | "fot" | "outra") => void;
  onSpreadChange: (pontos: number) => void;
  onAdjustAll: (alvo: number) => string | null;
}) {
  const [draft, setDraft] = useState<Day>(() => ({ ...current.d }));
  const [repeat, setRepeat] = useState(false);
  const [message, setMessage] = useState("");
  const [alvoDraft, setAlvoDraft] = useState(String(asset.params.lucroDesejado));
  useEffect(() => { setAlvoDraft(String(asset.params.lucroDesejado)); }, [asset.params.lucroDesejado, assetKey]);
  const selected = days[selectedIndex] ?? current;
  const selectedDay = selected.d;
  useEffect(() => { setDraft({ ...selectedDay }); setRepeat(false); }, [selectedIndex, assetKey, selectedDay.mnq, selectedDay.lotes, selectedDay.meta, selectedDay.mll, selectedDay.stopPlanejadoTopstep, selectedDay.vestExposicaoUsd, selectedDay.vestVariacaoFavoravelPontos, selectedDay.vestVariacaoContrariaPontos]);
  useEffect(() => { setMessage(""); }, [selectedIndex, assetKey]);
  const mudar = (key: keyof Day, raw: string) => {
    const value = Number(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(value) || value < 0) return;
    setDraft(prev => ({ ...prev, [key]: value }));
    setMessage("");
  };
  const financiadaD2 = assetKey !== "saque2" && selectedIndex === avaliacaoDias + 1;
  const editable = canEdit && selectedIndex >= currentIndex;
  const d = draft;
  const c = computeAssetCalcs({ ...asset, days: asset.days.map((day, i) => i === selectedIndex ? draft : day) }, assetKey)[selectedIndex] ?? selected.c;
  const dayNumber = selectedIndex < avaliacaoDias ? selectedIndex + 1 : selectedIndex - avaliacaoDias + 1;
  const fase = selectedIndex < avaliacaoDias ? "AVALIAÇÃO" : "FINANCIADA";
  const plannedNet = metaLiquidaDia(asset, d);
  const informed = asset.attempt.resultadosMesaEod?.[String(selectedIndex)];
  // Resultado informado é o único dado de desempenho disponível no estado: não simular PnL em tempo real.
  const progress = d.meta > 0 && typeof informed === "number" ? Math.max(0, Math.min(100, informed / d.meta * 100)) : 0;
  const limit = c.limiteDoCard ?? asset.params.mll;
  const isVest = mesa === "vest";
  const titleAsset = assetKey === "nasdaq" ? "Nasdaq · MNQ" : assetKey === "ouro" ? (isVest ? "Gold · GC-PERP" : "Gold · MGC") : "Saque 2";
  const canSettle = selectedIndex === currentIndex && (!isVest || (exposicaoVestUsd(asset, d) > 0 && !!asset.params.vestPrecoIndice));
  const next = days.slice(selectedIndex + 1, selectedIndex + 4);
  // A curva reflete somente as metas cadastradas, nunca lucros já realizados.
  const chartDays = days.slice(selectedIndex, selectedIndex + 4);
  const maxMeta = Math.max(1, ...chartDays.map(row => Math.max(0, row.d.meta)));
  const chartPoints = chartDays.map((row, i) => ({ x: 18 + i * (284 / Math.max(1, chartDays.length - 1)), y: 116 - (Math.max(0, row.d.meta) / maxMeta) * 91, label: `D${row.i < avaliacaoDias ? row.i + 1 : row.i - avaliacaoDias + 1}` }));
  const amount = (n: number) => `US$ ${fmt(n)}`;

  return (
    <div className="mb-5 space-y-4" aria-label="Cockpit de operações">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Meta do dia", value: amount(d.meta), icon: Target, color: "text-cyan-300" },
          { label: isVest ? "Limite de perda" : "Limite EOD", value: amount(limit), icon: ShieldCheck, color: "text-amber-300" },
          { label: isVest ? "Exposição Vest" : "Contratos", value: isVest ? amount(exposicaoVestUsd(asset, d)) : `${fmt(d.mnq)} ${assetKey === "nasdaq" ? "MNQ" : "MGC"}`, icon: ChartNoAxesCombined, color: "text-amber-300" },
        ].map(({ label, value, icon: Icon, color }) => <div key={label} className="rounded-xl border border-[#214766] bg-[linear-gradient(145deg,#0c2138,#071526)] px-4 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.17)]">
          <div className="flex items-center gap-4"><Icon className={`size-8 shrink-0 ${color}`} /><div className="min-w-0"><p className="text-sm font-medium text-blue-100">{label}</p><p className="truncate font-mono text-xl font-bold tracking-tight text-cyan-300 sm:text-2xl">{value}</p></div></div>
        </div>)}
      </div>

      <section className="rounded-xl border border-cyan-600/45 bg-[#091a2c] p-3 sm:p-4" aria-label="Ajuste automático do hedge por spread">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="text-sm font-bold text-cyan-100">Ajustar todos os lotes CFD</h3><p className="mt-1 text-xs text-slate-400">Configure a corretora e o spread efetivo; calcule os lotes para atingir o lucro por reprovação, incluindo a taxa da mesa e os custos anteriores.</p></div>
          <span className="rounded-lg border border-amber-700/40 px-2 py-1 text-[10px] text-amber-200">Simulação · não executa ordens</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
          <label className="text-xs text-slate-300">Corretora CFD
            <select aria-label="Corretora CFD" disabled={!canEdit} value={asset.params.corretoraCfd ?? "manual"} onChange={e => onBrokerChange(e.target.value as "manual" | "hfm" | "fot" | "outra")} className="mt-1.5 block w-full rounded-lg border border-[#214766] bg-[#061321] px-3 py-2.5 text-sm text-slate-100 disabled:opacity-50">
              <option value="manual">Personalizada</option><option value="hfm">HFM</option><option value="fot">FOT Markets</option><option value="outra">Outra corretora</option>
            </select>
          </label>
          <label className="text-xs text-slate-300">Spread efetivo (pontos do ativo)
            <input key={`${assetKey}-${asset.params.spreadPontosCfd ?? 0}`} aria-label="Spread efetivo em pontos do ativo" disabled={!canEdit} type="number" min="0" step="0.01" defaultValue={asset.params.spreadPontosCfd ?? 0} onBlur={e => { const valor = Number(e.currentTarget.value); if (Number.isFinite(valor) && valor >= 0) onSpreadChange(valor); else e.currentTarget.value = String(asset.params.spreadPontosCfd ?? 0); }} className="mt-1.5 block w-full rounded-lg border border-[#214766] bg-[#061321] px-3 py-2.5 font-mono text-sm text-slate-100 disabled:opacity-50"/>
          </label>
          <label className="text-xs text-slate-300">Lucro por reprovação (US$)
            <input aria-label="Lucro desejado por reprovação" disabled={!canEdit} type="text" inputMode="decimal" value={alvoDraft} onChange={e => setAlvoDraft(e.target.value)} className="mt-1.5 block w-full rounded-lg border border-[#214766] bg-[#061321] px-3 py-2.5 font-mono text-sm text-slate-100 disabled:opacity-50" />
          </label>
          <button type="button" disabled={!canEdit} onClick={() => { const valor = Number(alvoDraft.trim().replace(",", ".")); if (!alvoDraft.trim() || !Number.isFinite(valor) || valor < 0) { setMessage("Informe um lucro válido antes de ajustar."); return; } const erro = onAdjustAll(valor); setMessage(erro ?? "Lotes dos dias futuros recalculados; confira margem e projeções antes de operar."); }} className="rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-400 px-4 py-2.5 text-sm font-extrabold text-[#061625] hover:brightness-110 disabled:opacity-40">Ajustar todos os lotes</button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Informe o spread total estimado de entrada e saída na mesma unidade dos pontos usados para o CFD. A seleção da corretora é apenas identificação, sem cotação automática. O ajuste preserva os dias concluídos, arredonda o lote para cima em 0,01 e não garante execução ou PnL exatos. Confirme especificação do símbolo, volume mínimo, step e margem na corretora.</p>
        {message && <p role="status" className="mt-2 text-xs font-semibold text-cyan-300">{message}</p>}
      </section>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <section className="rounded-xl border border-cyan-500/70 bg-[linear-gradient(145deg,#091d33,#061321)] p-4 shadow-[inset_3px_0_0_#06b6d4,0_16px_30px_rgba(0,0,0,0.2)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3"><TrendingUp className="size-7 text-cyan-400" /><div><h2 className="text-xl font-extrabold text-white">D{dayNumber} · {fase}</h2><p className="text-xs text-slate-400">{selectedIndex === currentIndex ? "Dia operacional atual" : selectedIndex < currentIndex ? "Dia concluído · somente leitura" : "Planejamento de dia futuro"} · Card matriz</p></div></div>
            <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-cyan-600/70 bg-cyan-950/40 px-3 py-1 text-xs font-semibold text-cyan-200">{titleAsset}</span><button type="button" aria-label="Dia anterior" disabled={selectedIndex <= 0} onClick={() => onSelectDay(Math.max(0, selectedIndex - 1))} className="rounded-lg border border-cyan-700 p-1.5 text-cyan-200 disabled:opacity-30"><ChevronLeft className="size-5" /></button><span className="font-mono text-xs text-slate-300">{selectedIndex + 1}/{days.length}</span><button type="button" aria-label="Próximo dia" disabled={selectedIndex >= days.length - 1} onClick={() => onSelectDay(Math.min(days.length - 1, selectedIndex + 1))} className="rounded-lg border border-cyan-700 p-1.5 text-cyan-200 disabled:opacity-30"><ChevronRight className="size-5" /></button></div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MatrixInput label="Meta bruta" value={draft.meta} disabled={!editable} onChange={value => mudar("meta", value)} icon={Target} />
            <Metric label={informed === undefined ? "Líquido previsto" : "Resultado informado"} value={amount(informed ?? plannedNet)} icon={ChartNoAxesCombined} color="text-emerald-400" />
            {isVest ? <div className="grid grid-cols-2 gap-2"><MatrixInput label="Variação favorável (pontos)" value={draft.vestVariacaoFavoravelPontos ?? 0} disabled={!editable} onChange={value => mudar("vestVariacaoFavoravelPontos", value)} icon={Layers} /><MatrixInput label="Variação contrária (pontos)" value={draft.vestVariacaoContrariaPontos ?? 0} disabled={!editable} onChange={value => mudar("vestVariacaoContrariaPontos", value)} icon={Layers} /></div> : <MatrixInput label="Contratos" value={draft.mnq} disabled={!editable} onChange={value => mudar("mnq", value)} icon={Layers} />}
            <MatrixInput label="Lotes CFD" value={draft.lotes} disabled={!editable} onChange={value => mudar("lotes", value)} icon={Coins} />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="w-full max-w-[190px]"><MatrixInput label="Loss limit ($)" value={draft[mesa === "topstep" ? "stopPlanejadoTopstep" : "mll"] ?? selected.c.limiteDoCard ?? asset.params.mll} disabled={!editable} onChange={value => mudar(mesa === "topstep" ? "stopPlanejadoTopstep" : "mll", value)} icon={ShieldCheck} /></div>
            {financiadaD2 && editable && <label className="flex max-w-[260px] items-center gap-2 text-xs font-semibold text-amber-200"><input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} className="size-4 accent-cyan-400" />Repetir parâmetros no D3, D4, D5 e demais dias financiados</label>}
            <button type="button" disabled={!editable} onClick={() => { onApply(selectedIndex, draft, repeat && financiadaD2); setMessage(repeat && financiadaD2 ? "Parâmetros enviados para D2 e demais dias financiados." : "Parâmetros enviados ao card selecionado."); }} className="ml-auto rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-[#062031] hover:bg-cyan-300 disabled:opacity-40">OK · Enviar parâmetros</button>
          </div>
          {message && <p role="status" className="mt-2 text-xs text-emerald-300">{message}</p>}
          <div className="mt-5"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-100">Progresso da meta</span><strong className="font-mono text-lg text-white">{fmt(progress)}%</strong></div><div role="progressbar" aria-label="Progresso baseado no resultado informado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-3 overflow-hidden rounded-full bg-[#18334d]"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate-400">{informed === undefined ? "Sem resultado realizado informado para este dia · progresso começa em 0%." : `${amount(informed)} informado / ${amount(d.meta)} de meta.`}</p></div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#21415b] pt-4 text-xs"><span className="inline-flex items-center gap-1 text-emerald-300"><span className="size-2 rounded-full bg-emerald-400" />{selectedIndex === currentIndex ? "Ciclo ativo" : "Planejamento"}</span><span className="inline-flex items-center gap-1 text-slate-300"><CalendarDays className="size-4" />Dia {dayNumber}</span><span className="inline-flex items-center gap-1 text-slate-300"><ShieldCheck className="size-4" />Cobertura: {selected.status === "ok" ? "Coberta" : selected.status === "alerta" ? "Atenção" : "Risco"}</span><div className="flex w-full gap-2 sm:ml-auto sm:w-auto"><button disabled={!canSettle} type="button" onClick={() => onSettle("profit")} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-cyan-500 bg-cyan-950/50 px-3 py-2 font-semibold text-cyan-300 disabled:opacity-40 sm:flex-none"><Check className="size-4" />Aprovar</button><button disabled={!canSettle} type="button" onClick={() => onSettle("stop")} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-amber-600 bg-amber-950/30 px-3 py-2 font-semibold text-amber-200 disabled:opacity-40 sm:flex-none"><X className="size-4" />Reprovar</button></div></div>
          <p className="mt-2 text-[11px] text-slate-500">Use OK para salvar os parâmetros do dia selecionado. Aprovar/Reprovar só ficam ativos no dia operacional atual e abrem confirmação no card abaixo.</p>
        </section>

        <section className="rounded-xl border border-[#214766] bg-[linear-gradient(145deg,#0b2035,#061321)] p-4 sm:p-5"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-100"><TrendingUp className="size-6 text-cyan-400" />Projeção de cobertura</h2><p className="mb-4 text-xs text-slate-400">Estimativas para o dia selecionado; não são ganhos realizados.</p><div className="grid grid-cols-2 gap-2"><Metric label="Aporte recomendado" value={amount(selected.caixaDia?.deposito ?? 0)} icon={Wallet} color="text-cyan-300" /><Metric label="Líquido se reprovar" value={isVest && !asset.params.vestPrecoIndice ? "—" : amount(c.liquidoSeReprovar)} icon={CircleDollarSign} color={c.liquidoSeReprovar >= 0 ? "text-emerald-400" : "text-rose-400"} /><div className="col-span-2"><Metric label="Perda estimada no Forex se passar" value={isVest && !asset.params.vestPrecoIndice ? "—" : amount(c.custoSePassar)} icon={Wallet} color="text-rose-400" /></div></div><p className="mt-2 text-[11px] text-slate-400">Aporte: projeção do plano salvo. Ganho/perda no Forex: estimativas com os parâmetros exibidos; confirme com OK para atualizar os cálculos completos.</p><p className="mt-4 text-xs font-medium text-slate-300">Metas planejadas dos próximos dias</p><svg aria-label="Gráfico das metas planejadas" role="img" viewBox="0 0 320 150" className="mt-2 h-40 w-full"><path d="M18 25H302 M18 70H302 M18 116H302" stroke="#1b3c57" strokeWidth="1" strokeDasharray="3 5" /><polyline fill="none" stroke="#20e0ed" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={chartPoints.map(p => `${p.x},${p.y}`).join(" ")} />{chartPoints.map(p => <g key={p.x}><circle cx={p.x} cy={p.y} r="4" fill="#8df9ff" /><text x={p.x} y="142" textAnchor="middle" fill="#9dbcd1" fontSize="11">{p.label}</text></g>)}</svg></section>
      </div>

      <section className="rounded-xl border border-[#214766] bg-[linear-gradient(145deg,#0b2035,#061321)] p-4 sm:p-5"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-100"><CalendarDays className="size-6 text-cyan-400" />Próximos dias</h2><p className="mb-3 text-xs text-slate-400">Planejamento e metas dos próximos dias do ciclo</p><div className="overflow-x-auto"><table className="w-full min-w-[590px] text-left text-sm"><thead className="bg-[#142b43] text-xs text-slate-300"><tr><th className="rounded-l-lg p-2">Dia</th><th className="p-2">Tipo</th><th className="p-2">Meta do dia</th><th className="p-2">Limite</th><th className="p-2">{isVest ? "Exposição" : "Contratos"}</th><th className="rounded-r-lg p-2">Status</th></tr></thead><tbody>{next.map(row => <tr key={row.i} className="border-b border-[#19334e] text-slate-200"><td className="p-2 font-bold text-cyan-300">D{row.i < avaliacaoDias ? row.i + 1 : row.i - avaliacaoDias + 1}</td><td className="p-2">{row.i < avaliacaoDias ? "Avaliação" : "Financiada"}</td><td className="p-2">{amount(row.d.meta)}</td><td className="p-2">{amount(row.c.limiteDoCard ?? asset.params.mll)}</td><td className="p-2">{isVest ? amount(exposicaoVestUsd(asset, row.d)) : fmt(row.d.mnq)}</td><td className="p-2"><span className="inline-flex items-center gap-1 text-sky-300"><Clock3 className="size-4" />Programado</span></td></tr>)}</tbody></table>{!next.length && <p className="p-3 text-xs text-slate-400">Nenhum próximo dia cadastrado.</p>}</div></section>
    </div>
  );
}

function Metric({ label, value, icon: Icon, color = "text-slate-100" }: { label: string; value: string; icon: typeof Target; color?: string }) {
  return <div className="min-w-0 rounded-xl border border-[#21415e] bg-[#0b1b2d] p-3"><p className="flex items-center gap-2 text-[11px] text-slate-300"><Icon className="size-4 shrink-0 text-sky-300" />{label}</p><p className={`mt-2 break-words font-mono text-lg font-bold ${color}`}>{value}</p></div>;
}

function MatrixInput({ label, value, disabled, onChange, icon: Icon }: { label: string; value: number; disabled: boolean; onChange: (raw: string) => void; icon: typeof Target }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return <label className="min-w-0 rounded-xl border border-[#21415e] bg-[#0b1b2d] p-3"><span className="flex items-center gap-2 text-[11px] text-slate-300"><Icon className="size-4 shrink-0 text-sky-300" />{label}</span><input type="text" inputMode="decimal" aria-label={label} value={text} disabled={disabled} onChange={e => { const raw = e.target.value; setText(raw); if (raw.trim()) onChange(raw); }} onBlur={() => setText(String(value))} className="mt-1.5 w-full min-w-0 rounded-md border border-transparent bg-[#081827] px-1 py-1 font-mono text-lg font-bold text-cyan-300 outline-none focus:border-cyan-400 disabled:opacity-65" /></label>;
}
