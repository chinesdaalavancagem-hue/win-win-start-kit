import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { registrarAuditoria } from "@/lib/auditoria-registro";
import {
  type AssetKey, type State, type TabKey, type Asset,
  aplicarDeposito, aplicarSaque, calcAporteFracionado, calcCaixaCiclo, clampDayIndex, computeAssetCalcs, defaultState, fmt, fmtSigned, handleProfit, handleStop,
  historicoTotals, isValidState, normalizeState, parseNum, projetarZeragemBonus, resetBonus, tipoLabel, undoLast,
} from "@/lib/platform/engine";

type Section = "operacoes" | "parametros" | "bonus" | "aporte" | "caixa";
type Sync = { mode: "ok" | "busy" | "err"; text: string };

const TABS: { key: TabKey; label: string; dot: string }[] = [
  { key: "nasdaq", label: "Nasdaq", dot: "bg-primary" },
  { key: "ouro", label: "Ouro", dot: "bg-brand-gold" },
  { key: "saque2", label: "Saque 2", dot: "bg-brand-violet" },
  { key: "historico", label: "Histórico", dot: "bg-muted-foreground" },
];
const ASSET_NAME: Record<AssetKey, string> = { nasdaq: "NASDAQ", ouro: "OURO", saque2: "SAQUE 2" };

export function Platform({ load, save, isAdmin }: { load: () => Promise<string | null>; save: (v: string) => Promise<boolean>; isAdmin: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [section, setSection] = useState<Section>("operacoes");
  const [sync, setSync] = useState<Sync>({ mode: "busy", text: "carregando…" });
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
      .then((raw) => {
        let s = defaultState();
        if (raw) { try { const p = JSON.parse(raw); if (isValidState(p)) s = normalizeState(p); } catch { /* usa padrão */ } }
        if (alive) { setState(s); setSync({ mode: "ok", text: "sincronizado (nuvem)" }); }
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
    <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="font-heading text-xl sm:text-2xl">Win or Win Platform</h1>
        <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className={cn("size-2 rounded-full", sync.mode === "ok" && "bg-market-up", sync.mode === "busy" && "bg-brand-gold", sync.mode === "err" && "bg-market-down")} />
          {sync.text}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Digite manualmente os contratos, os lotes do broker CFD e a meta de cada dia.</p>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => mutate((s) => { s.activeTab = t.key; })}
            className={cn("flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
              tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <span className={cn("size-2 rounded-full", t.dot)} />{t.label}
          </button>
        ))}
      </div>

      <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-2 border-b bg-background py-2">
        <span className="min-w-0 text-sm text-muted-foreground">
          {lastOperation ? `${ASSET_NAME[lastOperation.asset]} · D${lastOperation.day} · ${tipoLabel(lastOperation.tipo, lastOperation.asset)}` : "Nenhuma operação registrada"}
        </span>
        <Button type="button" variant="outline" disabled={!lastOperation} onClick={() => mutate((s) => {
          const last = s.log.at(-1);
          if (!last) return;
          undoLast(s);
          s.activeTab = last.asset;
        })}>
          <Undo2 aria-hidden="true" /> Desfazer última operação
        </Button>
      </div>

      {tab === "historico" ? <Historico state={state} mutate={mutate} /> : (
        <AssetView key={tab} state={state} assetKey={tab} section={section} setSection={setSection} mutate={mutate} isAdmin={isAdmin} />
      )}

      <BackupMenu state={state} mutate={mutate} />
      <StrategyNotes />
    </div>
  );
}

/* ---------- pequenos componentes ---------- */

function NumField({ label, value, onChange, readOnly, helper, placeholder }: { label: string; value: number; onChange?: (n: number) => void; readOnly?: boolean; helper?: ReactNode; placeholder?: string }) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input type="text" inputMode="decimal" value={text} readOnly={readOnly} placeholder={placeholder}
        enterKeyHint="done"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setText(String(value)); }}
        onChange={(e) => { setText(e.target.value); onChange?.(parseNum(e.target.value)); }}
        className={cn("w-full rounded-md border bg-input/40 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring", readOnly && "opacity-70")} />
      {helper && <span className="mt-1 block font-mono text-[11px] text-muted-foreground">{helper}</span>}
    </label>
  );
}

