import type { Banca } from "@/lib/platform/bancas";
import { calcularCoberturaSimultanea } from "@/lib/platform/caixa-consolidado";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Undo2, FileText, Layers, Target, TrendingUp, ShieldCheck, Wallet, ChevronRight, Crosshair, Calculator, Check, ChartNoAxesCombined, Landmark, History, Menu, X, SlidersHorizontal, Gift, CircleDollarSign, ChartPie, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { registrarAuditoria } from "@/lib/auditoria-registro";
import { applyOfficialParams, buildOfficialParams, isOfficialParams } from "@/lib/platform/official-params";
import {
  type AssetKey, type State, type TabKey, type Asset, type MesaFuturos, MESAS_FUTUROS, diasAvaliacaoGold, lossLimitGoldProjetado, lossLimitGoldEfetivo, adicionarDiaGold, removerDiaGold,
  aplicarDeposito, aplicarSaque, projetarAportesFuturos, conciliarCreditoForex, calcAporteFracionado, calcCaixaCiclo, clampDayIndex, computeAssetCalcs, defaultState, fmt, fmtSigned, handleProfit, handleStop,
  historicoTotals, isValidState, normalizeState, parseNum, parseValorFinanceiro, parseResultadoCfd, podeDesfazerUltimaOperacao, projetarZeragemBonus, resetBonus, tipoLabel, undoLast,
} from "@/lib/platform/engine";

type Section = "operacoes" | "parametros" | "bonus" | "aporte" | "caixa" | "meta";
type Sync = { mode: "ok" | "busy" | "err"; text: string };

const TABS: { key: TabKey; label: string; dot: string }[] = [
  { key: "nasdaq", label: "Nasdaq", dot: "bg-primary" },
  { key: "ouro", label: "Gold", dot: "bg-brand-gold" },
  { key: "saque2", label: "Saque 2", dot: "bg-brand-violet" },
  { key: "historico", label: "Histórico", dot: "bg-muted-foreground" },
];
const ASSET_NAME: Record<AssetKey, string> = { nasdaq: "NASDAQ", ouro: "GOLD", saque2: "SAQUE 2" };
const rotuloDia = (asset: Asset, key: AssetKey, indice: number) => { const avaliacao = key === "ouro" ? diasAvaliacaoGold(asset) : key === "saque2" ? 0 : 3; return `D${indice < avaliacao ? indice + 1 : indice - avaliacao + 1} ${indice < avaliacao ? "Avaliação" : "Financiada"}`; };

export function Platform({ load, save, isAdmin, officialAcceptedAt, allBancas, bancasGlobais, bancaAtivaId, podeDesfazerForex = true, mesaAtiva = "tradefive", onMesaChange = () => {} }: { load: () => Promise<string | null>; save: (v: string, acceptedAt?: string) => Promise<boolean>; isAdmin: boolean; officialAcceptedAt: string | null; allBancas?: Banca[]; bancasGlobais?: Banca[] | undefined; bancaAtivaId?: string | undefined; podeDesfazerForex?: boolean; mesaAtiva?: MesaFuturos; onMesaChange?: (mesa: MesaFuturos) => void }) {
  const [state, setState] = useState<State | null>(null);
  const [section, setSection] = useState<Section>("operacoes");
  const [leftMenuOpen, setLeftMenuOpen] = useState(false);
  const [activeTabLabel, setActiveTabLabel] = useState<TabKey | null>(null);
  const [mostrarMesas, setMostrarMesas] = useState(false);
  useEffect(() => {
    if (!activeTabLabel) return;
    const timer = window.setTimeout(() => setActiveTabLabel(null), 2000);
    return () => window.clearTimeout(timer);
  }, [activeTabLabel]);
  const [sync, setSync] = useState<Sync>({ mode: "busy", text: "carregando…" });
  const [syncTarget, setSyncTarget] = useState<HTMLElement | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [desktopRailTop, setDesktopRailTop] = useState(120);
  const [headerHeight, setHeaderHeight] = useState(112);
  useEffect(() => {
    const header = document.querySelector("header.sticky");
    if (!header) return;
    const measure = () => setHeaderHeight(Math.ceil(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const alignRails = () => {
      if (heroRef.current) setDesktopRailTop(Math.max(12, Math.round(heroRef.current.getBoundingClientRect().top + 24)));
    };
    alignRails();
    window.addEventListener("resize", alignRails);
    return () => { window.removeEventListener("resize", alignRails); };
  }, [state !== null]);
  useEffect(() => { setSyncTarget(document.getElementById("wow-header-sync")); }, []);
  const dirty = useRef(false);

  useEffect(() => {
    const recordButtonClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      const label = (button.getAttribute("aria-label") || button.innerText || button.textContent || "button")
        .replace(/\s+/g, " ").trim().slice(0, 100);
      void registrarAuditoria({
        category: "ui",
        action: "ui.button_clicked",
        outcome: "started",
        details: { page: "platform", button: label },
      });
    };
    document.addEventListener("click", recordButtonClick, true);
    return () => document.removeEventListener("click", recordButtonClick, true);
  }, []);

  useEffect(() => {
    let alive = true;
    load()
      .then(async (raw) => {
        let s = defaultState();
        if (raw) { try { const p = JSON.parse(raw); if (isValidState(p)) s = normalizeState(p); } catch { /* usa padrão */ } }

        // O estado persistido é a fonte de verdade. Os números padrão são usados
        // apenas quando ainda não existe um estado válido salvo para esta conta.

        if (alive) {
          setState(s);
          setSync({ mode: "ok", text: "sincronizado (nuvem)" });
        }
      })
      .catch(() => { if (alive) { setState(defaultState()); setSync({ mode: "err", text: "falha ao carregar" }); } });
    return () => { alive = false; };
  }, [load]);

  useEffect(() => {
    if (!state || !dirty.current) return;
    setSync({ mode: "busy", text: "salvando…" });
    const t = setTimeout(async () => {
      const ok = await save(JSON.stringify(state)).catch(() => false);
      setSync(ok ? { mode: "ok", text: "salvo (nuvem)" } : { mode: "err", text: "falha ao salvar" });
    }, 500);
    return () => clearTimeout(t);
  }, [state, save]);

  const mutate = useCallback((fn: (s: State) => void) => {
    dirty.current = true;
    setState((prev) => {
      if (!prev) return prev;
      const n: State = structuredClone(prev);
      fn(n);
      for (const k of ["nasdaq", "ouro", "saque2"] as AssetKey[]) {
        const b = n.assets[k].bonus;
        n.assets[k].params.saldoInicial = (b.deposito || 0) + (b.bonusAtual || 0);
        clampDayIndex(n.assets[k]);
      }
      return n;
    });
  }, []);

  if (!state) return <p className="m-auto text-muted-foreground">Carregando plataforma…</p>;
  const tab = state.activeTab;
  const lastOperation = state.log.at(-1);

  return (
    <div className="mx-auto w-full max-w-6xl px-12 py-3 sm:px-14 lg:py-3">
      {syncTarget && createPortal(
        <span role="status" className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-blue-100/75">
          <span className={cn("size-2 rounded-full", sync.mode === "ok" && "bg-emerald-400", sync.mode === "busy" && "bg-amber-400", sync.mode === "err" && "bg-rose-400")} />
          {sync.text}
        </span>, syncTarget)}
      <section ref={heroRef} className="relative mb-3 overflow-hidden rounded-2xl border border-cyan-700/60 bg-[radial-gradient(ellipse_at_90%_30%,rgba(0,190,255,0.14),transparent_45%),linear-gradient(135deg,#07152a_0%,#030b17_65%,#041321_100%)] p-4 shadow-[0_20px_55px_rgba(0,0,0,0.25)] sm:p-6">
        <div className="pointer-events-none absolute -right-12 top-8 h-40 w-64 rounded-full border border-cyan-400/10 blur-sm" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-xl items-start gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/25 bg-gradient-to-br from-blue-700/80 to-cyan-950 shadow-[0_0_28px_rgba(0,150,255,0.18)]">
              <TrendingUp className="size-7 text-cyan-300" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-slate-50 sm:text-3xl">Win or <span className="text-cyan-400">Win</span> Platform</h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-blue-100/75 sm:text-base">Digite manualmente os contratos, os lotes do broker CFD e a meta de cada dia.</p>
            </div>
          </div>

        </div>
      </section>


      <nav className="fixed right-1 top-1/2 z-40 flex -translate-y-1/2 flex-col lg:right-2 lg:translate-y-0 gap-2 rounded-2xl border border-cyan-900/70 bg-[#050d1b]/95 p-1 shadow-xl sm:p-1.5" aria-label="Ativos e histórico" style={{ top: typeof window !== "undefined" && window.innerWidth >= 1024 ? desktopRailTop : undefined }}>
        <button type="button" title="Escolher mesa de futuros" aria-label="Escolher mesa de futuros" aria-expanded={mostrarMesas} onClick={() => setMostrarMesas((v) => !v)} className={cn("relative flex size-10 items-center justify-center rounded-xl border transition-colors lg:size-14", mostrarMesas ? "border-amber-400/70 bg-amber-950/60 text-amber-200" : "border-transparent text-amber-300 hover:bg-amber-950/50")}><Building2 className="size-5" /></button>
        {TABS.map((t) => (
          <button key={t.key} type="button" title={t.label} aria-label={t.label} aria-pressed={tab === t.key} onClick={() => { setActiveTabLabel(null); mutate((s) => { s.activeTab = t.key; }); setActiveTabLabel(t.key); }}
            className={cn("relative flex size-10 items-center justify-center rounded-xl border transition-colors lg:size-14", tab === t.key ? "border-cyan-400/70 bg-blue-950 text-white" : "border-transparent text-slate-400 hover:bg-blue-950/60")}>
            {activeTabLabel === t.key && <span aria-hidden="true" className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-lg border border-cyan-800/80 bg-[#061322] px-3 py-1.5 text-xs font-semibold text-cyan-100 shadow-xl">{t.label}</span>}
            {t.key === "ouro" ? <svg aria-hidden="true" viewBox="0 0 32 28" className="size-5 shrink-0" fill="none"><path d="M2 17 8 8h12l6 9-6 9H8L2 17Z" fill="#E9A900" stroke="#FFDF69" strokeWidth="1.2"/><path d="m8 8 6 9-6 9-6-9Z" fill="#FFE075"/><path d="m14 17 6-9 6 9-6 9Z" fill="#FFC533"/></svg> : t.key === "nasdaq" ? <ChartNoAxesCombined className="size-5 text-sky-400" /> : t.key === "saque2" ? <Landmark className="size-5 text-violet-400" /> : <History className="size-5 text-slate-300" />}
          </button>
        ))}
      </nav>
      {mostrarMesas && (
        <aside className="fixed right-14 top-1/2 z-50 w-[min(20rem,calc(100vw-5rem))] -translate-y-1/2 rounded-xl border border-amber-500/40 bg-[#091525] p-4 shadow-2xl lg:right-20" aria-label="Escolher mesa de futuros">
          <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-bold text-amber-200">Mesa de futuros · Gold</h3><button type="button" aria-label="Fechar seleção de mesa" className="text-slate-300 hover:text-white" onClick={() => setMostrarMesas(false)}>✕</button></div>
          <label className="block text-xs text-slate-300">Mesa utilizada nesta banca</label>
          <select className="mt-2 w-full rounded-lg border border-amber-800/70 bg-[#06101f] p-3 text-sm text-white" value={mesaAtiva} onChange={(e) => onMesaChange(e.target.value as MesaFuturos)}>
            {Object.entries(MESAS_FUTUROS).map(([id, m]) => <option key={id} value={id}>{m.nome} · {m.consistencia === 0 ? "Sem consistência" : `${m.consistencia}%`}</option>)}
          </select>
          <p className="mt-3 text-xs leading-relaxed text-slate-300">{(() => { const m = MESAS_FUTUROS[mesaAtiva]; const avaliacao = diasAvaliacaoGold(state.assets.ouro); return `${avaliacao} dias de avaliação + ${state.assets.ouro.days.length - avaliacao} dias de conta financiada = ${state.assets.ouro.days.length} cards (padrão da mesa: ${m.avaliacao}+${m.payout}).`; })()}</p>
          <div className="mt-3 rounded-lg border border-amber-900/60 bg-black/20 p-3 text-xs text-slate-200">
            {(() => {
              const mesa = MESAS_FUTUROS[mesaAtiva];
              const dias = state.assets.ouro.days.slice(0, diasAvaliacaoGold(state.assets.ouro));
              const totalMetas = dias.reduce((v, dia) => v + Math.max(0, dia.meta), 0);
              const percentualMaiorDia = totalMetas > 0 ? Math.max(...dias.map((dia) => Math.max(0, dia.meta))) / totalMetas * 100 : 0;
              if (mesa.consistencia === 0) return <p>Sem regra de consistência. Saque: 7 dias úteis com lucro mínimo de US$ 50 por dia (condição separada da avaliação).</p>;
              return <><p>Consistência máxima: <strong className="text-amber-200">{mesa.consistencia}%</strong></p><p className="mt-1">Maior meta diária / soma das metas: <strong>{fmt(percentualMaiorDia)}%</strong></p><p className={cn("mt-1", percentualMaiorDia > mesa.consistencia ? "text-rose-300" : "text-emerald-300")}>{totalMetas <= 0 ? "Configure as metas da avaliação." : percentualMaiorDia > mesa.consistencia ? "Atenção: metas ultrapassam o limite de consistência." : "Metas compatíveis com o limite informado."}</p></>;
            })()}
          </div>
          <p className="mt-2 text-[11px] text-amber-200/80">Cada mesa mantém seus próprios lotes, metas e cards nesta banca. O percentual acima é projeção das metas, não valida ganhos efetivos nem outras regras da firma.</p>
        </aside>
      )}
      <div className="sticky z-20 mb-3 rounded-xl border border-cyan-950/80 bg-[#06101f]/95 p-2 shadow-lg backdrop-blur-md sm:p-3" style={{ top: headerHeight + 8 }}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-blue-100/70">
          <span className="size-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(255,190,40,0.4)]" />
          <span>{lastOperation ? `${ASSET_NAME[lastOperation.asset]} · ${rotuloDia(state.assets[lastOperation.asset], lastOperation.asset, Math.max(0, lastOperation.day - 1))} · ${tipoLabel(lastOperation.tipo, lastOperation.asset)}` : "Nenhuma operação registrada"}</span>
        </div>
        <Button type="button" variant="outline" className="w-full justify-start rounded-xl border-cyan-900/80 bg-[#071426] text-blue-100 hover:border-cyan-400 hover:bg-blue-950/60 sm:w-auto" disabled={!lastOperation || !podeDesfazerForex || !podeDesfazerUltimaOperacao(state)} title={!lastOperation ? "Nenhuma operação para desfazer" : !podeDesfazerForex || !podeDesfazerUltimaOperacao(state) ? "Saldo Forex alterado ou registro antigo: desfazer bloqueado para proteger os saldos" : "Desfazer a última operação"} onClick={() => mutate((s) => {
          const last = s.log.at(-1);
          if (!last || !podeDesfazerForex || !podeDesfazerUltimaOperacao(s)) return;
          undoLast(s);
          s.activeTab = last.asset;
        })}>
          <Undo2 aria-hidden="true" /> Desfazer última operação
        </Button>
      </div>

      {tab === "historico" ? <Historico state={state} mutate={mutate} bancas={allBancas} bancaAtivaId={bancaAtivaId} podeDesfazerForex={podeDesfazerForex} /> : (
        <AssetView key={tab} state={state} bancasGlobais={bancasGlobais} bancaAtivaId={bancaAtivaId} assetKey={tab} section={section} setSection={setSection} leftMenuOpen={leftMenuOpen} setLeftMenuOpen={setLeftMenuOpen} desktopRailTop={desktopRailTop} mutate={mutate} isAdmin={isAdmin} />
      )}

      <BackupMenu state={state} mutate={mutate} save={save} onApplied={setState} isAdmin={isAdmin} officialAcceptedAt={officialAcceptedAt} mesaAtiva={mesaAtiva} />
      <StrategyNotes />
    </div>
  );
}

/* ---------- pequenos componentes ---------- */

function NumField({ label, value, onChange, readOnly, helper, placeholder, cockpit }: { label: ReactNode; value: number; onChange?: (n: number) => void; readOnly?: boolean; helper?: ReactNode; placeholder?: string; cockpit?: boolean }) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  return (
    <label className="block min-w-0">
      <span className={cn("mb-1 block text-xs text-muted-foreground", cockpit && "flex items-center gap-1.5 text-blue-100/90")}>{label}</span>
      <input type="text" inputMode="decimal" value={text} readOnly={readOnly} placeholder={placeholder}
        enterKeyHint="done"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(String(value)); }}
        onChange={(e) => { setText(e.target.value); onChange?.(parseNum(e.target.value)); }}
        className={cockpit
          ? "w-full rounded-md border border-transparent bg-transparent px-0 py-0.5 font-mono text-2xl font-bold text-slate-50 outline-none transition-colors hover:border-[#19334f] focus:border-blue-500/70 focus:bg-[#081320] focus:px-1.5 sm:text-[28px]"
          : cn("w-full rounded-md border bg-input/40 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring", readOnly && "opacity-70")} />
      {helper && <span className="mt-1 block font-mono text-[11px] text-muted-foreground">{helper}</span>}
    </label>
  );
}

