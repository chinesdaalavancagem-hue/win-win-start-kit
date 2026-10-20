import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Platform } from "./Platform";
import { fmt, fmtSigned, historicoTotals, tipoLabel } from "@/lib/platform/engine";
import { type BancasDoc, aplicarForex, extrairForex, forexDoDocumento, novaBanca, parseBancas, relatorioCsv, resumoBanca } from "@/lib/platform/bancas";
import { Plus, Building2, CheckCircle2, Pencil, Trash2, Download, ArrowUpRight, WalletCards, Activity } from "lucide-react";

export function Bancas({ load, save, isAdmin }: { load: () => Promise<string | null>; save: (v: string) => Promise<boolean>; isAdmin: boolean }) {
  const [doc, setDoc] = useState<BancasDoc | null>(null);
  const [err, setErr] = useState(false);
  const [painel, setPainel] = useState(false);
  const [nome, setNome] = useState("");
  const [taxaAvaliacao, setTaxaAvaliacao] = useState("");
  const docRef = useRef<BancasDoc | null>(null);

  useEffect(() => { load().then((r) => { const d = parseBancas(r); docRef.current = d; setDoc(d); }).catch(() => setErr(true)); }, [load]);

  const persist = useCallback((d: BancasDoc) => { docRef.current = d; setDoc(d); return save(JSON.stringify(d)); }, [save]);

  const activeId = doc?.activeId;
  const loadActive = useCallback(async () => {
    const d = docRef.current; const b = d?.bancas.find((x) => x.id === d.activeId);
    return b ? JSON.stringify(aplicarForex(b.state, forexDoDocumento(d!))) : null;
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveActive = useCallback(async (v: string, acceptedAt?: string) => {
    const d = docRef.current; if (!d) return false;
    const id = activeId;
    const updated = JSON.parse(v);
    const next = { ...d, forex: extrairForex(updated), bancas: d.bancas.map((b) => (b.id === id ? { ...b, state: updated, ...(acceptedAt ? { officialAcceptedAt: acceptedAt } : {}) } : b)) };
    docRef.current = next;
    setDoc(next);
    const ok = await save(JSON.stringify(next));
    if (!ok && acceptedAt && docRef.current === next) { docRef.current = d; setDoc(d); }
    return ok;
  }, [activeId, save]);

  if (err) return <p className="m-auto text-destructive">Falha ao carregar as bancas.</p>;
  if (!doc) return <p className="m-auto text-muted-foreground">Carregando bancas...</p>;
  const ativa = doc.bancas.find((b) => b.id === doc.activeId) ?? doc.bancas[0];
  const profitGeral = doc.bancas.reduce((total, b) => total + historicoTotals(b.state).profit, 0);
  const saldoForex = forexDoDocumento(doc).cfdBalance;
  const eventosGerais = doc.bancas.flatMap((b) => b.state.log.map((evento) => ({ ...evento, bancaId: b.id, bancaNome: b.nome }))).sort((a, b) => b.ts - a.ts);
  if (!ativa) return <p className="m-auto text-destructive">Nenhuma banca disponível.</p>;

  function exportar() {
    const current = docRef.current;
    if (!current) return;
    const url = URL.createObjectURL(new Blob([relatorioCsv(current.bancas)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-bancas-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col bg-[radial-gradient(ellipse_at_top,rgba(0,111,255,0.10),transparent_58%)]">
      <header className="border-b border-cyan-950/80 bg-[#050d1b]/90 px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 shadow-[0_0_24px_rgba(0,190,255,0.08)]"><img src="/logo.png" alt="Win or Win" className="size-[72px] object-contain [filter:hue-rotate(150deg)_saturate(1.25)]" /></div>
            <div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/80">Workspace financeiro</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">Gerenciar bancas</h2><p className="mt-1 text-sm text-slate-400">Organize suas contas, acompanhe resultados e alterne entre ciclos.</p></div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label htmlFor="banca-sel" className="sr-only">Banca ativa</label>
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-cyan-950 bg-[#071426] px-3 py-2.5 sm:min-w-[230px]">
              <Activity className="size-4 shrink-0 text-cyan-300" />
              <select id="banca-sel" value={doc.activeId} onChange={(e) => persist({ ...doc, activeId: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-blue-100 outline-none">
                {doc.bancas.map((b) => <option key={b.id} value={b.id} className="bg-[#071426]">{b.nome}</option>)}
              </select>
              <span className="shrink-0 rounded-md bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Ativa</span>
            </div>
            <Button size="sm" variant="outline" className="h-10 rounded-xl border-cyan-900/80 bg-[#071426] text-blue-100 hover:border-cyan-400 hover:bg-blue-950/60" onClick={() => setPainel(!painel)} aria-expanded={painel}>
              <WalletCards className="size-4" />{painel ? "Fechar gestão" : `Minhas bancas · ${doc.bancas.length}`}
            </Button>
          </div>
        </div>
      </header>
      {painel && (
        <section className="border-b border-cyan-950/70 bg-[#06101f]/80 px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-[1600px] space-y-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">Central de contas</p><h3 className="mt-1 text-lg font-bold text-slate-100">Seu portfólio de bancas</h3><p className="mt-1 max-w-2xl text-sm text-slate-400">Cada banca mantém seu próprio ciclo e histórico. Escolha uma para continuar operando ou crie uma nova.</p></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <form className="flex min-w-0 flex-1 flex-wrap gap-2 sm:min-w-[330px]" onSubmit={(e) => {
                  e.preventDefault(); if (!nome.trim() || !taxaAvaliacao.trim()) return;
                  const valor = Number(taxaAvaliacao.trim().replace(",", "."));
                  if (!Number.isFinite(valor) || valor < 0) return;
                  const b = novaBanca(nome);
                  b.state = aplicarForex(b.state, forexDoDocumento(doc));
                  b.state.assets.nasdaq.params.taxa = valor;
                  b.state.assets.ouro.params.taxa = valor;
                  setNome(""); setTaxaAvaliacao("");
                  persist({ ...doc, activeId: b.id, bancas: [...doc.bancas, b] });
                }}>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da nova banca" aria-label="Nome da nova banca" className="h-10 min-w-0 rounded-xl border-cyan-950 bg-[#071426] text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400" maxLength={60} />
                  <Input type="text" inputMode="decimal" value={taxaAvaliacao} onChange={(e) => setTaxaAvaliacao(e.target.value)} placeholder="Taxa de avaliação ($)" aria-label="Taxa de avaliação em dólares" required className="h-10 min-w-[145px] flex-1 rounded-xl border-cyan-950 bg-[#071426] text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400" />
                  <Button type="submit" className="h-10 shrink-0 rounded-xl bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"><Plus className="size-4" /><span className="hidden sm:inline">Criar banca</span><span className="sm:hidden">Criar</span></Button>
                </form>
                <Button type="button" variant="outline" className="h-10 rounded-xl border-cyan-900/80 bg-[#071426] text-blue-100 hover:border-cyan-400" onClick={exportar}><Download className="size-4" />Exportar CSV</Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {doc.bancas.map((b) => {
                const r = resumoBanca(b);
                const isActive = b.id === doc.activeId;
                return (
                  <article key={b.id} className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[#0b1b30] via-[#081426] to-[#050c17] p-4 transition-colors ${isActive ? "border-cyan-400/70 shadow-[0_0_26px_rgba(0,190,255,0.09)]" : "border-cyan-950/90 hover:border-cyan-800"}`}>
                    {isActive && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-300 via-teal-300 to-emerald-300" />}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${isActive ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-200" : "border-slate-700 bg-slate-800/70 text-slate-400"}`}><Building2 className="size-5" /></div>
                        <div className="min-w-0"><h4 className="truncate font-bold text-slate-100">{b.nome}</h4><p className="mt-0.5 text-xs text-slate-500">{isActive ? "Selecionada para operação" : "Banca cadastrada"}</p></div>
                      </div>
                      {isActive ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300"><CheckCircle2 className="size-3" />Ativa</span> :
                        <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-lg border-cyan-900 bg-[#071426] text-cyan-200 hover:border-cyan-400 hover:bg-cyan-950/50" onClick={() => persist({ ...doc, activeId: b.id })}>Abrir <ArrowUpRight className="size-3.5" /></Button>}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-white/5 bg-black/15 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ciclos</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-100">{r.ciclos}</p></div>
                      <div className="rounded-xl border border-white/5 bg-black/15 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Resultado</p><p className={`mt-1 truncate text-lg font-bold tabular-nums ${r.lucro >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmtSigned(r.lucro)}</p></div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/5 pt-3 text-xs">
                      <div><dt className="text-slate-500">Aprovadas</dt><dd className="mt-0.5 font-semibold text-emerald-300">{r.aprovadas}</dd></div>
                      <div><dt className="text-slate-500">Reprovadas</dt><dd className="mt-0.5 font-semibold text-rose-300">{r.reprovadas}</dd></div>
                      <div><dt className="text-slate-500">Total gasto</dt><dd className="mt-0.5 font-mono text-slate-200">${fmt(r.totalGasto)}</dd></div>
                      <div><dt className="text-slate-500">Último evento</dt><dd className="mt-0.5 text-slate-300">{r.ultima ? new Date(r.ultima).toLocaleDateString("pt-BR") : "Sem eventos"}</dd></div>
                    </dl>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
                      <Button size="sm" variant="ghost" className="h-8 rounded-lg px-2 text-slate-300 hover:bg-cyan-950/60 hover:text-cyan-200" onClick={() => {
                        const n = window.prompt("Novo nome da banca", b.nome)?.trim();
                        if (n) persist({ ...doc, bancas: doc.bancas.map((x) => (x.id === b.id ? { ...x, nome: n.slice(0, 60) } : x)) });
                      }}><Pencil className="size-3.5" />Renomear</Button>
                      {doc.bancas.length > 1 && (
                        <Button size="sm" variant="ghost" className="h-8 rounded-lg px-2 text-rose-300 hover:bg-rose-950/40 hover:text-rose-200" onClick={() => {
                          if (!window.confirm(`Excluir a banca "${b.nome}" e todo o histórico dela?`)) return;
                          const rest = doc.bancas.filter((x) => x.id !== b.id);
                          persist({ ...doc, bancas: rest, activeId: isActive ? rest[0]?.id ?? doc.activeId : doc.activeId });
                        }}><Trash2 className="size-3.5" />Excluir</Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <Platform key={ativa.id} load={loadActive} save={saveActive} isAdmin={isAdmin} officialAcceptedAt={ativa.officialAcceptedAt ?? null} historyOverview={<>      <section className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6" aria-label="Resumo geral do trader">
        <div className="rounded-2xl border border-cyan-900/70 bg-[#071426] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Resultado geral de todas as bancas</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${profitGeral >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmtSigned(profitGeral)}</p>
          <p className="mt-2 text-sm font-semibold text-cyan-200">Saldo Forex compartilhado: ${fmt(saldoForex)}</p>
          <p className="mt-1 text-xs text-slate-400">{doc.bancas.length} banca(s) · {eventosGerais.length} operações registradas · não representa o saldo disponível na corretora</p>
        </div>
      </section>
      <section className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6">
        <details className="rounded-2xl border border-cyan-950/80 bg-[#071426] p-4">
          <summary className="cursor-pointer font-semibold text-cyan-200">Histórico geral · todas as bancas ({eventosGerais.length})</summary>
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
            {eventosGerais.length === 0 ? <p className="text-sm text-slate-400">Nenhuma operação registrada.</p> : eventosGerais.map((e) => (
              <div key={`${e.bancaId}-${e.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 p-3 text-sm">
                <div><p className="font-semibold text-slate-100">{e.bancaNome} · {tipoLabel(e.tipo, e.asset)}</p><p className="text-xs text-slate-400">{new Date(e.ts).toLocaleString("pt-BR")} · {e.asset.toUpperCase()} · D{e.day}</p></div>
                <span className={e.delta >= 0 ? "font-mono text-emerald-300" : "font-mono text-rose-300"}>{fmtSigned(e.delta)}</span>
              </div>
            ))}
          </div>
        </details>
      </section>
</>} />
    </div>
  );
}