function ConfirmButton({ children, confirmText, onConfirm, className, variant = "outline", needsConfirm = true }: { children: ReactNode; confirmText: string; onConfirm: () => void; className?: string; variant?: "outline" | "default" | "destructive" | "ghost"; needsConfirm?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <Button type="button" variant={variant} className={className}
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
  const real = valor.trim() === "" ? teorico : parseNum(valor);
  const spread = real - teorico;
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
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setModo(null); (modo === "profit" ? onProfit : onStop)(real); } else if (e.key === "Escape") setModo(null); }}
        className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-foreground" />
      <p className="mt-1 font-mono text-xs">spread/slippage: <span className={spread >= 0 ? "text-market-up" : "text-market-down"}>{fmtSigned(spread)}</span></p>
      {modo === "profit" && risco && <p className="mt-1 text-xs text-market-down">⚠️ margem em risco</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant={modo === "stop" ? "destructive" : "default"} onClick={() => { setModo(null); (modo === "profit" ? onProfit : onStop)(real); }}>confirmar</Button>
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
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-lg font-semibold", tone === "pos" && "text-market-up", tone === "neg" && "text-market-down")}>{value}</p>
    </div>
  );
}

const Note = ({ children }: { children: ReactNode }) => <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">{children}</p>;

/* ---------- aba de ativo ---------- */