function ConfirmButton({ children, confirmText, onConfirm, className, variant = "outline", needsConfirm = true, disabled = false }: { children: ReactNode; confirmText: string; onConfirm: () => void; className?: string; variant?: "outline" | "default" | "destructive" | "ghost"; needsConfirm?: boolean; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <Button type="button" variant={variant} className={className} disabled={disabled}
      onClick={() => { if (!needsConfirm || armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmText : children}
    </Button>
  );
}

/** Registro real da saída no CFD: sugere o valor teórico e permite ajustar pelo spread/slippage. */
function Settle({ risco, custo, reprova, onProfit, onStop }: { risco: boolean; custo: number; reprova: number; onProfit: (real: number) => void; onStop: (real: number) => void }) {
  const [modo, setModo] = useState<null | "profit" | "stop">(null);
  const [valor, setValor] = useState("");
  const teorico = modo === "profit" ? -custo : reprova;
  const valorPreenchido = valor.trim() !== "";
  const valorConvertido = valorPreenchido ? parseResultadoCfd(valor) : teorico;
  const valorInvalido = valorConvertido === null;
  const real = valorConvertido ?? teorico;
  const spread = valorInvalido ? null : real - teorico;
  const abrir = (m: "profit" | "stop") => { setModo(m); setValor(String(Math.round((m === "profit" ? -custo : reprova) * 100) / 100)); };
  if (!modo) return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button type="button" onClick={() => abrir("profit")}>✅ Profit (bateu a meta)</Button>
      <Button type="button" variant="destructive" onClick={() => abrir("stop")}>🛑 Stop (reprovou)</Button>
    </div>
  );
  return (
    <div className="mt-3 rounded-lg border border-primary/50 bg-secondary p-3">
      <p className="text-sm font-semibold">{modo === "profit" ? "✅ Registrar Profit" : "🛑 Registrar reprovação"}</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">Valor teórico no CFD: <span className={teorico >= 0 ? "text-market-up" : "text-market-down"}>{fmtSigned(teorico)}</span></p>
      <label className="mt-2 block text-xs text-muted-foreground" htmlFor="valor-real">Valor real liquidado no CFD ($, use − para perda)</label>
      <input id="valor-real" inputMode="decimal" enterKeyHint="done" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (valorInvalido) return; setModo(null); (modo === "profit" ? onProfit : onStop)(real); } else if (e.key === "Escape") setModo(null); }}
        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-foreground" />
      <p className="mt-1 font-mono text-xs">spread/slippage: <span className={spread === null ? "text-market-down" : spread >= 0 ? "text-market-up" : "text-market-down"}>{spread === null ? "Valor CFD inválido" : fmtSigned(spread)}</span></p>
      {modo === "profit" && risco && <p className="mt-1 text-xs text-market-down">⚠️ margem em risco</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant={modo === "stop" ? "destructive" : "default"} disabled={valorInvalido} onClick={() => { if (valorInvalido) return; setModo(null); (modo === "profit" ? onProfit : onStop)(real); }}>confirmar</Button>
        <Button type="button" variant="ghost" onClick={() => setModo(null)}>cancelar</Button>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border bg-card p-4">
      {title && <p className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">{title}</p>}
      {children}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: ReactNode; tone?: "pos" | "neg" | undefined }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-950/80 bg-[radial-gradient(ellipse_at_top_right,rgba(0,190,255,0.09),transparent_58%),linear-gradient(135deg,#0b1725,#060d17)] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.18)] sm:p-5">
      <p className="flex items-center gap-2 text-sm text-blue-100/65"><Target className="size-4 text-cyan-400" />{label}</p>
      <p className={cn("mt-2 font-mono text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl", tone === "pos" && "text-emerald-400", tone === "neg" && "text-rose-400")}>{value}</p>
    </div>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">{children}</p>;

/* ---------- aba de ativo ---------- */

function AssetView({ state, bancasGlobais, bancaAtivaId, assetKey, section, setSection, leftMenuOpen, setLeftMenuOpen, desktopRailTop, mutate, isAdmin }: { state: State; bancasGlobais?: Banca[] | undefined; bancaAtivaId?: string | undefined; assetKey: AssetKey; section: Section; setSection: (s: Section) => void; leftMenuOpen: boolean; setLeftMenuOpen: (v: boolean) => void; desktopRailTop: number; mutate: (fn: (s: State) => void) => void; isAdmin: boolean }) {
  const asset = state.assets[assetKey];
  const avaliacaoDias = assetKey === "ouro" ? diasAvaliacaoGold(asset) : 3;
  const calcs = useMemo(() => computeAssetCalcs(asset, assetKey), [asset, assetKey]);
  const setP = (k: keyof Asset["params"]) => (v: number) => mutate((s) => { (s.assets[assetKey].params as unknown as Record<string, number>)[k] = v; });
  const bonus = asset.bonus;
  // O Forex é compartilhado entre as bancas e ativos: considerar todos os depósitos e bônus disponíveis.
  const forexProprio = Object.values(state.assets).reduce((sum, a) => sum + Math.max(0, a.bonus.deposito || 0), 0);
  const forexBonus = Object.values(state.assets).reduce((sum, a) => sum + Math.max(0, a.bonus.bonusAtual || 0), 0);
  const saldo = (state.forexSaldoReal ?? forexProprio) + forexBonus;
  const [bonusPct, setBonusPct] = useState("100");
  const caixaCiclo = useMemo(() => calcCaixaCiclo(asset, assetKey, parseNum(bonusPct)), [asset, assetKey, bonusPct]);
  // Atalhos: Shift+N = Profit no dia N; Ctrl+N (ou Alt+N) = Stop no dia N. Só vale para o dia atual; usa o valor teórico.
  const curIdx = asset.attempt.currentDayIndex;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
      if (!m) return;
      const n = Number(m[1]) === 0 ? 10 : Number(m[1]);
      const isProfit = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
      const isStop = (e.ctrlKey || e.altKey || e.metaKey) && !e.shiftKey;
      if (!isProfit && !isStop) return;
      e.preventDefault();
      if (n - 1 !== curIdx) return;
      mutate((s) => (isProfit ? handleProfit(s, assetKey) : handleStop(s, assetKey)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [curIdx, assetKey, mutate]);

  // Partilha um único saldo Forex e um único teto de bônus ao projetar os dias restantes.
  let cum = saldo, totalMeta = 0, reservaMinima = 0;
  const projecaoForex = projetarAportesFuturos({
    necessidades: caixaCiclo.dias.map((d) => d.necessario),
    perdas: calcs.map((c) => Math.max(0, c.custoSePassar)),
    indiceAtual: asset.attempt.currentDayIndex,
    saldoReal: state.forexSaldoReal ?? forexProprio,
    bonusAtual: forexBonus,
    bonusPct: parseNum(bonusPct),
    bonusCapRestante: Math.max(0, (asset.bonus.bonusCap || 0) - (asset.bonus.bonusGanhoTotal || 0)),
  });
  const rows = asset.days.map((d, i) => {
    const c = calcs[i]!;
    totalMeta += d.meta;
    const isPast = i < asset.attempt.currentDayIndex;
    const saldoAoEntrar = cum;
    if (!isPast) cum += c.passa;
    const margem = (asset.params.marginPerLot || 0) * d.lotes;
    const stopout = asset.params.stopoutPct ?? 30;
    const margemTotal = margem + margem * (stopout / 100);
    // Para saque, reservar somente o necessário para operar o dia atual:
    // margem + stop-out + perda CFD se a mesa passar hoje. Não somar dias futuros.
    if (i === asset.attempt.currentDayIndex) {
      reservaMinima = margem > 0 ? margemTotal + Math.max(0, c.custoSePassar) : 0;
    }
    const caixaProjetado = caixaCiclo.dias[i];
    // No dia atual, a barra deve refletir o saldo real já registrado em Bônus,
    // e não a simulação que começa com saldo zero.
    // Para dias atuais e futuros, projetar a partir do saldo real compartilhado,
    // consumindo o saldo após cada dia. Dias anteriores não cobram novo depósito.
    const detalhe = projecaoForex[i];
    const caixaDia = caixaProjetado && detalhe ? { ...caixaProjetado, ...detalhe } : caixaProjetado;
    let status: "ok" | "alerta" | "risco" = "ok";
    let statusText = "— sem posição CFD hoje (0 lotes)";
    if (margem > 0 && caixaDia) {
      if (i < asset.attempt.currentDayIndex) {
        status = "ok";
        statusText = "✅ dia já concluído";
      } else if (caixaDia.deposito <= 0) {
        status = "ok";
        statusText = "✅ saldo compartilhado do Forex cobre o necessário";
      } else if (caixaDia.saldoAntes >= margemTotal) {
        status = "alerta";
        statusText = `⚠️ margem coberta; falta aporte de ${fmt(caixaDia.deposito)} para a cobertura completa`;
      } else {
        status = "risco";
        statusText = `🔴 saldo compartilhado insuficiente; falta aporte de ${fmt(caixaDia.deposito)}`;
      }
      const depositarHoje = i < asset.attempt.currentDayIndex ? 0 : caixaDia.deposito;
      statusText += ` · depositar hoje: ${fmt(depositarHoje)} · saldo antes: ${fmt(caixaDia.saldoAntes)} (próprio: ${fmt(caixaDia.proprioAntes)} + bônus: ${fmt(caixaDia.bonusAntes)}) · bônus do depósito: ${fmt(caixaDia.bonusGanho)} · necessário no CFD: ${fmt(caixaDia.necessario)}`;
    }
    const ativoTicks = assetKey === "saque2" ? (asset.params.ativoReal === "nasdaq" ? "nasdaq" : "ouro") : assetKey;
    const ticks = c.pontos * (ativoTicks === "ouro" ? 10 : 4);
    return { d, c, i, isCurrent: i === asset.attempt.currentDayIndex, status, statusText, ticks, mult: d.mnq > 0 ? (d.lotes / d.mnq) * 100 : 0, caixaDia };
  });
  const visibleRows = isAdmin ? rows : rows.filter((r) => r.isCurrent);
  const displayedTotalMeta = isAdmin ? totalMeta : visibleRows.reduce((total, r) => total + r.d.meta, 0);
  // Soma das metas configuradas nos parâmetros para D1 a D5 Funded (índices 3–7), independentemente de operações realizadas.
  const lucroFunded = asset.days.slice(avaliacaoDias, avaliacaoDias + 5).reduce((total, dia) => total + (Number(dia.meta) || 0), 0);
  const displayedCum = isAdmin ? cum : visibleRows.reduce((total, r) => total + r.c.passa, saldo);
  const folga = asset.params.folgaExtraPct ?? 20;
  const reservaComFolga = reservaMinima > 0 ? reservaMinima * (1 + folga / 100) : 0;
  const proprioAtual = Math.max(0, asset.bonus.deposito || 0);
  const bonusAtual = Math.max(0, asset.bonus.bonusAtual || 0);
  // AplicarSaque reduz o bônus na mesma proporção do depósito próprio sacado.
  const excedenteAtualSacavel = proprioAtual > 0
    ? Math.min(proprioAtual, Math.max(0, proprioAtual + bonusAtual - reservaComFolga) / (1 + bonusAtual / proprioAtual))
    : 0;
  const sections: [Section, string][] = [
    ["operacoes", "Operações"],
    ["parametros", "Parâmetros"],
    ["bonus", "Bônus e saques"],
    ["aporte", "Aporte fracionado"],
    ["caixa", "Caixa do ciclo"],
    ["meta", "Meta geral"],
  ];

  return (
    <div>
      <aside className="fixed left-1 top-1/2 z-40 flex -translate-y-1/2 lg:left-2 lg:translate-y-0" aria-label="Menu de operações" style={{ top: typeof window !== "undefined" && window.innerWidth >= 1024 ? desktopRailTop : undefined }}>
        <div className="flex items-start gap-1">
          <button type="button" aria-label={leftMenuOpen ? "Recolher menu" : "Expandir menu"} aria-expanded={leftMenuOpen} onClick={() => setLeftMenuOpen(!leftMenuOpen)}
            className="flex size-9 items-center justify-center rounded-xl border border-cyan-700/70 bg-[#061322] sm:size-11 lg:size-12 text-cyan-300 shadow-xl hover:bg-blue-950">
            {leftMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          {leftMenuOpen && <nav className="flex w-48 flex-col gap-1 rounded-xl border border-cyan-800/70 bg-[#061322] p-2 shadow-2xl" aria-label="Seções da plataforma">
            {sections.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={section === k} onClick={() => { setSection(k); setLeftMenuOpen(false); }}
                className={cn("rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors", section === k ? "bg-emerald-500/20 text-emerald-300" : "text-blue-100 hover:bg-blue-950")}>{l}</button>
            ))}
          </nav>}
        </div>
      </aside>
      {section === "parametros" && (
        <div className="space-y-4 lg:space-y-3">
          <section className="relative overflow-hidden rounded-2xl border border-cyan-700/50 bg-[radial-gradient(ellipse_at_top_right,rgba(0,190,255,0.13),transparent_45%),linear-gradient(135deg,#0a192b,#050c17_72%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)] sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full border border-cyan-400/10" />
            <div className="relative flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                <Calculator className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Configuração operacional</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">Parâmetros da estratégia</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-blue-100/65">Ajuste os valores usados nos cálculos de contratos, CFD, margem e aprovação. As alterações são salvas automaticamente.</p>
              </div>
            </div>
            <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-cyan-950 bg-[#061322]/80 p-3">
                <p className="text-[10px] uppercase tracking-wider text-blue-100/55">Ativo</p>
                <p className="mt-1 font-semibold text-slate-100">${ASSET_NAME[assetKey]}</p>
              </div>
              <div className="rounded-xl border border-cyan-950 bg-[#061322]/80 p-3">
                <p className="text-[10px] uppercase tracking-wider text-blue-100/55">Saldo CFD atual</p>
                <p className="mt-1 font-mono font-bold text-cyan-300">${fmt(saldo)}</p>
              </div>
              <div className="col-span-2 rounded-xl border border-cyan-950 bg-[#061322]/80 p-3 sm:col-span-1">
                <p className="text-[10px] uppercase tracking-wider text-blue-100/55">Limite geral EOD</p>
                <p className="mt-1 font-mono font-bold text-amber-300">${fmt(asset.params.mll)}</p>
              </div>
            </div>
          </section>

          {assetKey === "saque2" && (
            <section className="rounded-2xl border border-cyan-950/80 bg-[#071321] p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300"><Crosshair className="size-4" /></span>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Ativo real</h3>
                  <p className="text-xs text-blue-100/55">Define a referência de cálculo do Saque 2.</p>
                </div>
              </div>
              <label className="block max-w-sm">
                <span className="mb-1.5 block text-xs font-medium text-blue-100/75">Ativo real operado</span>
                <select value={asset.params.ativoReal === "nasdaq" ? "nasdaq" : "ouro"} className="w-full rounded-xl border border-cyan-950 bg-[#030b15] px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/70"
                  onChange={(e) => mutate((s) => {
                    const p = s.assets.saque2.params; const v = e.target.value === "nasdaq" ? "nasdaq" : "ouro";
                    p.ativoReal = v; if (v === "nasdaq") { p.mnq = 2; p.hfm = 1; } else { p.mnq = 10; p.hfm = 100; }
                  })}>
                  <option value="ouro">Gold (MGC)</option>
                  <option value="nasdaq">Nasdaq</option>
                </select>
              </label>
            </section>
          )}

          <section className="rounded-2xl border border-cyan-950/80 bg-[#071321] p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/15 bg-blue-400/10 text-blue-300"><Layers className="size-4" /></span>
              <div>
                <h3 className="font-bold text-slate-100">Mercado e execução</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-blue-100/55">Valores de referência para converter pontos e dimensionar os contratos.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-[#18324e] bg-[#091827] p-3"><NumField label="$/ponto do contrato futuro" value={asset.params.mnq} onChange={setP("mnq")} /></div>
              <div className="rounded-xl border border-[#183b43] bg-[#091a20] p-3"><NumField label="Broker CFD $/ponto/lote" value={asset.params.hfm} onChange={setP("hfm")} /></div>
              <div className="rounded-xl border border-cyan-950 bg-[#091522] p-3"><NumField label="Saldo broker CFD ($)" value={saldo} readOnly helper={`Saldo financeiro conciliado, incluindo resultados reais e bônus disponível`} /></div>
            </div>
          </section>

          <section className="rounded-2xl border border-cyan-950/80 bg-[#071321] p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/10 text-emerald-300"><Wallet className="size-4" /></span>
              <div>
                <h3 className="font-bold text-slate-100">Financeiro e margem</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-blue-100/55">Custos, alvo líquido e requisitos da corretora.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              
              <div className="rounded-xl border border-[#18324e] bg-[#091827] p-3"><NumField label="Lucro líquido desejado ($, sem a taxa)" value={asset.params.lucroDesejado} onChange={setP("lucroDesejado")} /></div>
              <div className="rounded-xl border border-[#183b43] bg-[#091a20] p-3"><NumField label="Margem exigida por 1 lote ($)" value={asset.params.marginPerLot} onChange={setP("marginPerLot")} /></div>
              <div className="rounded-xl border border-[#18324e] bg-[#091827] p-3"><NumField label="Stop-out da corretora (%)" value={asset.params.stopoutPct} onChange={setP("stopoutPct")} /></div>
              <div className="rounded-xl border border-[#183b43] bg-[#091a20] p-3"><NumField label="Saque esperado por conta aprovada ($)" value={asset.params.saqueAprovada} onChange={setP("saqueAprovada")} /></div>
              <div className="rounded-xl border border-[#18324e] bg-[#091827] p-3"><NumField label="Folga extra de segurança p/ saque (%)" value={asset.params.folgaExtraPct} onChange={setP("folgaExtraPct")} /></div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-amber-500/25 bg-[#0b1520]">
            <div className="border-b border-amber-500/15 bg-gradient-to-r from-amber-500/10 to-transparent p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300"><ShieldCheck className="size-4" /></span>
                <div>
                  <h3 className="font-bold text-slate-100">Limite de perda da mesa · EOD</h3>
                  <p className="mt-1 text-xs leading-relaxed text-blue-100/60">Configure o limite geral e, se necessário, uma exceção para cada dia do ciclo.</p>
                </div>
              </div>
              <div className="mt-4 max-w-sm rounded-xl border border-amber-400/20 bg-[#080f18] p-3">
                <NumField label="Limite geral EOD da mesa (reprovação $)" value={asset.params.mll} onChange={setP("mll")} helper="Limite móvel calculado no fechamento do dia — não é limite diário." />
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-slate-100">Limite geral EOD por dia do ciclo</h4>
                <p className="mt-1 text-xs leading-relaxed text-blue-100/60">Use 0 para herdar o limite geral de ${fmt(asset.params.mll)}. Preencha um valor personalizado quando o limite mudar após um dia lucrativo.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {asset.days.map((d, i) => (
                  <div key={i} className="rounded-xl border border-[#273342] bg-[#07101a] p-3">
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="font-mono text-xs font-bold text-amber-300">{rotuloDia(asset, assetKey, i)}</span>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", d.mll && d.mll > 0 ? "bg-amber-400/10 text-amber-300" : "bg-slate-700/50 text-slate-400")}>{d.mll && d.mll > 0 ? "Personalizado" : "Geral"}</span>
                    </div>
                    <NumField label="Limite ($)" value={d.mll ?? 0}
                      onChange={(v) => mutate((s) => { const day = s.assets[assetKey].days[i]!; if (v > 0) day.mll = v; else delete day.mll; })}
                      helper={d.mll && d.mll > 0 ? "Exceção ativa" : `herda ${fmt(asset.params.mll)}`} />
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100/75">
                <p className="font-semibold text-amber-200">Importante</p>
                <p className="mt-1">A estratégia exige limite geral do tipo EOD, atualizado no fechamento do dia. Mesas com limite de perda diário não servem para esta estratégia. Os pontos até a reprovação são calculados por dia e exibidos nos cards de operações.</p>
              </div>
            </div>
          </section>

          <div className="flex items-start gap-2 rounded-xl border border-cyan-950/70 bg-[#06101b] p-3 text-xs leading-relaxed text-blue-100/60">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <p>Após a aprovação, o primeiro saque pode devolver o gasto no CFD e gerar lucro. Informe o saque esperado por conta aprovada para que a plataforma credite essa estimativa automaticamente.</p>
          </div>
        </div>
      )}

      {section === "meta" && (
        <section aria-label="Meta geral — projeção de lucro dos cinco dias Funded">
          <div className="mb-3 rounded-2xl border border-cyan-900/70 bg-gradient-to-r from-[#0a1929] to-[#07121e] px-3 py-3 shadow-lg sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="flex items-center gap-2 text-xs font-semibold text-blue-100/75"><Target className="size-4 text-cyan-400" />Meta Funded · D1–D5</p>
              <span className="rounded-full border border-cyan-800/60 bg-cyan-950/40 px-2 py-0.5 text-[10px] text-cyan-200/80">Projeção pelas metas</span>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.1fr_1.1fr] sm:items-stretch">
              <div className="flex items-center justify-between gap-2 rounded-lg border border-cyan-900/40 bg-[#071423]/70 px-3 py-2 sm:block">
                <p className="text-[10px] text-blue-100/60">Lucro total previsto</p>
                <p className="font-mono text-xl font-bold tracking-tight text-slate-100 sm:mt-1 sm:text-2xl">$ {fmt(lucroFunded)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                <div className="min-w-0 rounded-lg border border-slate-700/40 bg-slate-800/35 px-2.5 py-2">
                  <p className="text-[10px] leading-tight text-blue-100/65">1º saque · 50%</p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-100">$ {fmt(lucroFunded / 2)}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-emerald-700/40 bg-emerald-950/30 px-2.5 py-2">
                  <p className="text-[10px] leading-tight text-emerald-200/80">Recebe · split 90%</p>
                  <p className="mt-1 font-mono text-lg font-bold text-emerald-400">$ {fmt(lucroFunded * 0.45)}</p>
                </div>
              </div>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-blue-100/55"><span className="shrink-0 text-cyan-400">↳</span> Próximo saque após mais 5 dias positivos de pelo menos $150 por dia, conforme regras da mesa.</p>
          </div>
        </section>
      )}

      {section === "aporte" && <AportePanel asset={asset} assetKey={assetKey} calcs={calcs} />}
      {section === "caixa" && <CaixaPanel asset={asset} state={state} bancasGlobais={bancasGlobais} bancaAtivaId={bancaAtivaId} assetKey={assetKey} bonusPct={bonusPct} setBonusPct={setBonusPct} /> }
      {section === "bonus" && <BonusPanel state={state} assetKey={assetKey} reserva={reservaComFolga} folga={folga} mutate={mutate} />}

      {section === "operacoes" && (
        <div>
          <div className="space-y-3">
            {visibleRows.map((r) => (
              <DayCard key={r.i} row={r} asset={asset} assetKey={assetKey} avaliacaoDias={assetKey === "ouro" ? diasAvaliacaoGold(asset) : 3} mutate={mutate} excedenteAtualSacavel={excedenteAtualSacavel} />
            ))}
          </div>
          {isAdmin && <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" className="flex-1 border-dashed" onClick={() => mutate((s) => { if (assetKey === "ouro") adicionarDiaGold(s.assets.ouro, "financiada"); else s.assets[assetKey].days.push({ mnq: 1, lotes: 1, meta: 150 }); })}>+ adicionar dia {assetKey === "ouro" ? "financiado" : ""}</Button>{assetKey === "ouro" && <Button type="button" variant="outline" className="flex-1 border-dashed border-amber-800 text-amber-200" onClick={() => mutate((s) => adicionarDiaGold(s.assets.ouro, "avaliacao"))}>+ adicionar dia de avaliação</Button>}</div>}
        </div>
      )}
    </div>
  );
}

type Row = { d: Asset["days"][number]; c: ReturnType<typeof computeAssetCalcs>[number]; i: number; isCurrent: boolean; status: "ok" | "alerta" | "risco"; statusText: string; ticks: number; mult: number; caixaDia?: ReturnType<typeof calcCaixaCiclo>["dias"][number] | undefined };

function DayCard({ row, asset, assetKey, avaliacaoDias, mutate, excedenteAtualSacavel }: { row: Row; asset: Asset; assetKey: AssetKey; avaliacaoDias: number; mutate: (fn: (s: State) => void) => void; excedenteAtualSacavel: number }) {
  const { d, c, i, isCurrent } = row;
  const ref = useRef<HTMLDivElement>(null);
  const wasCurrent = useRef(isCurrent);
  useEffect(() => {
    if (isCurrent && !wasCurrent.current) {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      ref.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    }
    wasCurrent.current = isCurrent;
  }, [isCurrent]);
  const setD = (k: "mnq" | "lotes" | "meta") => (v: number) => mutate((s) => { s.assets[assetKey].days[i]![k] = v; });
  const limiteFixo = assetKey === "ouro" && i <= avaliacaoDias;
  const limiteHoje = assetKey === "ouro" ? lossLimitGoldEfetivo(asset, i) : 0;
  const limiteProjetado = assetKey === "ouro" ? lossLimitGoldProjetado(asset, i) : 0;
  const limiteManual = assetKey === "ouro" && !limiteFixo && typeof d.mll === "number" && d.mll > 0;
  return (
    <div ref={ref} className={cn("platform-day-card overflow-hidden rounded-2xl border border-[#142b43] bg-[#0b0f19] p-3 text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.22)] sm:p-5 lg:p-3", isCurrent && "border-[#087cff]/70 ring-1 ring-[#087cff]/25")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#142b43] pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-lg border border-blue-500 bg-blue-600 px-2.5 py-1 font-mono text-sm font-bold text-white shadow-[0_0_18px_rgba(0,119,255,0.18)]">D{i < avaliacaoDias ? i + 1 : i - avaliacaoDias + 1} <span className="text-[10px] font-semibold uppercase tracking-wide">{i < avaliacaoDias ? "Avaliação" : "Financiada"}</span></span>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200/85 sm:text-[11px]"><Crosshair className="h-3.5 w-3.5 shrink-0 text-blue-400" />Matriz operacional</p>
          {isCurrent && <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 sm:text-xs"><span className="h-2 w-2 rounded-full bg-market-up" />dia atual</span>}
        </div>
        <button type="button" className="shrink-0 rounded-lg border border-[#19334f] px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-blue-500/60 hover:text-white" onClick={() => mutate((s) => { if (assetKey === "ouro") removerDiaGold(s.assets.ouro, i); else s.assets[assetKey].days.splice(i, 1); })}>remover</button>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <div className="min-w-0 rounded-xl border border-[#18324e] bg-gradient-to-br from-[#0d1b2b] to-[#080f1a] p-3 lg:p-2.5">
          <NumField cockpit label={<><FileText className="h-3.5 w-3.5 text-blue-400" />Contratos</>} value={d.mnq} onChange={setD("mnq")} />
          <span className="mt-2 inline-block rounded-full border border-market-down/40 bg-rose-950/40 px-2 py-0.5 font-mono text-[11px] text-market-down">-${fmt(Math.abs(c.passa))} se passar</span>
        </div>
        <div className="min-w-0 rounded-xl border border-[#183b43] bg-gradient-to-br from-[#092126] to-[#080f1a] p-3 lg:p-2.5">
          <NumField cockpit label={<><Layers className="h-3.5 w-3.5 text-cyan-400" />Lotes CFD</>} value={d.lotes} onChange={setD("lotes")} />
          <span className="mt-2 inline-block rounded-full border border-market-up/40 bg-emerald-950/40 px-2 py-0.5 font-mono text-[11px] text-market-up">+${fmt(c.reprova)} se reprova</span>
        </div>
        <div className="min-w-0 rounded-xl border border-[#18324e] bg-gradient-to-br from-[#0d1b2b] to-[#080f1a] p-3 sm:p-4">
          <NumField cockpit label={<><Target className="h-3.5 w-3.5 text-blue-400" />Meta $</>} value={d.meta} onChange={setD("meta")} />
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">{fmt(row.ticks)} ticks</p>
        </div>
        <div className="min-w-0 rounded-xl border border-[#18324e] bg-gradient-to-br from-[#0d1b2b] to-[#080f1a] p-3 sm:p-4">
          <p className="flex items-center gap-1.5 text-xs text-blue-100/90"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" />Alvo Reprova</p>
          <p className="mt-2 font-mono text-2xl font-bold sm:text-[28px]">{fmt(c.pontosReprova * 10)} <span className="text-sm text-muted-foreground">pts</span></p>
        </div>
      </div>

       <div className={cn("mt-3 flex items-center justify-between gap-3 rounded-xl border p-3.5 lg:p-3", c.liquidoSeReprovar >= 0 ? "border-emerald-500/80 bg-gradient-to-r from-emerald-950/80 via-[#052b2a] to-[#071b20] shadow-[0_0_22px_rgba(0,220,160,0.10)]" : "border-rose-800/80 bg-gradient-to-r from-rose-950/60 to-[#10131f]")}>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-100 sm:text-sm">Líquido se reprovar hoje</p>
          <p className="mt-1 font-mono text-[10px] text-slate-400 sm:text-xs">Dívida: ${fmt(c.dividaHoje)} · Alvo bruto: ${fmt(c.alvoBruto)}</p>
        </div>
        <p className={cn("shrink-0 font-mono text-2xl font-extrabold tracking-tight sm:text-3xl lg:!text-[36px] xl:!text-[40px]", c.liquidoSeReprovar >= 0 ? "text-emerald-300 drop-shadow-[0_0_18px_rgba(16,185,129,0.8)]" : "text-rose-400")}>{c.liquidoSeReprovar >= 0 ? "+" : "-"}${fmt(Math.abs(c.liquidoSeReprovar))}</p>
      </div>

      {row.caixaDia && d.lotes > 0 ? (() => {
        const cx = row.caixaDia;
        const total = Math.max(cx.necessario, cx.proprioAntes + cx.bonusAntes + cx.deposito, 1);
        const pct = (v: number) => `${Math.max(0, (v / total) * 100)}%`;
        const badge = row.status === "ok" ? "Coberto" : row.status === "alerta" ? "Pendente" : "Risco";
        return (
          <div className="mt-3 rounded-xl border border-[#142b43] bg-gradient-to-b from-[#0a1421] to-[#080f19] p-3.5 lg:p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-100/90 sm:text-xs flex items-center gap-1.5"><ShieldCheck className="h-[18px] w-[18px] text-emerald-300 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" />Gestão de caixa & margem</p>
              <span className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold", row.status === "ok" && "border-emerald-400/70 bg-emerald-950/70 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.28)]", row.status === "alerta" && "border-brand-gold/50 text-brand-gold", row.status === "risco" && "border-market-down/50 text-market-down")}>{row.status === "ok" && <Check className="h-3.5 w-3.5 stroke-[3]" />}{badge}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-800">
              <div className="bg-slate-500" style={{ width: pct(cx.proprioAntes) }} />
              <div className="bg-gradient-to-r from-sky-500 to-cyan-400" style={{ width: pct(cx.bonusAntes) }} />
              <div className="bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: pct(cx.deposito) }} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-blue-600/80 bg-gradient-to-r from-blue-950/70 to-[#071a31] px-3 py-2.5">
              <span className="flex items-center gap-2 text-[11px] font-semibold leading-snug text-cyan-300 sm:text-sm"><Wallet className="h-4 w-4 shrink-0" />Aporte Recomendado Hoje</span>
              <span className="font-mono text-base font-bold text-sky-400 sm:text-xl">${fmt(cx.deposito)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-[#142b43] bg-[#0b1726] px-3 py-2.5 font-mono text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><Calculator className="h-3.5 w-3.5" />Necessário no CFD</span><span className="font-semibold">${fmt(cx.necessario)}</span></div>
            {assetKey === "ouro" && <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-amber-800/50 bg-[#161924] px-3 py-2.5">
              <label className="min-w-0 text-xs font-semibold text-amber-200">Loss Limit EOD na mesa ($)</label>
              {limiteFixo ? <span className="font-mono text-base font-bold text-white">$2.000</span> :
                <div className="flex items-center gap-1.5">
                  <input aria-label="Loss Limit EOD na mesa" type="number" min="0.01" step="0.01" inputMode="decimal" value={limiteManual ? d.mll : limiteProjetado} title={limiteManual ? "Valor ajustado manualmente" : "Projeção calculada pelas metas anteriores"} className="w-28 max-w-[43vw] rounded-lg border border-amber-800/70 bg-[#081321] px-2 py-1.5 text-right font-mono text-sm font-bold text-white focus:border-amber-400 focus:outline-none" onChange={(e) => { const raw = e.target.value; const valor = Number(raw); mutate((st) => { const dia = st.assets[assetKey].days[i]; if (!dia) return; if (raw.trim() && Number.isFinite(valor) && valor > 0) dia.mll = valor; else delete dia.mll; }); }} />
                  {limiteManual && <button type="button" className="rounded border border-amber-900/60 px-1.5 py-1 text-[10px] text-amber-200" title="Voltar à projeção automática" onClick={() => mutate((st) => { delete st.assets[assetKey].days[i]!.mll; })}>Auto</button>}
                </div>}
            </div>}

          </div>
        );
      })() : <p className="mt-2 font-mono text-[11px] text-muted-foreground">{row.statusText}</p>}
       {isCurrent && <Settle risco={row.status === "risco"} custo={c.custoSePassar} reprova={c.reprova}
        onProfit={(real) => mutate((s) => handleProfit(s, assetKey, real))} onStop={(real) => mutate((s) => handleStop(s, assetKey, real))} />}
    </div>
  );
}

function BonusPanel({ state, assetKey, reserva, folga, mutate }: { state: State; assetKey: AssetKey; reserva: number; folga: number; mutate: (fn: (s: State) => void) => void }) {
  const b = state.assets[assetKey].bonus;
  const [dep, setDep] = useState("");
  const [saq, setSaq] = useState("");
  const [saquePendente, setSaquePendente] = useState<{ valor: number; saldoAnterior: number; creditoAnterior: number; ativo: AssetKey } | null>(null);
  const [saldoMt5, setSaldoMt5] = useState("");
  const [creditoMt5, setCreditoMt5] = useState("");
  const valorSaldoMt5 = parseValorFinanceiro(saldoMt5);
  const valorCreditoMt5 = parseValorFinanceiro(creditoMt5);
  const valorDeposito = parseValorFinanceiro(dep);
  const valorSaque = parseValorFinanceiro(saq);
  const saldoReal = state.forexSaldoReal ?? 0;
  const bonusForex = Object.values(state.assets).reduce((t, a) => t + Math.max(0, a.bonus.bonusAtual), 0);
  const total = saldoReal + bonusForex;
  const saqueValido = saquePendente !== null && saquePendente.ativo === assetKey && saquePendente.saldoAnterior === saldoReal && saquePendente.creditoAnterior === bonusForex && saquePendente.valor > 0 && saquePendente.valor <= saldoReal;
  const percentualSaque = saqueValido && saquePendente ? saquePendente.valor / saldoReal : 0;
  const reducaoBonus = bonusForex * percentualSaque;
  const last = b.log[b.log.length - 1];
  const dateStr = (ts: number) => { const d = new Date(ts); return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
  let ultima = "nenhum depósito ou saque registrado ainda.";
  if (last?.tipo === "deposito") ultima = `última ação: depósito de $${fmt(last.valor)} (+$${fmt(last.bonusGanho || 0)} de bônus) em ${dateStr(last.ts)}`;
  else if (last?.tipo === "saque") ultima = `última ação: saque de $${fmt(last.valor)} (proporção ${fmt((last.proporcao || 0) * 100)}% · bônus reduzido em $${fmt(last.bonusReduzido || 0)}) em ${dateStr(last.ts)}`;
  else if (last?.tipo === "ajuste_credito") ultima = `última ação: crédito conciliado em ${dateStr(last.ts)} (variação ${fmt(last.valor)})`;
  else if (last) ultima = `última ação: bônus e depósito próprio zerados (bônus $${fmt(last.valor)}${last.depositoZerado ? ` + depósito $${fmt(last.depositoZerado)}` : ""}) em ${dateStr(last.ts)}`;

  const linhas: ReactNode[] = [];
  if (total <= 0 && reserva <= 0) linhas.push("estratégia de saque: registre um depósito e pelo menos 1 dia do ciclo atual pra calcular.");
  else {
    linhas.push(<>composição atual: <strong>{fmt(total > 0 ? (saldoReal / total) * 100 : 0)}% saldo real</strong> (${fmt(saldoReal)}) + <strong>{fmt(total > 0 ? (bonusForex / total) * 100 : 0)}% bônus</strong> (${fmt(bonusForex)})</>);
    if (saldoReal <= 0 && bonusForex > 0) linhas.push("🔴 o saldo real global chegou a zero: as próximas perdas podem consumir o bônus disponível.");
    else if (saldoReal > 0 && bonusForex > 0) linhas.push(<>saldo real global disponível antes de consumir o bônus: <strong>${fmt(saldoReal)}</strong> (inclui resultados operacionais, não apenas depósitos).</>);
    if (reserva > 0) {
      linhas.push(<>reserva mínima pros dias que faltam (margem + buffer + {fmt(folga)}% de folga): <strong>${fmt(reserva)}</strong></>);
      const saqueSeguro = saldoReal > 0
        ? Math.min(saldoReal, Math.max(0, total - reserva) / (1 + bonusForex / saldoReal))
        : 0;
      linhas.push(saqueSeguro > 0 ? <>estimativa condicional de saque: <strong>${fmt(saqueSeguro)}</strong> apenas se não houver outras posições ou exigências de margem compartilhando o Forex. Confira a margem livre e o crédito no MT5 antes de registrar.</> : "🔴 não sobra espaço pra saque agora — sacar arrisca stop-out.");
    } else linhas.push("sem reserva estimada para este ativo. Isso não significa que o saldo está livre para saque: verifique as demais posições e a margem no MT5.");
    const proj = projetarZeragemBonus(state, assetKey, b.bonusAtual || 0);
    if ((b.bonusAtual || 0) <= 0) linhas.push("bônus já está zerado.");
    else if (proj) linhas.push(<>no ritmo atual (média de ${fmt(proj.media)}/dia saindo do bônus, últimos {proj.amostras} registros), o bônus deve zerar em ~<strong>{fmt(proj.dias)} dias</strong>.</>);
    else linhas.push("ainda sem histórico de custo suficiente pra projetar quando o bônus zera.");
  }

  const inputClass = "mt-1.5 w-full rounded-xl border border-[#19334f] bg-[#071321] px-3 py-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/10";
  const labelClass = "block text-xs font-medium text-blue-100/75";
  const espacoBonus = Math.max(0, b.bonusCap - b.bonusGanhoTotal);
  const pctBonus = b.bonusCap > 0 ? Math.min(100, (b.bonusGanhoTotal / b.bonusCap) * 100) : 0;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[#142b43] bg-[radial-gradient(ellipse_at_top_right,rgba(0,190,255,0.09),transparent_45%),linear-gradient(135deg,#0b1422,#060d17_72%)] p-4 text-slate-100 shadow-[0_16px_45px_rgba(0,0,0,0.22)] sm:p-6">
      <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full border border-cyan-400/10" />
      <div className="relative">
        <div className="mb-5 flex items-start gap-3 border-b border-[#142b43] pb-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-gradient-to-br from-blue-700/70 to-cyan-950">
            <Wallet className="size-6 text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">Gestão financeira · CFD</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-50 sm:text-2xl">Bônus e saques</h2>
            <p className="mt-1 text-sm leading-relaxed text-blue-100/65">Acompanhe o dinheiro próprio, o crédito promocional e o valor que pode retirar sem comprometer a margem.</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric label="Saldo real Forex (com lucros e perdas)" value={`${fmt(saldoReal)}`} />
          <Metric label="Bônus Forex disponível" value={`${fmt(bonusForex)}`} tone="pos" />
        </div>

        <div className="mb-5 rounded-xl border border-[#18324e] bg-[#071321]/90 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xs font-semibold text-blue-100/80"><ShieldCheck className="size-4 text-cyan-400" />Limite de bônus do plano</span>
            <span className="font-mono text-xs font-bold text-cyan-300">{fmt(pctBonus)}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300 transition-all" style={{ width: `${pctBonus}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-1 font-mono text-[11px] text-slate-400">
            <span>Conquistado: ${fmt(b.bonusGanhoTotal)}</span>
            <span>Disponível para ganhar: ${fmt(espacoBonus)} de ${fmt(b.bonusCap)}</span>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-[#18324e] bg-[#081321]/80 p-3.5"><p className="mb-2 text-xs text-slate-300">Conferir saldo real com o MetaTrader (para conciliar registros antigos; não apaga histórico)</p><div className="flex gap-2"><input aria-label="Saldo real MetaTrader" inputMode="decimal" className="min-w-0 flex-1 rounded-lg border border-[#19334f] bg-[#071321] px-3 py-2 font-mono text-sm" placeholder="Saldo real atual ($)" value={saldoMt5} onChange={(e) => setSaldoMt5(e.target.value)} /><Button type="button" variant="outline" disabled={valorSaldoMt5 === null} onClick={() => { if (valorSaldoMt5 === null) return; mutate((s) => { s.forexSaldoReal = valorSaldoMt5; }); setSaldoMt5(""); }}>Conferir</Button></div><div className="mt-2 flex gap-2"><input aria-label="Crédito atual MetaTrader" inputMode="decimal" className="min-w-0 flex-1 rounded-lg border border-[#19334f] bg-[#071321] px-3 py-2 font-mono text-sm" placeholder="Crédito atual MT5 ($)" value={creditoMt5} onChange={(e) => setCreditoMt5(e.target.value)} /><Button type="button" variant="outline" disabled={valorCreditoMt5 === null} onClick={() => { if (valorCreditoMt5 === null) return; mutate((s) => conciliarCreditoForex(s, assetKey, valorCreditoMt5)); setCreditoMt5(""); }}>Conferir crédito</Button></div></div>
        <div className="mb-5 rounded-xl border border-[#18324e] bg-[#081321]/80 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calculator className="size-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100">Configuração e movimentações</h3>
          </div>
          <div className="mb-4">
            <NumField label="Teto de bônus do plano ($)" value={b.bonusCap} onChange={(v) => mutate((s) => { if (v) s.assets[assetKey].bonus.bonusCap = v; })} />
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[#183b43] bg-gradient-to-br from-[#092126]/80 to-[#080f1a] p-3.5 sm:p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-bold text-emerald-300"><TrendingUp className="size-4" />Adicionar depósito</p>
              <p className="mb-3 text-xs leading-relaxed text-slate-400">Informe apenas o valor que saiu do seu bolso. O bônus será calculado separadamente.</p>
              <label className={labelClass}>Valor do depósito ($)
                <input inputMode="decimal" value={dep} placeholder="Ex.: 1000" onChange={(e) => setDep(e.target.value)} className={inputClass} />
              </label>
              <Button type="button" className="mt-3 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 font-bold text-slate-950 hover:from-emerald-400 hover:to-cyan-300" disabled={valorDeposito === null || valorDeposito <= 0} onClick={() => { if (valorDeposito === null || valorDeposito <= 0) return; mutate((s) => aplicarDeposito(s, assetKey, valorDeposito)); setDep(""); }}>Aplicar depósito</Button>
            </div>
            <div className="rounded-xl border border-[#482d39] bg-gradient-to-br from-[#27131e]/70 to-[#0b101b] p-3.5 sm:p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-bold text-rose-300"><Wallet className="size-4" />Registrar saque</p>
              <p className="mb-3 text-xs leading-relaxed text-slate-400">A retirada reduz proporcionalmente o bônus sobre o saldo real anterior ao saque (com os resultados operacionais).</p>
              <label className={labelClass}>Valor do saque ($)
                <input inputMode="decimal" value={saq} placeholder="Ex.: 200" onChange={(e) => { setSaq(e.target.value); setSaquePendente(null); }} className={inputClass} />
              </label>
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <Button type="button" variant="destructive" className="rounded-xl font-bold" disabled={valorSaque === null || valorSaque <= 0 || valorSaque > saldoReal} onClick={() => { if (valorSaque === null || valorSaque <= 0 || valorSaque > saldoReal) return; setSaquePendente({ valor: valorSaque, saldoAnterior: saldoReal, creditoAnterior: bonusForex, ativo: assetKey }); }}>Aplicar saque</Button>
                <Button type="button" variant="outline" title="Zerar bônus atual e depósito próprio" aria-label="Zerar bônus atual e depósito próprio" className="rounded-xl border-[#35465b] bg-[#111c2b] text-slate-200 hover:border-rose-400/60 hover:bg-rose-950/40" onClick={() => { if (window.confirm("Zerar bônus, histórico de bônus acumulado e capital registrado deste ativo? Esta ação não pode ser desfeita pelo histórico de operações.")) mutate((s) => resetBonus(s, assetKey)); }}>↺</Button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">Limite contábil de saque: <strong className="text-slate-100">${fmt(saldoReal)}</strong> (não significa margem livre para retirada). O botão ↺ exige confirmação antes de zerar os registros deste ativo.</p>
              {saquePendente && !saqueValido && (
                <p role="status" className="mt-3 rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs font-semibold text-amber-200">O saldo ou crédito mudou. Clique em Aplicar saque para recalcular. Nenhum saque foi registrado.</p>
              )}
              {saqueValido && saquePendente && (
                <div role="status" className="mt-4 space-y-3 rounded-xl border border-rose-400/60 bg-gradient-to-br from-[#33141f] to-[#130e1b] p-3.5 shadow-[0_0_22px_rgba(244,63,94,0.12)]">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-rose-200">Prévia do saque — ainda não registrado</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-rose-500/20 bg-black/20 p-2"><span className="block text-slate-400">Saque do saldo real</span><strong className="font-mono text-base text-white">-${fmt(saquePendente.valor)}</strong></div>
                    <div className="rounded-lg border border-rose-500/20 bg-black/20 p-2"><span className="block text-slate-400">Percentual retirado</span><strong className="font-mono text-base text-rose-200">{fmt(percentualSaque * 100)}%</strong></div>
                    <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2"><span className="block text-amber-200">Redução do bônus</span><strong className="font-mono text-lg text-amber-300">-${fmt(reducaoBonus)}</strong></div>
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-2"><span className="block text-slate-400">Bônus após saque</span><strong className="font-mono text-lg text-cyan-200">${fmt(bonusForex - reducaoBonus)}</strong></div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-300">A redução é proporcional ao saldo real anterior ao saque, incluindo lucros e perdas. Confirmar registra apenas na Win or Win; não solicita saque à corretora.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" className="bg-rose-600 font-bold text-white hover:bg-rose-500" onClick={() => {
                      const p = saquePendente;
                      if (!p || !saqueValido) return;
                      mutate((s) => {
                        const saldoAtual = s.forexSaldoReal ?? 0;
                        const creditoAtual = Object.values(s.assets).reduce((t, a) => t + Math.max(0, a.bonus.bonusAtual), 0);
                        if (saldoAtual !== p.saldoAnterior || creditoAtual !== p.creditoAnterior) return;
                        aplicarSaque(s, p.ativo, p.valor);
                      });
                      setSaquePendente(null);
                      setSaq("");
                    }}>Confirmar registro</Button>
                    <Button type="button" variant="outline" className="border-slate-500/60 text-slate-200 hover:bg-slate-800" onClick={() => setSaquePendente(null)}>Rejeitar</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-cyan-600/35 bg-gradient-to-r from-[#091b2b] to-[#0a1525] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
          <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-100/80"><Check className="size-4 text-emerald-400" />Última movimentação</p>
          <p className="text-sm leading-relaxed font-medium text-slate-200">{ultima}</p>
        </div>

        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100"><ShieldCheck className="size-4 text-cyan-400" />Análise de saque e proteção de margem</h3>
          {linhas.map((l, i) => (
            <div key={i} className="rounded-xl border border-cyan-900/70 bg-gradient-to-r from-[#0b2131] to-[#081726] px-4 py-3 text-sm leading-relaxed text-blue-100/90 shadow-sm">{l}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- histórico ---------- */

function Historico({ state, mutate, bancas, bancaAtivaId, podeDesfazerForex = true }: { state: State; mutate: (fn: (s: State) => void) => void; bancas?: Banca[] | undefined; bancaAtivaId?: string | undefined; podeDesfazerForex?: boolean }) {
  const [filtroBanca, setFiltroBanca] = useState(bancaAtivaId ?? "todas");
  const filtradas = bancas?.filter((b) => filtroBanca === "todas" || b.id === filtroBanca);
  const resumo = bancas ? (filtradas ?? []).reduce((acc, b) => {
    const atual = b.id === bancaAtivaId ? state : b.state;
    const t = historicoTotals(atual);
    acc.profit += t.profit; acc.resultadoReal += t.resultadoReal; acc.custoProprio += t.custoProprio;
    acc.aprovadas += atual.counts.aprovadas; acc.reprovadas += atual.counts.reprovadas;
    return acc;
  }, { profit: 0, resultadoReal: 0, custoProprio: 0, aprovadas: 0, reprovadas: 0 }) : { ...historicoTotals(state), ...state.counts };
  const { profit, resultadoReal, custoProprio } = resumo;
  const total = resumo.aprovadas + resumo.reprovadas;
  const logFiltrado = bancas ? (filtradas ?? []).flatMap((b) => (b.id === bancaAtivaId ? state.log : b.state.log).map((e) => ({ ...e, bancaNome: b.nome }))).sort((a, b) => a.ts - b.ts).map((e, index) => ({ ...e, id: index + 1 })) : state.log;
  const estadoHistorico = { ...state, log: logFiltrado };
  const roi = custoProprio > 0 ? (resultadoReal / custoProprio) * 100 : null;
  const base = custoProprio + resultadoReal;
  const margem = base > 0 ? (resultadoReal / base) * 100 : null;
  return (
    <div>
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Contas aprovadas" value={resumo.aprovadas} tone="pos" />
        <Metric label="Contas reprovadas" value={resumo.reprovadas} tone="neg" />
        <Metric label="Profit" value={(profit >= 0 ? "+$" : "-$") + fmt(Math.abs(profit))} tone={profit >= 0 ? "pos" : "neg"} />
        <Metric label="Resultado real" value={fmtSigned(resultadoReal)} tone={resultadoReal >= 0 ? "pos" : "neg"} />
      </div>
      <p className="mb-4 font-mono text-xs text-muted-foreground">
        {total > 0 ? `taxa de aprovação: ${fmt((resumo.aprovadas / total) * 100)}% (${total} ciclo${total === 1 ? "" : "s"} concluído${total === 1 ? "" : "s"})` : "nenhum ciclo concluído ainda — use os botões Profit / Stop nos cards de dia."}
      </p>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Metric label="Custo próprio real (seleção)" value={`$${fmt(custoProprio)}`} tone="neg" />
        <Metric label="Contas compradas" value={total} />
        <Metric label="ROI (resultado real)" value={roi == null ? "-" : `${roi >= 0 ? "+" : ""}${fmt(roi)}%`} tone={roi == null ? undefined : roi >= 0 ? "pos" : "neg"} />
        <Metric label="Margem do resultado real" value={margem == null ? "-" : `${margem >= 0 ? "+" : ""}${fmt(margem)}%`} tone={margem == null ? undefined : margem >= 0 ? "pos" : "neg"} />
      </div>
      <label className="mb-4 block text-sm">Operações por banca
        <select value={filtroBanca} onChange={(e) => setFiltroBanca(e.target.value)} className="mt-1 block w-full max-w-xs rounded-md border bg-background p-2">
          <option value="todas">Todas as bancas</option>
          {bancas?.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
      </label>
      <Chart state={estadoHistorico} />
      <Simulador state={estadoHistorico} />
      <div className="mb-3 flex justify-between">
        {filtroBanca === (bancaAtivaId ?? "todas") && state.log.length > 0 ? <ConfirmButton variant="ghost" disabled={!podeDesfazerForex} confirmText="clique de novo p/ confirmar" onConfirm={() => mutate(undoLast)}>desfazer última ação</ConfirmButton> : <span />}
        <ConfirmButton variant="ghost" disabled={filtroBanca !== (bancaAtivaId ?? "todas")} className="text-destructive" confirmText="clique de novo (apaga o histórico)" onConfirm={() => mutate((s) => {
          s.log = []; s.totalGasto = 0; s.counts = { aprovadas: 0, reprovadas: 0 };
          for (const k of ["nasdaq", "ouro", "saque2"] as AssetKey[]) { s.assets[k].attempt.currentDayIndex = 0; s.assets[k].attempt.cycleCost = 0; }
        })}>limpar histórico</ConfirmButton>
      </div>
      {!podeDesfazerForex && state.log.length > 0 && filtroBanca === (bancaAtivaId ?? "todas") && <p className="mb-2 text-xs text-amber-300">Desfazer indisponível: o saldo compartilhado mudou após a operação ou o registro antigo não possui verificação segura. Os dados foram preservados.</p>}
      <LogList state={estadoHistorico} />
    </div>
  );
}

function Chart({ state }: { state: State }) {
  const W = 700, H = 220, padL = 46, padR = 14, padT = 14, padB = 24;
  if (state.log.length === 0) return <div className="mb-4 rounded-lg border bg-card p-8 text-center font-mono text-xs text-muted-foreground">sem eventos registrados ainda</div>;
  const pts = state.log.reduce<number[]>((acc, e) => { acc.push(acc[acc.length - 1]! + e.delta); return acc; }, [0]);
  let minV = Math.min(...pts), maxV = Math.max(...pts);
  if (minV === maxV) { minV -= 10; maxV += 10; }
  const pad = (maxV - minV) * 0.1; minV -= pad; maxV += pad;
  const x = (i: number) => padL + (i / Math.max(1, pts.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - minV) / (maxV - minV)) * (H - padT - padB);
  const txt = { fill: "var(--muted-foreground)", fontSize: 10, fontFamily: "monospace" };
  return (
    <div className="mb-4 rounded-lg border bg-card p-2">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-48 w-full">
        <line x1={padL} y1={y(0)} x2={W - padR} y2={y(0)} style={{ stroke: "var(--border)" }} strokeDasharray="4,4" />
        <text x={padL - 6} y={y(0) + 4} textAnchor="end" style={txt}>$0</text>
        <text x={padL - 6} y={padT + 8} textAnchor="end" style={txt}>${fmt(maxV)}</text>
        <text x={padL - 6} y={H - padB} textAnchor="end" style={txt}>${fmt(minV)}</text>
        <path d={pts.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")} fill="none" strokeWidth={2} style={{ stroke: "var(--market-up)" }} />
        {state.log.map((e, i) => (
          <circle key={e.id} cx={x(i + 1)} cy={y(pts[i + 1]!)} r={3.5}
            style={{ fill: e.tipo === "reprovada" ? "var(--market-down)" : e.asset === "ouro" && e.tipo === "profit" ? "var(--brand-gold)" : "var(--market-up)" }} />
        ))}
      </svg>
    </div>
  );
}

function Simulador({ state }: { state: State }) {
  const [taxa, setTaxa] = useState("50");
  const [ciclos, setCiclos] = useState("100");
  const rep = state.log.filter((e) => e.tipo === "reprovada").map((e) => e.delta);
  const apr = state.log.filter((e) => e.tipo === "aprovada").map((e) => e.delta);
  if (!rep.length || !apr.length) return <Panel title="Simulador de cenários"><p className="font-mono text-xs text-muted-foreground">Registre pelo menos 1 conta aprovada e 1 reprovada pra habilitar o simulador.</p></Panel>;
  const mRep = rep.reduce((a, b) => a + b, 0) / rep.length;
  const mApr = apr.reduce((a, b) => a + b, 0) / apr.length;
  const denom = mRep - mApr;
  const be = denom > 0 ? (-mApr / denom) * 100 : null;
  const n = parseNum(ciclos), nRep = Math.round(n * (parseNum(taxa) / 100)), nApr = n - nRep;
  const ganho = nRep * mRep, custo = nApr * mApr, res = ganho + custo;
  const totalC = rep.length + apr.length;
  return (
    <Panel title="Simulador de cenários (médias do seu histórico)">
      <p className="mb-3 font-mono text-xs text-muted-foreground">Média por reprova: <span className="text-market-up">+${fmt(mRep)} (n={rep.length})</span> · Média por aprovada: <span className="text-market-down">-${fmt(Math.abs(mApr))} (n={apr.length})</span></p>
      <div className="mb-3"><Metric label="Taxa de reprovação mínima pra estratégia dar lucro" value={be == null ? "sempre lucrativo" : `${fmt(be)}%`} tone={be == null || be <= 50 ? "pos" : "neg"} /></div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Taxa de reprovação hipotética (%)</span><input inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value)} className="w-full rounded-md border bg-input/40 px-3 py-2 font-mono text-sm" /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Número de ciclos</span><input inputMode="decimal" value={ciclos} onChange={(e) => setCiclos(e.target.value)} className="w-full rounded-md border bg-input/40 px-3 py-2 font-mono text-sm" /></label>
      </div>
      <div className="mt-3"><Metric label="Resultado projetado" value={(res >= 0 ? "+$" : "-$") + fmt(Math.abs(res))} tone={res >= 0 ? "pos" : "neg"} /></div>
      <Note>{nRep} reprovada{nRep === 1 ? "" : "s"} · <span className="text-market-up">+${fmt(ganho)}</span> | {nApr} aprovada{nApr === 1 ? "" : "s"} · <span className="text-market-down">-${fmt(Math.abs(custo))}</span></Note>
      {totalC < 10 && <Note>⚠️ apenas {totalC} ciclo(s) no histórico — essas médias ainda são pouco confiáveis.</Note>}
    </Panel>
  );
}

function LogList({ state }: { state: State }) {
  if (!state.log.length) return <p className="py-6 text-center font-mono text-xs text-muted-foreground">nenhum evento registrado ainda</p>;
  return (
    <div className="divide-y rounded-lg border bg-card">
      {state.log.slice().reverse().map((e) => {
        const dt = new Date(e.ts);
        const date = dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        let extra = "";
        if (e.tipo === "reprovada" && typeof e.bruto === "number") extra = ` · bruto +$${fmt(e.bruto)}${e.taxaCobrada ? ` − taxa mesa -$${fmt(e.taxaCobrada)}` : ""}`;
        else if (typeof e.custoDia === "number") {
          extra = ` · custo do dia -$${fmt(e.custoDia)}${e.taxaCobrada ? ` + taxa mesa -$${fmt(e.taxaCobrada)}` : ""}${e.tipo === "aprovada" && e.saque ? ` + saque +$${fmt(e.saque)}` : ""}`;
          if (e.tipo === "profit" && typeof e.custoProprioDia === "number") extra += ` (própria -$${fmt(e.custoProprioDia)}${e.custoBonusDia > 0 ? ` + bônus -$${fmt(e.custoBonusDia)}` : ""})`;
        }
        if (e.tipo === "aprovada" && typeof e.resultadoReal === "number") {
          const cb = Math.max(0, (e.custoCiclo || 0) - (e.custoProprioCiclo || 0));
          extra += ` · resultado real ${e.resultadoReal >= 0 ? "+$" : "-$"}${fmt(Math.abs(e.resultadoReal))} (custo do ciclo: -$${fmt(e.custoProprioCiclo || 0)} próprio${cb > 0 ? ` + -$${fmt(cb)} bônus` : ""})`;
        } else if (e.tipo === "reprovada" && typeof e.resultadoReal === "number") {
          const tx = state.assets[e.asset]?.params.taxa ?? e.taxaCobrada ?? 0;
          const p = e.resultadoReal + tx;
          extra += ` · profit = líquido ${e.resultadoReal >= 0 ? "+$" : "-$"}${fmt(Math.abs(e.resultadoReal))} + taxa mesa +$${fmt(tx)} = ${p >= 0 ? "+$" : "-$"}${fmt(Math.abs(p))}`;
        }
        return (
          <div key={e.id} className="flex flex-wrap items-start gap-2 p-3 font-mono text-xs">
            <span className={cn("rounded px-1.5 py-0.5 text-[10px]", e.asset === "ouro" ? "bg-brand-gold/20 text-brand-gold" : e.asset === "saque2" ? "bg-brand-violet/20 text-brand-violet" : "bg-primary/20 text-primary")}>{ASSET_NAME[e.asset]}</span>
            <span className="font-semibold">{rotuloDia(state.assets[e.asset], e.asset, Math.max(0, e.day - 1))}</span>
            <span className="min-w-0 flex-1 text-muted-foreground">{tipoLabel(e.tipo, e.asset)} · {date}{extra}{typeof e.spread === "number" && Math.abs(e.spread) >= 0.005 && <> · spread <span className={e.spread >= 0 ? "text-market-up" : "text-market-down"}>{fmtSigned(e.spread)}</span></>}</span>
            <span className={e.delta >= 0 ? "text-market-up" : "text-market-down"}>líq. {fmtSigned(e.delta)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- backup e notas ---------- */

function BackupMenu({ state, mutate, save, onApplied, isAdmin, officialAcceptedAt, mesaAtiva }: { state: State; mutate: (fn: (s: State) => void) => void; save: (v: string, acceptedAt?: string) => Promise<boolean>; onApplied: (s: State) => void; isAdmin: boolean; officialAcceptedAt: string | null; mesaAtiva: MesaFuturos }) {
  const [published, setPublished] = useState<{ payload: ReturnType<typeof buildOfficialParams>; updatedAt: string } | null>(null);
  const [officialBusy, setOfficialBusy] = useState(false);
  const [officialMessage, setOfficialMessage] = useState("");
  const [acceptedAt, setAcceptedAt] = useState<string | null>(officialAcceptedAt);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const refreshPublished = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) return;
        const response = await fetch(`/api/plataforma/parametros-oficiais?mesa=${mesaAtiva}`, { headers: { authorization: "Bearer " + data.session.access_token }, cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as { published?: { payload: unknown; updatedAt: string } | null };
        if (active && result.published && isOfficialParams(result.published.payload)) setPublished({ payload: result.published.payload, updatedAt: result.published.updatedAt });
      } catch { /* keep personal parameters unchanged */ }
    };
    void refreshPublished();
    window.addEventListener("wow-official-parameters-published", refreshPublished);
    return () => { active = false; window.removeEventListener("wow-official-parameters-published", refreshPublished); };
  }, []);
  async function publishOfficial(): Promise<boolean> {
    if (!window.confirm("Publicar os parâmetros desta banca como nova versão oficial?")) return false;
    setOfficialBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw Error("Sessão expirada");
      const response = await fetch("/api/plataforma/parametros-oficiais", {
        method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + data.session.access_token },
        body: JSON.stringify({ payload: buildOfficialParams(state, new Date().toISOString(), mesaAtiva) }),
      });
      if (!response.ok) throw Error("Não foi possível publicar");
      setOfficialMessage("Parâmetros publicados na nuvem.");
      window.dispatchEvent(new Event("wow-official-parameters-published"));
      return true;
    } catch { setOfficialMessage("Falha ao publicar. Tente novamente."); return false; }
    finally { setOfficialBusy(false); }
  }
  useEffect(() => {
    if (!isAdmin) return;
    const target = window as Window & { __wowOfficialParams?: () => Promise<boolean> };
    target.__wowOfficialParams = publishOfficial;
    return () => { delete target.__wowOfficialParams; };
  });
  async function acceptOfficial() {
    if (!published || officialBusy || !window.confirm("Aplicar os parâmetros oficiais? Seus saldos, depósitos e histórico serão preservados.")) return;
    setOfficialBusy(true);
    try {
      const next = structuredClone(state);
      if ((published.payload.mesaFuturos ?? "tradefive") !== mesaAtiva) throw Error("wrong_desk");
      applyOfficialParams(next, published.payload);
      const ok = await save(JSON.stringify(next), published.updatedAt);
      if (!ok) throw Error("save_failed");
      onApplied(next);
      setAcceptedAt(published.updatedAt);
      setOfficialMessage("Parâmetros aplicados e salvos na nuvem.");
    } catch {
      setOfficialMessage("Não foi possível salvar os parâmetros. Seus números foram mantidos.");
    } finally { setOfficialBusy(false); }
  }
  const officialFileRef = useRef<HTMLInputElement>(null);
  function exportarParametrosOficiais() {
    const payload = buildOfficialParams(state, new Date().toISOString(), mesaAtiva);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `WinOrWin_Parametros_${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
  }
  function importarParametrosOficiais(file: File, input: HTMLInputElement) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload: unknown = JSON.parse(String(reader.result));
        if (!isOfficialParams(payload)) {
          alert("Arquivo inválido. Selecione um JSON oficial de parâmetros WinOrWin.");
          return;
        }
        if (!window.confirm("Importar os parâmetros oficiais? Isso substituirá os parâmetros e os dias operacionais desta banca, mas preservará histórico, saldos e dados pessoais.")) return;
        if ((payload.mesaFuturos ?? "tradefive") !== mesaAtiva) { window.alert("Este arquivo pertence a outra mesa de futuros."); return; }
        mutate((current) => applyOfficialParams(current, payload));
        alert("Parâmetros oficiais importados. Seu histórico e seus saldos foram preservados.");
      } catch { alert("Não foi possível ler esse arquivo de parâmetros."); }
      finally { input.value = ""; }
    };
    reader.readAsText(file);
  }
  return (
    <>
    {published && acceptedAt !== published.updatedAt && dismissedAt !== published.updatedAt && <aside role="status" className="fixed right-4 top-20 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-cyan-400 bg-[#06192b] p-4 text-white shadow-2xl">
      <p className="font-semibold text-cyan-200">Novos parâmetros oficiais disponíveis</p>
      <p className="my-2 text-xs">Você decide se quer atualizar sua banca.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={officialBusy} onClick={() => void acceptOfficial()}>Atualizar parâmetros</Button><Button type="button" size="sm" variant="outline" onClick={() => setDismissedAt(published.updatedAt)}>Manter meus números</Button></div>
    </aside>}
    <details className="mt-6 rounded-lg border bg-card p-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">{published && acceptedAt !== published.updatedAt && dismissedAt !== published.updatedAt ? "🔔 Novos parâmetros oficiais disponíveis — toque para decidir" : "Backup e dados"}</summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {published && acceptedAt !== published.updatedAt && dismissedAt !== published.updatedAt && <div className="w-full rounded-lg border border-cyan-500/50 bg-cyan-950/30 p-3">
          <p className="mb-2 font-semibold text-cyan-200">Novos parâmetros oficiais disponíveis</p>
          <p className="mb-2 text-xs text-slate-300">Você decide se quer receber os novos números. Suas alterações não serão substituídas automaticamente.</p>
          <Button type="button" size="sm" disabled={officialBusy} onClick={() => void acceptOfficial()}>Atualizar parâmetros</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDismissedAt(published.updatedAt)}>Manter meus números</Button>
        </div>}
        {officialMessage && <p role="status" className="w-full text-xs text-cyan-200">{officialMessage}</p>}
        {isAdmin && <Button type="button" variant="outline" size="sm" onClick={exportarParametrosOficiais}>exportar parâmetros oficiais (.json)</Button>}
        <Button type="button" variant="outline" size="sm" onClick={() => officialFileRef.current?.click()}>importar parâmetros oficiais</Button>
        <ConfirmButton variant="ghost" className="text-destructive" confirmText="clique de novo (apaga tudo)" onConfirm={() => mutate((s) => Object.assign(s, defaultState()))}>limpar todos os dados salvos</ConfirmButton>
        <input ref={officialFileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0]; if (file) importarParametrosOficiais(file, e.currentTarget);
        }} />
      </div>
    </details>
    </>
  );
}

function StrategyNotes() {
  return (
    <details className="mt-3 rounded-lg border bg-card p-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Como funciona a estratégia</summary>
      <div className="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>Hedge entre a mesa proprietária de futuros e a corretora CFD: o objetivo é <strong>reprovar a mesa</strong>. Cada reprovação gera cerca de $200 brutos no CFD — $100 cobrem a taxa da mesa e ~$100 ficam de lucro líquido.</p>
        <p>A mesa precisa ter <strong>somente limite geral EOD</strong> (só se move no fim do dia). Mesa com limite diário não serve.</p>
        <p><strong>Profit</strong>: bateu a meta do dia e avança para o próximo dia. No último dia, a conta é aprovada (ou o saque é gerado, no Saque 2). <strong>Stop</strong>: reprovou — o bruto entra no saldo e o ciclo reinicia no D1.</p>
        <p>Se a conta passar em todos os dias, perde-se o que foi depositado no CFD, mas o saque da mesa devolve esse valor e ainda sobra uma conta financiada. A aba <strong>Saque 2</strong> calcula o próximo saque, que custa bem menos no CFD que o primeiro ciclo.</p>
        <p>O histórico é único, somando Nasdaq, Gold e Saque 2. Tudo é salvo automaticamente na sua conta.</p>
      </div>
    </details>
  );
}

function AportePanel({ asset, assetKey, calcs }: { asset: Asset; assetKey: AssetKey; calcs: ReturnType<typeof computeAssetCalcs> }) {
  const [dia, setDia] = useState(Math.max(0, Math.min(asset.attempt.currentDayIndex, asset.days.length - 1)));
  const [pct, setPct] = useState("100");
  const [banca, setBanca] = useState("1200");
  const d = asset.days[dia];
  if (!d) return <p className="text-muted-foreground">Cadastre os dias do ciclo em Parâmetros para usar a calculadora.</p>;
  const margem = (asset.params.marginPerLot || 0) * d.lotes;
  const stopout = asset.params.stopoutPct ?? 30;
  const custoDia = calcs[dia]?.custoSePassar ?? 0;
  const r = calcAporteFracionado({ margem, stopoutPct: stopout, custoDia, bonusPct: parseNum(pct), bonusCap: asset.bonus.bonusCap, bancaIntegral: parseNum(banca) });
  const money = (v: number) => `$${fmt(v)}`;
  const ownPct = r.total > 0 ? Math.min(100, Math.max(0, r.proprio / r.total * 100)) : 0;
  const bonusPctBar = r.total > 0 ? Math.min(100 - ownPct, Math.max(0, r.bonus / r.total * 100)) : 0;
  const fields = [
    { label: "Dia do ciclo", content: <select value={dia} onChange={(e) => setDia(Number(e.target.value))} className="mt-1.5 w-full rounded-xl border border-cyan-950 bg-[#030b15] px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/70">{asset.days.map((x, i) => <option key={i} value={i}>{rotuloDia(asset, assetKey, i)} · {x.lotes} lotes{i === asset.attempt.currentDayIndex ? " (atual)" : ""}</option>)}</select> },
    { label: "Bônus da corretora (%)", content: <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1.5 w-full rounded-xl border border-cyan-950 bg-[#030b15] px-3 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400/70" /> },
    { label: "Banca integral para comparar ($)", content: <input inputMode="decimal" value={banca} onChange={(e) => setBanca(e.target.value)} className="mt-1.5 w-full rounded-xl border border-cyan-950 bg-[#030b15] px-3 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400/70" /> },
  ];
  return (
    <section className="relative isolate space-y-4 overflow-hidden rounded-2xl border border-cyan-800/60 bg-[radial-gradient(ellipse_at_95%_0%,rgba(0,190,255,0.13),transparent_38%),linear-gradient(145deg,#081626_0%,#050c17_58%,#071321_100%)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:space-y-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 -z-10 size-56 rounded-full border border-cyan-400/10" />
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-gradient-to-br from-blue-700/70 to-cyan-950 text-cyan-300 shadow-[0_0_25px_rgba(0,150,255,0.15)]">
          <Calculator aria-hidden="true" className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300/85">Planejamento de capital</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-50 sm:text-2xl">Aporte financeiro</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-blue-100/65">Calcule o capital necessário para suportar a margem, o stop-out e a perda projetada do dia — separando seu dinheiro do bônus promocional.</p>
        </div>
        <div className="rounded-xl border border-cyan-900/80 bg-[#06101f]/90 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-blue-100/50">Dia selecionado</p>
          <p className="mt-0.5 font-mono text-lg font-bold text-cyan-300">{rotuloDia(asset, assetKey, dia)}</p>
        </div>
      </header>

      <section className="rounded-xl border border-cyan-950/90 bg-[#06101f]/85 p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg border border-blue-400/15 bg-blue-400/10 text-blue-300"><Layers aria-hidden="true" className="size-4" /></div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">Configurar simulação</h3>
            <p className="text-xs text-blue-100/50">Altere os valores para recalcular os resultados.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => <label key={field.label} className="block min-w-0 text-xs font-medium text-blue-100/75">{field.label}{field.content}</label>)}
        </div>
      </section>

      <section className="rounded-xl border border-cyan-700/40 bg-[linear-gradient(120deg,rgba(0,190,255,0.08),transparent_60%),#071321] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Aporte próprio estimado</p>
            <h3 className="mt-2 font-mono text-3xl font-extrabold tracking-tight text-cyan-200 sm:text-4xl">{money(r.proprio)}</h3>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-blue-100/60">Este é o valor estimado que sai do seu bolso. O bônus é mostrado separadamente e não é somado ao aporte próprio.</p>
          </div>
          <div className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300 sm:flex"><Wallet aria-hidden="true" className="size-5" /></div>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-blue-100/65">Composição do valor necessário</span>
            <span className="font-mono font-semibold text-slate-100">{money(r.total)}</span>
          </div>
          <div className="flex h-3.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-cyan-400 transition-all" style={{ width: `${ownPct}%` }} />
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${bonusPctBar}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <span className="flex items-center gap-2 text-blue-100/75"><span className="size-2.5 rounded-sm bg-cyan-400" />Seu dinheiro <strong className="font-mono text-cyan-200">{money(r.proprio)}</strong></span>
            <span className="flex items-center gap-2 text-blue-100/75"><span className="size-2.5 rounded-sm bg-amber-400" />Bônus estimado <strong className="font-mono text-amber-200">{money(r.bonus)}</strong></span>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-cyan-950 bg-[radial-gradient(ellipse_at_top_right,rgba(0,190,255,0.08),transparent_65%),#0a1422] p-4">
          <div className="flex items-center gap-2 text-sm text-blue-100/70"><Target aria-hidden="true" className="size-4 text-cyan-300" />Total necessário no CFD</div>
          <p className="mt-3 break-words font-mono text-2xl font-extrabold text-slate-50 sm:text-3xl">{money(r.total)}</p>
          <p className="mt-2 text-xs leading-relaxed text-blue-100/45">Margem com stop-out, mais a perda estimada se a mesa passar neste dia.</p>
        </article>
        <article className="rounded-xl border border-amber-500/20 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.09),transparent_65%),#0a1422] p-4">
          <div className="flex items-center gap-2 text-sm text-blue-100/70"><Wallet aria-hidden="true" className="size-4 text-amber-300" />Bônus da corretora</div>
          <p className="mt-3 break-words font-mono text-2xl font-extrabold text-amber-200 sm:text-3xl">{money(r.bonus)}</p>
          <p className="mt-2 text-xs leading-relaxed text-blue-100/45">Crédito promocional estimado, limitado ao teto de {money(asset.bonus.bonusCap)}.</p>
        </article>
        <article className="rounded-xl border border-emerald-500/20 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.09),transparent_65%),#0a1422] p-4">
          <div className="flex items-center gap-2 text-sm text-blue-100/70"><TrendingUp aria-hidden="true" className="size-4 text-emerald-300" />Economia frente à banca integral</div>
          <p className="mt-3 break-words font-mono text-2xl font-extrabold text-emerald-300 sm:text-3xl">{money(r.economia)}</p>
          <p className="mt-2 text-xs leading-relaxed text-blue-100/45">Diferença entre a banca integral informada e o aporte próprio estimado.</p>
        </article>
        <article className="rounded-xl border border-cyan-950 bg-[#0a1422] p-4">
          <div className="flex items-center gap-2 text-sm text-blue-100/70"><ShieldCheck aria-hidden="true" className="size-4 text-cyan-300" />Premissas do dia</div>
          <div className="mt-3 space-y-2 text-xs text-blue-100/65">
            <div className="flex items-center justify-between gap-3"><span>Margem ({d.lotes} lotes)</span><strong className="font-mono text-slate-100">{money(margem)}</strong></div>
            <div className="flex items-center justify-between gap-3"><span>Stop-out ({fmt(stopout)}%)</span><strong className="font-mono text-slate-100">{money(margem * stopout / 100)}</strong></div>
            <div className="flex items-center justify-between gap-3"><span>Perda se passar</span><strong className="font-mono text-rose-300">{money(custoDia)}</strong></div>
            <div className="flex items-center justify-between gap-3 border-t border-cyan-950 pt-2"><span>Teto de bônus</span><strong className="font-mono text-amber-200">{money(asset.bonus.bonusCap)}</strong></div>
          </div>
        </article>
      </div>
      <p className="flex items-start gap-2 rounded-xl border border-cyan-950/80 bg-[#050d19]/80 p-3 text-xs leading-relaxed text-blue-100/55"><ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-300" />Estimativa de planejamento: o depósito próprio e o bônus são parcelas distintas. Os valores são recalculados conforme o dia, os lotes, a margem, o stop-out, a perda projetada e o teto de bônus.</p>
    </section>
  );
}

/** O usuário escolhe explicitamente quais bancas planeja operar ao mesmo tempo. */
function SimuladorConsolidado({ bancas, estadoAtivo, bancaAtivaId, ativoAtual, bonusPct }: {
  bancas: Banca[]; estadoAtivo: State; bancaAtivaId?: string | undefined; ativoAtual: AssetKey; bonusPct: number;
}) {
  const [escolhas, setEscolhas] = useState<Record<string, AssetKey | "nenhum">>(
    () => bancaAtivaId ? { [bancaAtivaId]: ativoAtual } : {},
  );
  const [margemObservada, setMargemObservada] = useState("");
  const [folgaEstresse, setFolgaEstresse] = useState("20");
  const ativosPorBanca: Record<string, AssetKey | undefined> = {};
  for (const banca of bancas) {
    const ativo = escolhas[banca.id];
    if (ativo && ativo !== "nenhum") ativosPorBanca[banca.id] = ativo;
  }
  const bonusDoAtivo = estadoAtivo.assets[ativoAtual].bonus;
  const espacoBonus = Math.max(0, bonusDoAtivo.bonusCap - bonusDoAtivo.bonusGanhoTotal);
  const cenario = calcularCoberturaSimultanea({
    bancas, ativosPorBanca, estadoAtivo, bancaAtivaId, bonusPct, bonusCapRestante: espacoBonus,
    margemObservadaGoldPorLote: margemObservada.trim() ? parseNum(margemObservada) : undefined,
    folgaMargemPct: parseNum(folgaEstresse),
  });
  return (
    <section className="rounded-xl border border-amber-700/40 bg-[#101a29] p-4">
      <h3 className="text-sm font-bold text-amber-100">Simulador de bancas simultâneas</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">Selecione manualmente os dias que pretende operar ao mesmo tempo, inclusive em outras mesas. A plataforma não detecta posições abertas no MT5. O saldo Forex é descontado uma única vez.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {bancas.map((b) => (
          <label key={b.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-cyan-950 bg-[#081321] p-2 text-xs">
            <span className="min-w-0 truncate font-semibold text-blue-100">{b.nome}</span>
            <select aria-label={"Operação simulada da banca " + b.nome} className="max-w-[160px] rounded border border-cyan-900 bg-[#071426] p-1 text-xs text-white" value={escolhas[b.id] ?? "nenhum"} onChange={(e) => setEscolhas((prev) => ({ ...prev, [b.id]: e.target.value as AssetKey | "nenhum" }))}>
              <option value="nenhum">Não incluir</option>
              <option value="ouro">Gold</option>
              <option value="nasdaq">Nasdaq</option>
              <option value="saque2">Saque 2</option>
            </select>
          </label>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-blue-100/80">Margem observada no MT5 por 1 lote de Gold (US$)
          <input inputMode="decimal" value={margemObservada} placeholder="Ex.: 822,80" onChange={(e) => setMargemObservada(e.target.value)} className="mt-1 w-full rounded-lg border border-cyan-900 bg-[#071426] p-2 font-mono text-white" />
        </label>
        <label className="text-xs text-blue-100/80">Folga adicional para simulação de estresse (%)
          <input inputMode="decimal" value={folgaEstresse} onChange={(e) => setFolgaEstresse(e.target.value)} className="mt-1 w-full rounded-lg border border-cyan-900 bg-[#071426] p-2 font-mono text-white" />
        </label>
      </div>
      <p className="mt-2 text-xs text-slate-400">A margem observada é usada apenas se for maior que a cadastrada; o valor salvo nos parâmetros não muda. A folga adicional se aplica à parcela de margem, não à perda projetada.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p className="text-[11px] text-slate-400">Cobertura das posições</p><p className="font-mono text-lg font-bold text-white">${fmt(cenario.necessario)}</p></div>
        <div><p className="text-[11px] text-slate-400">Saldo + bônus atual</p><p className="font-mono text-lg font-bold text-cyan-300">${fmt(cenario.disponivel)}</p></div>
        <div><p className="text-[11px] text-slate-400">Falta sem bônus novo</p><p className="font-mono text-lg font-bold text-amber-200">${fmt(cenario.aporteSemBonusNovo)}</p></div>
        <div><p className="text-[11px] text-slate-400">Aporte com bônus futuro*</p><p className="font-mono text-lg font-bold text-emerald-300">${fmt(cenario.aporteComBonusNovo)}</p></div>
      </div>
      <div className="mt-3 rounded-lg border border-amber-700/40 bg-[#0c1625] p-3">
        <p className="text-xs font-semibold text-amber-200">Cenário com margem MT5 e folga adicional (estresse)</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><p className="text-[11px] text-slate-400">Cobertura exigida</p><p className="font-mono text-lg font-bold text-white">${fmt(cenario.necessarioEstresse)}</p></div>
          <div><p className="text-[11px] text-slate-400">Aporte sem bônus futuro</p><p className="font-mono text-lg font-bold text-amber-200">${fmt(cenario.aporteEstresseSemBonusNovo)}</p></div>
          <div><p className="text-[11px] text-slate-400">Aporte considerando bônus futuro*</p><p className="font-mono text-lg font-bold text-emerald-300">${fmt(cenario.aporteEstresseComBonusNovo)}</p></div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Este cenário não é uma exigência oficial da corretora e não substitui a conferência da margem livre no MT5.</p>
      </div>
      <p className="mt-3 text-xs text-slate-400">Posições simuladas: {cenario.linhas.length}. Os valores pressupõem que todas as posições selecionadas estejam simultaneamente expostas à perda planejada. *Bônus futuro é hipotético e depende das condições reais da corretora; não é garantia de margem disponível. Não abrir operações somente com base nesta simulação.</p>
    </section>
  );
}

function CaixaPanel({ asset, state, bancasGlobais, bancaAtivaId, assetKey, bonusPct, setBonusPct }: { asset: Asset; state: State; bancasGlobais?: Banca[] | undefined; bancaAtivaId?: string | undefined; assetKey: AssetKey; bonusPct: string; setBonusPct: (value: string) => void }) {
  if (!asset.days.length) return <p className="text-muted-foreground">Cadastre os dias do ciclo em Parâmetros para ver o caixa.</p>;
  const r = calcCaixaCiclo(asset, assetKey, parseNum(bonusPct));
  const items: [string, number, string, string][] = [
    ["Caixa próprio máximo disponível", r.caixaMaximo, "text-cyan-300", "Taxa da mesa + todos os depósitos próprios do cenário"],
    ["Total depositado no CFD", r.totalDepositado, "text-slate-100", "Garantia operacional; não significa perda total"],
    ["Perda total no CFD", r.totalPerda, "text-rose-300", "Cenário em que a mesa passa por todos os dias"],
    ["Perda do depósito próprio", r.perdaPropriaTotal, "text-rose-300", "Parte das perdas coberta pelo seu dinheiro"],
    ["Perda do bônus", r.perdaBonusTotal, "text-amber-300", "Parte das perdas coberta pelo crédito promocional"],
    ["Saldo próprio recuperável", r.proprioRecuperavel, "text-emerald-300", "Dinheiro que sobra no CFD e pode ser sacado"],
    ["Bônus recebido no ciclo", r.bonusTotal, "text-amber-300", `Limitado ao teto de ${fmt(asset.bonus.bonusCap)}`],
    ["Recuperação total no fim", r.recuperado, "text-emerald-300", `Saque da mesa ${fmt(r.saque)} + saldo próprio recuperável`],
    ["Resultado do ciclo", r.resultadoFinal, r.resultadoFinal >= 0 ? "text-emerald-300" : "text-rose-300", "Valor recuperado menos o caixa próprio utilizado"],
  ];
  const money = (value: number) => `${value < 0 ? "−" : ""}$${fmt(Math.abs(value))}`;
  return (
    <section className="relative isolate space-y-5 overflow-hidden rounded-2xl border border-cyan-800/60 bg-[radial-gradient(ellipse_at_95%_0%,rgba(0,190,255,0.13),transparent_38%),linear-gradient(145deg,#081626_0%,#050c17_58%,#071321_100%)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 -z-10 size-56 rounded-full border border-cyan-400/10" />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-gradient-to-br from-blue-700/70 to-cyan-950 text-cyan-300 shadow-[0_0_25px_rgba(0,150,255,0.15)]">
            <Wallet aria-hidden="true" className="size-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Planejamento financeiro</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-50 sm:text-2xl">Caixa do ciclo</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-blue-100/65">Veja quanto capital próprio pode ser necessário, quanto pode ser perdido e o que permanece recuperável no cenário completo.</p>
          </div>
        </div>
        <div className="min-w-[150px] rounded-xl border border-cyan-900/80 bg-[#06101f]/90 p-3">
          <label className="block text-xs font-medium text-blue-100/70">Bônus da corretora (%)</label>
          <input inputMode="decimal" value={bonusPct} onChange={(e) => setBonusPct(e.target.value)} className="mt-1 w-full rounded-lg border border-cyan-900/80 bg-[#030b15] px-3 py-2 font-mono text-lg font-bold text-slate-50 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15" />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value, tone, helper], index) => (
          <article key={label} className={cn("relative min-w-0 overflow-hidden rounded-xl border p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition-colors", index === 2 ? "border-rose-500/35 bg-[radial-gradient(ellipse_at_top_right,rgba(244,63,94,0.12),transparent_65%),#0a1422]" : index === 5 || index === 7 ? "border-emerald-500/25 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.10),transparent_65%),#0a1422]" : "border-cyan-950 bg-[radial-gradient(ellipse_at_top_right,rgba(0,190,255,0.07),transparent_65%),#0a1422]")}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm leading-snug text-blue-100/70">{label}</p>
              {index === 2 ? <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-rose-300/80" /> : <Wallet aria-hidden="true" className="size-4 shrink-0 text-cyan-400/70" />}
            </div>
            <p className={cn("mt-3 break-words font-mono text-2xl font-extrabold tracking-tight sm:text-3xl", tone)}>{money(value)}</p>
            <p className="mt-2 text-xs leading-relaxed text-blue-100/45">{helper}</p>
          </article>
        ))}
      </div>

      {bancasGlobais && bancasGlobais.length > 0 && <SimuladorConsolidado key={assetKey} bancas={bancasGlobais} estadoAtivo={state} bancaAtivaId={bancaAtivaId} ativoAtual={assetKey} bonusPct={parseNum(bonusPct)} />}

      <div className="overflow-hidden rounded-xl border border-cyan-950/90 bg-[#050d19]/85">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-950/90 px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-100">Projeção dia a dia</h3>
            <p className="mt-0.5 text-xs text-blue-100/50">Depósitos, bônus e perdas estimadas em cada etapa.</p>
          </div>
          <span className="rounded-full border border-cyan-900/80 bg-cyan-950/40 px-2.5 py-1 text-[11px] font-medium text-cyan-200">{r.dias.length ? `${rotuloDia(asset, assetKey, 0)} até ${rotuloDia(asset, assetKey, r.dias.length - 1)}` : "Sem dias"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-[#081727] text-left text-[11px] uppercase tracking-wide text-blue-100/55">
              <tr>{["Dia", "Necessário CFD", "Saldo antes", "Depositar", "Bônus", "Perda total", "Perda própria", "Perda bônus", "Caixa acumulado"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {r.dias.map((d) => (
                <tr key={d.dia} className="border-t border-cyan-950/70 text-slate-200/85 transition-colors hover:bg-cyan-950/20">
                  <td className="px-3 py-3 font-bold text-cyan-300">{rotuloDia(asset, assetKey, d.dia - 1)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{money(d.necessario)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{money(d.saldoAntes)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-cyan-300">{money(d.deposito)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-amber-300">{money(d.bonusGanho)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-rose-300">{money(d.perda)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-rose-200/80">{money(d.perdaPropria)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-amber-200/80">{money(d.perdaBonus)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono">{money(d.caixaAcumulado)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-cyan-900 bg-[#081727] font-semibold">
              <tr>
                <td className="px-3 py-3 text-blue-100/80" colSpan={5}>Perdas acumuladas no ciclo</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-rose-300">{money(r.totalPerda)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-rose-200">{money(r.perdaPropriaTotal)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-amber-300">{money(r.perdaBonusTotal)}</td>
                <td className="px-3 py-3 text-blue-100/40">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <details className="group rounded-xl border border-cyan-950/90 bg-[#050d19]/75 p-4">
        <summary className="cursor-pointer list-none font-semibold text-blue-100/80 marker:hidden">
          <span className="flex items-center justify-between gap-3">Premissas do cálculo <ChevronRight aria-hidden="true" className="size-4 text-cyan-400 transition-transform group-open:rotate-90" /></span>
        </summary>
        <ul className="mt-3 space-y-2 border-t border-cyan-950/80 pt-3 text-xs leading-relaxed text-blue-100/55">
          <li>• Usa o setup salvo desta aba: dias, lotes, contratos, margem por lote (${fmt(asset.params.marginPerLot)}), stop out (${fmt(asset.params.stopoutPct)}%), taxa da mesa (${fmt(r.taxa)}) e saque esperado (${fmt(r.saque)}).</li>
          <li>• Pior cenário de caixa: a mesa passa em todos os dias até aprovar. Se reprovar antes, o caixa utilizado tende a ser menor.</li>
          <li>• O total depositado no CFD é margem de garantia, não perda total. As perdas são separadas entre depósito próprio e bônus; o saldo próprio que sobra permanece recuperável.</li>
          <li>• Cada dia precisa no CFD: margem × (1 + stop out) + a perda do CFD se a mesa passar. Só se deposita o que falta sobre o saldo que já está lá.</li>
          <li>• Bônus de ${fmt(parseNum(bonusPct))}% sobre cada depósito, até o teto de $${fmt(asset.bonus.bonusCap)}. A perda consome primeiro o seu dinheiro e depois o bônus.</li>
          <li>• O ciclo começa com a corretora zerada; o saldo atual da banca não entra na conta.</li>
          <li>• No fim, você recupera o saque da mesa e o depósito próprio que sobrou no CFD. O bônus não pode ser sacado.</li>
        </ul>
      </details>
    </section>
  );
}