function AssetView({ state, assetKey, section, setSection, mutate, isAdmin }: { state: State; assetKey: AssetKey; section: Section; setSection: (s: Section) => void; mutate: (fn: (s: State) => void) => void; isAdmin: boolean }) {
  const asset = state.assets[assetKey];
  const calcs = useMemo(() => computeAssetCalcs(asset, assetKey), [asset, assetKey]);
  const setP = (k: keyof Asset["params"]) => (v: number) => mutate((s) => { (s.assets[assetKey].params as unknown as Record<string, number>)[k] = v; });
  const bonus = asset.bonus;
  const saldo = (bonus.deposito || 0) + (bonus.bonusAtual || 0);
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

  // projeção dia a dia (igual ao original)
  let cum = saldo, totalMeta = 0, reservaMinima = 0;
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
    const caixaDia = caixaCiclo.dias[i];
    let status: "ok" | "alerta" | "risco" = "ok";
    let statusText = "— sem posição CFD hoje (0 lotes)";
    if (margem > 0 && caixaDia) {
      // Um reset representa retirar o saldo da corretora: depósitos anteriores deixam
      // de contar para os status dos cards. Só valem depósitos registrados depois do último reset.
      const ultimoReset = asset.bonus.log.map((entry) => entry.tipo).lastIndexOf("reset");
      const logAtivo = asset.bonus.log.slice(ultimoReset + 1);
      const depositoRegistradoNoDia = logAtivo
        .filter((entry) => entry.tipo === "deposito" && entry.dia === i + 1)
        .reduce((total, entry) => total + entry.valor, 0);
      const caixaCoberto = caixaDia.deposito <= 0 || depositoRegistradoNoDia >= caixaDia.deposito;
      if (caixaCoberto) {
        status = "ok";
        statusText = caixaDia.deposito <= 0
          ? "✅ não precisa depositar: o saldo projetado já cobre o necessário"
          : `✅ depósito registrado para o dia ${i + 1}; valor projetado coberto`;
      } else if (caixaDia.saldoAntes >= margemTotal) {
        status = "alerta";
        statusText = `⚠️ depósito pendente para o dia ${i + 1}: registrado ${fmt(depositoRegistradoNoDia)} de ${fmt(caixaDia.deposito)} necessário`;
      } else {
        status = "risco";
        statusText = `🔴 registre o depósito do dia ${i + 1}: ${fmt(depositoRegistradoNoDia)} de ${fmt(caixaDia.deposito)} necessário`;
      }
      statusText += ` · depositar hoje: ${fmt(Math.max(0, caixaDia.deposito - depositoRegistradoNoDia))} · saldo antes: ${fmt(caixaDia.saldoAntes)} (próprio: ${fmt(caixaDia.proprioAntes)} + bônus: ${fmt(caixaDia.bonusAntes)}) · bônus do depósito: ${fmt(caixaDia.bonusGanho)} · necessário no CFD: ${fmt(caixaDia.necessario)}`;
    }
    const ativoTicks = assetKey === "saque2" ? (asset.params.ativoReal === "nasdaq" ? "nasdaq" : "ouro") : assetKey;
    const ticks = c.pontos * (ativoTicks === "ouro" ? 10 : 4);
    return { d, c, i, isCurrent: i === asset.attempt.currentDayIndex, status, statusText, ticks, mult: d.mnq > 0 ? (d.lotes / d.mnq) * 100 : 0, caixaDia };
  });
  const visibleRows = isAdmin ? rows : rows.filter((r) => r.isCurrent);
  const displayedTotalMeta = isAdmin ? totalMeta : visibleRows.reduce((total, r) => total + r.d.meta, 0);
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
  ];

  return (
    <div>
      <nav className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Menus da plataforma">
        {sections.map(([k, l]) => (
          <Button key={k} type="button" size="sm" variant={section === k ? "default" : "outline"} aria-pressed={section === k} onClick={() => setSection(k)}>{l}</Button>
        ))}
      </nav>

      {section === "parametros" && (
        <Panel title="Parâmetros">
          {assetKey === "saque2" && (
            <label className="mb-4 block max-w-xs">
              <span className="mb-1 block text-xs text-muted-foreground">Ativo real operado (Saque 2)</span>
              <select value={asset.params.ativoReal === "nasdaq" ? "nasdaq" : "ouro"} className="w-full rounded-md border bg-input/40 px-3 py-2 text-sm"
                onChange={(e) => mutate((s) => {
                  const p = s.assets.saque2.params; const v = e.target.value === "nasdaq" ? "nasdaq" : "ouro";
                  p.ativoReal = v; if (v === "nasdaq") { p.mnq = 2; p.hfm = 1; } else { p.mnq = 10; p.hfm = 100; }
                })}>
                <option value="ouro">Ouro (MGC)</option>
                <option value="nasdaq">Nasdaq</option>
              </select>
            </label>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <NumField label="$/ponto do contrato futuro" value={asset.params.mnq} onChange={setP("mnq")} />
            <NumField label="Broker CFD $/ponto/lote" value={asset.params.hfm} onChange={setP("hfm")} />
            <NumField label="Limite geral EOD da mesa (reprovação $)" value={asset.params.mll} onChange={setP("mll")} helper="só o limite geral, que anda no fim do dia — nunca limite diário" />
            <NumField label="Saldo broker CFD ($)" value={saldo} readOnly helper={`depósito próprio $${fmt(bonus.deposito || 0)} + bônus $${fmt(bonus.bonusAtual || 0)}`} />
            <NumField label="Taxa da mesa (fee $)" value={asset.params.taxa} onChange={setP("taxa")} />
            <NumField label="Lucro líquido desejado ($, sem a taxa)" value={asset.params.lucroDesejado} onChange={setP("lucroDesejado")} />
            <NumField label="Margem exigida por 1 lote ($)" value={asset.params.marginPerLot} onChange={setP("marginPerLot")} />
            <NumField label="Stop-out da corretora (%)" value={asset.params.stopoutPct} onChange={setP("stopoutPct")} />
            <NumField label="Saque esperado por conta aprovada ($)" value={asset.params.saqueAprovada} onChange={setP("saqueAprovada")} />
            <NumField label="Folga extra de segurança p/ saque (%)" value={asset.params.folgaExtraPct} onChange={setP("folgaExtraPct")} />
          </div>
          <h3 className="mb-2 mt-5 text-sm font-semibold">Limite geral EOD por dia do ciclo</h3>
          <p className="mb-3 text-xs text-muted-foreground">Deixe 0 para usar o limite geral acima (${fmt(asset.params.mll)}). Ex.: na conta financiada, após lucro no D4, coloque no D5 o novo limite.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {asset.days.map((d, i) => (
              <NumField key={i} label={`D${i + 1} limite ($)`} value={d.mll ?? 0}
                onChange={(v) => mutate((s) => { const day = s.assets[assetKey].days[i]!; if (v > 0) day.mll = v; else delete day.mll; })}
                helper={d.mll && d.mll > 0 ? "personalizado" : `usa geral $${fmt(asset.params.mll)}`} />
            ))}
          </div>
          <Note>A mesa proprietária precisa ter só limite geral do tipo EOD (ele só se move no fechamento do dia). Mesa com limite diário não serve para esta estratégia. Os pontos até a reprovação variam por dia e aparecem em cada card.</Note>
          <Note>Quando uma conta é aprovada, o primeiro saque devolve o que foi gasto no CFD e ainda gera lucro. Preencha o saque esperado por conta aprovada para a plataforma creditar esse valor automaticamente.</Note>
        </Panel>
      )}

      {section === "aporte" && <AportePanel asset={asset} calcs={calcs} />}
      {section === "caixa" && <CaixaPanel asset={asset} assetKey={assetKey} bonusPct={bonusPct} setBonusPct={setBonusPct} /> }
      {section === "bonus" && <BonusPanel state={state} assetKey={assetKey} reserva={reservaComFolga} folga={folga} mutate={mutate} />}

      {section === "operacoes" && (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Metric label={isAdmin ? "Meta total prop firm" : "Meta do dia atual"} value={`${fmt(displayedTotalMeta)}`} />
            <Metric label={isAdmin ? "Saldo final se passar — broker CFD" : "Saldo CFD se passar hoje"} value={`${fmt(displayedCum)}`} />
          </div>
          <div className="space-y-3">
            {visibleRows.map((r) => (
              <DayCard key={r.i} row={r} assetKey={assetKey} mutate={mutate} excedenteAtualSacavel={excedenteAtualSacavel} />
            ))}
          </div>
          {isAdmin && <Button type="button" variant="outline" className="mt-3 w-full border-dashed" onClick={() => mutate((s) => { s.assets[assetKey].days.push({ mnq: 1, lotes: 1, meta: 150 }); })}>+ adicionar dia</Button>}
        </div>
      )}
    </div>
  );
}

type Row = { d: { mnq: number; lotes: number; meta: number }; c: ReturnType<typeof computeAssetCalcs>[number]; i: number; isCurrent: boolean; status: "ok" | "alerta" | "risco"; statusText: string; ticks: number; mult: number; caixaDia?: ReturnType<typeof calcCaixaCiclo>["dias"][number] | undefined };

function DayCard({ row, assetKey, mutate, excedenteAtualSacavel }: { row: Row; assetKey: AssetKey; mutate: (fn: (s: State) => void) => void; excedenteAtualSacavel: number }) {
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
  return (
    <div ref={ref} className={cn("platform-day-card rounded-lg border bg-card p-4", isCurrent && "border-primary ring-1 ring-primary")}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-sm font-semibold">D{i + 1} {isCurrent && <span className="ml-2 rounded bg-primary px-2 py-0.5 text-[10px] uppercase text-primary-foreground">dia atual</span>}</span>
        <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => mutate((s) => { s.assets[assetKey].days.splice(i, 1); })}>remover</button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumField label="Contratos" value={d.mnq} onChange={setD("mnq")} helper={<>passa <span className="text-market-down">-${fmt(Math.abs(c.passa))}</span></>} />
        <NumField label="Lotes (broker CFD)" value={d.lotes} onChange={setD("lotes")} helper={<>reprova <span className="text-market-up">+${fmt(c.reprova)}</span> · alvo p/ reprova: {fmt(c.pontosReprova * 10)} pontos</>} />
        <NumField label="Meta $" value={d.meta} onChange={setD("meta")} helper={`alvo p/ meta: ${fmt(row.ticks)} ticks`} />
      </div>
      <p className="mt-3 font-mono text-sm">líquido se reprovar hoje <span className={c.bateuAlvo ? "text-market-up" : "text-market-down"}>${fmt(c.liquidoSeReprovar)}</span></p>
      <p className="mt-2 inline-block rounded bg-secondary px-2 py-1 font-mono text-[11px] text-muted-foreground">dívida a recuperar hoje: ${fmt(c.dividaHoje)} (alvo bruto se reprovar: ${fmt(c.alvoBruto)})</p>
      <p className={cn("mt-2 rounded border px-2 py-1 font-mono text-[11px]",
        row.status === "ok" && "border-market-up/40 text-market-up", row.status === "alerta" && "border-brand-gold/40 text-brand-gold", row.status === "risco" && "border-market-down/40 text-market-down")}>{row.statusText}</p>
      {row.caixaDia && d.lotes > 0 && <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 font-mono text-xs sm:grid-cols-3">
        <div><p className="text-muted-foreground">Depositar na corretora hoje</p><p className="mt-1 text-base font-semibold text-market-up">${fmt(row.caixaDia.deposito)}</p></div>
        <div><p className="text-muted-foreground">Saldo próprio no CFD</p><p className="mt-1 text-base font-semibold">${fmt(row.caixaDia.proprioAntes)}</p></div>
        <div><p className="text-muted-foreground">Saldo de bônus no CFD</p><p className="mt-1 text-base font-semibold">${fmt(row.caixaDia.bonusAntes)}</p></div>
        <div><p className="text-muted-foreground">Necessário no CFD</p><p className="mt-1 text-base font-semibold">${fmt(row.caixaDia.necessario)}</p></div>
        <div><p className="text-muted-foreground">Excedente próprio potencialmente sacável</p><p className="mt-1 text-base font-semibold text-market-up">${fmt(excedenteAtualSacavel)}</p></div>
        <div><p className="text-muted-foreground">Bônus deste depósito</p><p className="mt-1 text-base font-semibold">${fmt(row.caixaDia.bonusGanho)}</p></div>
      </div>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-secondary px-2 py-1 font-mono text-[11px] text-muted-foreground">
        <span>Trade Ovate: <span className="text-foreground">{fmt(row.ticks)} ticks</span></span><span>Forex para reprovar: <span className="text-foreground">{fmt(c.pontosReprova * 10)} pontos</span></span>
      </div>
      {isCurrent && <Settle risco={row.status === "risco"} custo={c.custoSePassar} reprova={c.reprova}
        onProfit={(real) => mutate((s) => handleProfit(s, assetKey, real))} onStop={(real) => mutate((s) => handleStop(s, assetKey, real))} />}
    </div>
  );
}

function BonusPanel({ state, assetKey, reserva, folga, mutate }: { state: State; assetKey: AssetKey; reserva: number; folga: number; mutate: (fn: (s: State) => void) => void }) {
  const b = state.assets[assetKey].bonus;
  const [dep, setDep] = useState("");
  const [saq, setSaq] = useState("");
  const total = (b.deposito || 0) + (b.bonusAtual || 0);
  const last = b.log[b.log.length - 1];
  const dateStr = (ts: number) => { const d = new Date(ts); return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
  let ultima = "nenhum depósito ou saque registrado ainda.";
  if (last?.tipo === "deposito") ultima = `última ação: depósito de $${fmt(last.valor)} (+$${fmt(last.bonusGanho || 0)} de bônus) em ${dateStr(last.ts)}`;
  else if (last?.tipo === "saque") ultima = `última ação: saque de $${fmt(last.valor)} (proporção ${fmt((last.proporcao || 0) * 100)}% · bônus reduzido em $${fmt(last.bonusReduzido || 0)}) em ${dateStr(last.ts)}`;
  else if (last) ultima = `última ação: bônus e depósito próprio zerados (bônus $${fmt(last.valor)}${last.depositoZerado ? ` + depósito $${fmt(last.depositoZerado)}` : ""}) em ${dateStr(last.ts)}`;

  const linhas: ReactNode[] = [];
  if (total <= 0 && reserva <= 0) linhas.push("estratégia de saque: registre um depósito e pelo menos 1 dia do ciclo atual pra calcular.");
  else {
    linhas.push(<>composição atual: <strong>{fmt(total > 0 ? (b.deposito / total) * 100 : 0)}% próprio</strong> (${fmt(b.deposito || 0)}) + <strong>{fmt(total > 0 ? (b.bonusAtual / total) * 100 : 0)}% bônus</strong> (${fmt(b.bonusAtual || 0)})</>);
    if ((b.deposito || 0) <= 0 && (b.bonusAtual || 0) > 0) linhas.push("🔴 seu depósito próprio já zerou — a partir de agora, toda perda sai direto do bônus.");
    else if ((b.deposito || 0) > 0 && (b.bonusAtual || 0) > 0) linhas.push(<>faltam <strong>${fmt(b.deposito)}</strong> de depósito próprio pra zerar (a perda consome o próprio inteiro primeiro; só depois tira do bônus).</>);
    if (reserva > 0) {
      linhas.push(<>reserva mínima pros dias que faltam (margem + buffer + {fmt(folga)}% de folga): <strong>${fmt(reserva)}</strong></>);
      const saqueSeguro = (b.deposito || 0) > 0
        ? Math.min(b.deposito, Math.max(0, total - reserva) / (1 + (b.bonusAtual || 0) / b.deposito))
        : 0;
      linhas.push(saqueSeguro > 0 ? <>👉 dá pra sacar até <strong>${fmt(saqueSeguro)}</strong> agora sem comprometer a reserva projetada (considerando a redução proporcional do bônus).</> : "🔴 não sobra espaço pra saque agora — sacar arrisca stop-out.");
    } else linhas.push("sem exigência de margem registrada pros dias restantes — dá pra considerar sacar o saldo com bônus.");
    const proj = projetarZeragemBonus(state, assetKey, b.bonusAtual || 0);
    if ((b.bonusAtual || 0) <= 0) linhas.push("bônus já está zerado.");
    else if (proj) linhas.push(<>no ritmo atual (média de ${fmt(proj.media)}/dia saindo do bônus, últimos {proj.amostras} registros), o bônus deve zerar em ~<strong>{fmt(proj.dias)} dias</strong>.</>);
    else linhas.push("ainda sem histórico de custo suficiente pra projetar quando o bônus zera.");
  }

  return (
    <Panel title="Rastreador de bônus (broker CFD)">
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Metric label="Depósito próprio acumulado" value={`$${fmt(b.deposito)}`} />
        <Metric label="Bônus atual" value={`$${fmt(b.bonusAtual)}`} tone="pos" />
      </div>
      <p className="mb-3 font-mono text-xs text-muted-foreground">espaço restante pra ganhar bônus novo: ${fmt(Math.max(0, b.bonusCap - b.bonusGanhoTotal))} de um teto de ${fmt(b.bonusCap)}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumField label="Bônus máximo do plano ($)" value={b.bonusCap} onChange={(v) => mutate((s) => { if (v) s.assets[assetKey].bonus.bonusCap = v; })} />
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Registrar depósito próprio ($)</span>
          <input inputMode="decimal" value={dep} placeholder="ex: 1000" onChange={(e) => setDep(e.target.value)} className="w-full rounded-md border bg-input/40 px-3 py-2 font-mono text-sm" /></label>
        <Button type="button" className="self-end" onClick={() => { const v = parseNum(dep); mutate((s) => aplicarDeposito(s, assetKey, v)); setDep(""); }}>Aplicar depósito</Button>
        <div className="hidden sm:block" />
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Registrar saque de lucro ($)</span>
          <input inputMode="decimal" value={saq} placeholder="ex: 200" onChange={(e) => setSaq(e.target.value)} className="w-full rounded-md border bg-input/40 px-3 py-2 font-mono text-sm" /></label>
        <div className="flex gap-2 self-end">
          <Button type="button" variant="destructive" className="flex-1" onClick={() => { const v = parseNum(saq); mutate((s) => aplicarSaque(s, assetKey, v)); setSaq(""); }}>Aplicar saque</Button>
          <Button type="button" variant="outline" title="Zerar bônus atual e depósito próprio" onClick={() => mutate((s) => resetBonus(s, assetKey))}>↺</Button>
        </div>
      </div>
      <Note>{ultima}</Note>
      <div className="mt-3 space-y-1 rounded border bg-secondary p-3 font-mono text-xs leading-relaxed text-muted-foreground">
        {linhas.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </Panel>
  );
}

/* ---------- histórico ---------- */

function Historico({ state, mutate }: { state: State; mutate: (fn: (s: State) => void) => void }) {
  const { profit, resultadoReal, custoProprio } = historicoTotals(state);
  const total = state.counts.aprovadas + state.counts.reprovadas;
  const roi = custoProprio > 0 ? (resultadoReal / custoProprio) * 100 : null;
  const base = custoProprio + resultadoReal;
  const margem = base > 0 ? (resultadoReal / base) * 100 : null;
  return (
    <div>
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Contas aprovadas" value={state.counts.aprovadas} tone="pos" />
        <Metric label="Contas reprovadas" value={state.counts.reprovadas} tone="neg" />
        <Metric label="Profit" value={(profit >= 0 ? "+$" : "-$") + fmt(Math.abs(profit))} tone={profit >= 0 ? "pos" : "neg"} />
        <Metric label="Resultado real" value={"-$" + fmt(Math.abs(resultadoReal))} tone="neg" />
      </div>
      <p className="mb-4 font-mono text-xs text-muted-foreground">
        {total > 0 ? `taxa de aprovação: ${fmt((state.counts.aprovadas / total) * 100)}% (${total} ciclo${total === 1 ? "" : "s"} concluído${total === 1 ? "" : "s"})` : "nenhum ciclo concluído ainda — use os botões Profit / Stop nos cards de dia."}
      </p>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Metric label="Custo próprio real (todos os ciclos)" value={`$${fmt(custoProprio)}`} tone="neg" />
        <Metric label="Contas compradas" value={total} />
        <Metric label="ROI (resultado real)" value={roi == null ? "-" : `${roi >= 0 ? "+" : ""}${fmt(roi)}%`} tone={roi == null ? undefined : roi >= 0 ? "pos" : "neg"} />
        <Metric label="Margem do resultado real" value={margem == null ? "-" : `${margem >= 0 ? "+" : ""}${fmt(margem)}%`} tone={margem == null ? undefined : margem >= 0 ? "pos" : "neg"} />
      </div>
      <Chart state={state} />
      <Simulador state={state} />
      <div className="mb-3 flex justify-between">
        {state.log.length > 0 ? <ConfirmButton variant="ghost" confirmText="clique de novo p/ confirmar" onConfirm={() => mutate(undoLast)}>desfazer última ação</ConfirmButton> : <span />}
        <ConfirmButton variant="ghost" className="text-destructive" confirmText="clique de novo (apaga o histórico)" onConfirm={() => mutate((s) => {
          s.log = []; s.cfdBalance = 0; s.totalGasto = 0; s.counts = { aprovadas: 0, reprovadas: 0 };
          for (const k of ["nasdaq", "ouro", "saque2"] as AssetKey[]) { s.assets[k].attempt.currentDayIndex = 0; s.assets[k].attempt.cycleCost = 0; }
        })}>limpar histórico</ConfirmButton>
      </div>
      <LogList state={state} />
    </div>
  );
}

function Chart({ state }: { state: State }) {
  const W = 700, H = 220, padL = 46, padR = 14, padT = 14, padB = 24;
  if (state.log.length === 0) return <div className="mb-4 rounded-lg border bg-card p-8 text-center font-mono text-xs text-muted-foreground">sem eventos registrados ainda</div>;
  const pts = [0, ...state.log.map((e) => e.saldoApos)];
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
          <circle key={e.id} cx={x(i + 1)} cy={y(e.saldoApos)} r={3.5}
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
            <span className="font-semibold">D{e.day}</span>
            <span className="min-w-0 flex-1 text-muted-foreground">{tipoLabel(e.tipo, e.asset)} · {date}{extra}{typeof e.spread === "number" && Math.abs(e.spread) >= 0.005 && <> · spread <span className={e.spread >= 0 ? "text-market-up" : "text-market-down"}>{fmtSigned(e.spread)}</span></>}</span>
            <span className={e.delta >= 0 ? "text-market-up" : "text-market-down"}>líq. {fmtSigned(e.delta)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- backup e notas ---------- */

function BackupMenu({ state, mutate }: { state: State; mutate: (fn: (s: State) => void) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <details className="mt-6 rounded-lg border bg-card p-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground">Backup e dados</summary>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
          const a = document.createElement("a"); a.href = url; a.download = `hedge-multiativo-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
        }}>exportar backup (.json)</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>importar backup</Button>
        <ConfirmButton variant="ghost" className="text-destructive" confirmText="clique de novo (apaga tudo)" onConfirm={() => mutate((s) => Object.assign(s, defaultState()))}>limpar todos os dados salvos</ConfirmButton>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            try {
              const p = JSON.parse(String(r.result));
              if (!isValidState(p)) return alert("Arquivo inválido: não parece um backup desta plataforma.");
              const n = normalizeState(p);
              mutate((s) => Object.assign(s, n));
              alert("Backup importado com sucesso.");
            } catch { alert("Não foi possível ler esse arquivo."); }
            e.target.value = "";
          };
          r.readAsText(f);
        }} />
      </div>
    </details>
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
        <p>O histórico é único, somando Nasdaq, Ouro e Saque 2. Tudo é salvo automaticamente na sua conta.</p>
      </div>
    </details>
  );
}

function AportePanel({ asset, calcs }: { asset: Asset; calcs: ReturnType<typeof computeAssetCalcs> }) {
  const [dia, setDia] = useState(Math.max(0, Math.min(asset.attempt.currentDayIndex, asset.days.length - 1)));
  const [pct, setPct] = useState("100");
  const [banca, setBanca] = useState("1200");
  const d = asset.days[dia];
  if (!d) return <p className="text-muted-foreground">Cadastre os dias do ciclo em Parâmetros para usar a calculadora.</p>;
  const margem = (asset.params.marginPerLot || 0) * d.lotes;
  const stopout = asset.params.stopoutPct ?? 30;
  const custoDia = calcs[dia]?.custoSePassar ?? 0;
  const r = calcAporteFracionado({ margem, stopoutPct: stopout, custoDia, bonusPct: parseNum(pct), bonusCap: asset.bonus.bonusCap, bancaIntegral: parseNum(banca) });
  const items: [string, number, string][] = [
    ["1. Total necessário para aguentar o stop out", r.total, "text-foreground"],
    ["2. Depósito do próprio bolso", r.proprio, "text-primary"],
    ["3. Bônus recebido da corretora", r.bonus, "text-accent-foreground"],
    ["4. Economia de capital próprio em risco", r.economia, "text-primary"],
  ];
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-bold">Calculadora de aporte fracionado</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Dia do ciclo
          <select value={dia} onChange={(e) => setDia(Number(e.target.value))} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5">
            {asset.days.map((x, i) => <option key={i} value={i}>D{i + 1} · {x.lotes} lotes{i === asset.attempt.currentDayIndex ? " (atual)" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm">Bônus da corretora (%)
          <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5" />
        </label>
        <label className="text-sm">Banca integral para comparar ($)
          <input inputMode="decimal" value={banca} onChange={(e) => setBanca(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">Margem ${fmt(margem)} + {fmt(stopout)}% de stop out = ${fmt(margem * (1 + stopout / 100))} · perda CFD se a mesa passar no dia: ${fmt(custoDia)} · teto de bônus: ${fmt(asset.bonus.bonusCap)}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {items.map(([l, v, c]) => (
          <div key={l} className="rounded-md border p-3"><dt className="text-sm text-muted-foreground">{l}</dt><dd className={cn("text-2xl font-bold", c)}>${fmt(v)}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function CaixaPanel({ asset, assetKey, bonusPct, setBonusPct }: { asset: Asset; assetKey: AssetKey; bonusPct: string; setBonusPct: (value: string) => void }) {
  if (!asset.days.length) return <p className="text-muted-foreground">Cadastre os dias do ciclo em Parâmetros para ver o caixa.</p>;
  const r = calcCaixaCiclo(asset, assetKey, parseNum(bonusPct));
  const items: [string, number, string, string][] = [
    ["Caixa próprio máximo disponível", r.caixaMaximo, "text-primary", "o pico de dinheiro seu fora do bolso: taxa + todos os depósitos"],
    ["Total depositado no CFD no ciclo", r.totalDepositado, "text-foreground", "depósito é margem de garantia; não significa que todo esse valor será perdido"],
    ["Perda total no CFD se passar todos os dias", r.totalPerda, "text-destructive", "soma das perdas diárias do CFD, antes de separar a origem do dinheiro"],
    ["Perda do meu depósito próprio", r.perdaPropriaTotal, "text-destructive", "parte das perdas coberta pelo dinheiro depositado por você"],
    ["Perda do bônus da corretora", r.perdaBonusTotal, "text-accent-foreground", "parte das perdas coberta pelo crédito promocional"],
    ["Saldo próprio recuperável no CFD", r.proprioRecuperavel, "text-primary", "parte do dinheiro depositado que sobra na corretora e pode ser sacada de volta"],
    ["Bônus recebido no ciclo", r.bonusTotal, "text-accent-foreground", `limitado ao teto de ${fmt(asset.bonus.bonusCap)}`],
    ["Recuperado no fim", r.recuperado, "text-primary", `saque da mesa ${fmt(r.saque)} + saldo próprio recuperável no CFD ${fmt(r.proprioRecuperavel)}`],
    ["Resultado do ciclo completo", r.resultadoFinal, r.resultadoFinal >= 0 ? "text-primary" : "text-destructive", "recuperado menos o caixa próprio usado"],
  ];
  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-bold">Caixa necessário para o ciclo inteiro</h2>
      <label className="block max-w-xs text-sm">Bônus da corretora (%)
        <input inputMode="decimal" value={bonusPct} onChange={(e) => setBonusPct(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5" />
      </label>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([l, v, c, h]) => (
          <div key={l} className="rounded-md border p-3"><dt className="text-sm text-muted-foreground">{l}</dt><dd className={cn("text-2xl font-bold", c)}>{v < 0 ? "-" : ""}${fmt(Math.abs(v))}</dd><p className="text-xs text-muted-foreground">{h}</p></div>
        ))}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="p-1">Dia</th><th className="p-1">Necessário no CFD</th><th className="p-1">Saldo antes</th><th className="p-1">Depositar</th><th className="p-1">Bônus</th><th className="p-1">Perda total</th><th className="p-1">Perda própria</th><th className="p-1">Perda bônus</th><th className="p-1">Caixa acumulado</th></tr></thead>
          <tbody>{r.dias.map((d) => (
            <tr key={d.dia} className="border-t"><td className="p-1">D{d.dia}</td><td className="p-1">${fmt(d.necessario)}</td><td className="p-1">${fmt(d.saldoAntes)}</td><td className="p-1 font-semibold text-primary">${fmt(d.deposito)}</td><td className="p-1">${fmt(d.bonusGanho)}</td><td className="p-1">${fmt(d.perda)}</td><td className="p-1 text-destructive">${fmt(d.perdaPropria)}</td><td className="p-1">${fmt(d.perdaBonus)}</td><td className="p-1">${fmt(d.caixaAcumulado)}</td></tr>
          ))}</tbody>
          <tfoot>
            <tr className="border-t-2 font-semibold">
              <td className="p-1" colSpan={4}>Totais das perdas no ciclo</td>
              <td className="p-1 text-destructive">${fmt(r.totalPerda)}</td>
              <td className="p-1 text-destructive">${fmt(r.perdaPropriaTotal)}</td>
              <td className="p-1">${fmt(r.perdaBonusTotal)}</td>
              <td className="p-1">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="rounded-md border p-3 text-xs text-muted-foreground">
        <p className="mb-1 font-semibold text-foreground">Premissas do cálculo</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>Usa o setup salvo desta aba: dias, lotes, contratos, margem por lote (${fmt(asset.params.marginPerLot)}), stop out ({fmt(asset.params.stopoutPct)}%), taxa da mesa (${fmt(r.taxa)}) e saque esperado (${fmt(r.saque)}).</li>
          <li>Pior caso de caixa: a mesa passa em todos os dias até aprovar. Se reprovar antes, o CFD devolve dinheiro e o caixa usado é menor.</li>
          <li>O total depositado no CFD é margem de garantia, não perda total. A perda total é separada entre “Perda do meu depósito próprio” e “Perda do bônus”, conforme o saldo disponível em cada dia; o saldo próprio que sobra permanece recuperável na corretora.</li>
          <li>Cada dia precisa no CFD: margem × (1 + stop out) + a perda do CFD se a mesa passar. Só se deposita o que falta sobre o saldo que já está lá.</li>
          <li>Bônus de {fmt(parseNum(bonusPct))}% sobre cada depósito, até o teto de ${fmt(asset.bonus.bonusCap)}. A perda consome primeiro o seu dinheiro e depois o bônus.</li>
          <li>O ciclo começa com a corretora zerada; o saldo atual da banca não entra na conta.</li>
          <li>No fim, você recupera o saque da mesa e o depósito próprio que sobrou no CFD. O bônus não pode ser sacado.</li>
        </ul>
      </div>
    </section>
  );
}
