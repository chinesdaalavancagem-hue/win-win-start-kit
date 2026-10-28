import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Platform } from "./Platform";
import { fmt, fmtSigned, MESAS_FUTUROS, selecionarMesaGold, type MesaFuturos } from "@/lib/platform/engine";
import { type BancasDoc, aplicarForex, extrairForex, forexDoDocumento, novaBanca, parseBancas, podeDesfazerBanca, relatorioCsv, resumoBanca } from "@/lib/platform/bancas";
import { Plus, Building2, CheckCircle2, Pencil, Trash2, Download, ArrowUpRight, WalletCards, Activity } from "lucide-react";

export function Bancas({ load, save, isAdmin, sectionsMenuOpen = false, onSectionsMenuChange = () => {} }: { sectionsMenuOpen?: boolean; onSectionsMenuChange?: (open: boolean) => void; load: () => Promise<string | null>; save: (v: string) => Promise<boolean>; isAdmin: boolean }) {
  const [doc, setDoc] = useState<BancasDoc | null>(null);
  const [err, setErr] = useState(false);
  const [painel, setPainel] = useState(false);
  const [nome, setNome] = useState("");
  const [taxaAvaliacao, setTaxaAvaliacao] = useState("");
  const docRef = useRef<BancasDoc | null>(null);
  const pendingSave = useRef<Promise<boolean>>(Promise.resolve(true));
  const gravarEmOrdem = useCallback((d: BancasDoc) => {
    const snapshot = JSON.stringify(d);
    const task = pendingSave.current.catch(() => false).then(() => save(snapshot));
    pendingSave.current = task.catch(() => false);
    return task;
  }, [save]);

  useEffect(() => { load().then((r) => { const d = parseBancas(r); docRef.current = d; setDoc(d); }).catch(() => setErr(true)); }, [load]);

  const persist = useCallback((d: BancasDoc) => { docRef.current = d; setDoc(d); return gravarEmOrdem(d); }, [gravarEmOrdem]);

  const mesa = doc?.mesaAtiva ?? "tradefive";
  const bancasDaMesa = doc?.bancas.filter((b) => (b.mesa ?? "tradefive") === mesa) ?? [];
  const selecionada = bancasDaMesa.find((b) => b.id === doc?.activeIdsMesa?.[mesa]) ?? bancasDaMesa.find((b) => b.id === doc?.activeId) ?? bancasDaMesa[0];
  const activeId = selecionada?.id;
  const escolherBanca = (id: string) => { if (doc) persist({ ...doc, activeId: id, activeIdsMesa: { ...doc.activeIdsMesa, [mesa]: id } }); };
  const escolherMesa = (nova: MesaFuturos) => {
    if (!doc) return;
    const contas = doc.bancas.filter((b) => (b.mesa ?? "tradefive") === nova);
    const id = contas.find((b) => b.id === doc.activeIdsMesa?.[nova])?.id ?? contas[0]?.id ?? "";
    persist({ ...doc, mesaAtiva: nova, activeId: id, activeIdsMesa: { ...doc.activeIdsMesa, [nova]: id } });
    // Ao alternar entre mesas com bancas, mostrar diretamente os cards operacionais.
    // Abrir a gestão apenas para mesas ainda sem nenhuma banca cadastrada.
    setPainel(contas.length === 0);
  };
  const loadActive = useCallback(async () => {
    const d = docRef.current; const b = d?.bancas.find((x) => x.id === activeId);
    return b ? JSON.stringify((() => { const state = aplicarForex(b.state, forexDoDocumento(d!)); if (typeof b.taxaCompra === "number") { state.assets.nasdaq.params.taxa = b.taxaCompra; state.assets.ouro.params.taxa = b.taxaCompra; } selecionarMesaGold(state.assets.ouro, b.mesa ?? "tradefive"); return state; })()) : null;
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveActive = useCallback(async (v: string, acceptedAt?: string) => {
    const d = docRef.current; if (!d) return false;
    const id = activeId;
    const updated = JSON.parse(v);
    const banca = d.bancas.find((b) => b.id === id);
    if (banca && typeof banca.taxaCompra === "number") { updated.assets.nasdaq.params.taxa = banca.taxaCompra; updated.assets.ouro.params.taxa = banca.taxaCompra; }
    const next = { ...d, forex: extrairForex(updated), bancas: d.bancas.map((b) => (b.id === id ? { ...b, state: updated, ...(acceptedAt ? { officialAcceptedAt: acceptedAt } : {}) } : b)) };
    docRef.current = next;
    setDoc(next);
    const ok = await gravarEmOrdem(next);
    if (!ok && acceptedAt && docRef.current === next) { docRef.current = d; setDoc(d); }
    return ok;
  }, [activeId, gravarEmOrdem]);

  if (err) return <p className="m-auto text-destructive">Falha ao carregar as bancas.</p>;
  if (!doc) return <p className="m-auto text-muted-foreground">Carregando bancas...</p>;
  const ativa = selecionada;
  // Desfazer só é permitido se nenhuma outra banca movimentou o Forex compartilhado.
  const podeDesfazerForex = !!ativa && podeDesfazerBanca(doc, ativa);

  function exportar() {
    const current = docRef.current;
    if (!current) return;
    const url = URL.createObjectURL(new Blob([relatorioCsv(current.bancas)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-bancas-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="win-platform-desktop-compact flex flex-1 flex-col bg-[radial-gradient(ellipse_at_top,rgba(0,111,255,0.10),transparent_58%)]">
      <header className="border-b border-cyan-950/80 bg-[#050d1b]/90 px-4 py-4 sm:px-6 lg:px-20">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 shadow-[0_0_24px_rgba(0,190,255,0.08)]"><img src="/logo.png" alt="Win or Win" className="size-[72px] object-contain [filter:hue-rotate(150deg)_saturate(1.25)]" /></div>
            <div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300/80">Workspace financeiro</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-100 sm:text-2xl">Gerenciar bancas</h2><p className="mt-1 text-sm text-slate-400">Organize suas contas, acompanhe resultados e alterne entre ciclos.</p></div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="flex items-center gap-1 text-sm text-amber-200"><Building2 className="size-4" /><select aria-label="Mesa de futuros" value={mesa} onChange={(e) => escolherMesa(e.target.value as MesaFuturos)} className="rounded-lg border border-amber-800 bg-[#071426] px-2 py-2 text-sm font-semibold text-amber-100">{Object.entries(MESAS_FUTUROS).map(([k, m]) => <option key={k} value={k}>{m.nome}</option>)}</select></label>
            <label htmlFor="banca-sel" className="sr-only">Banca ativa</label>
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-cyan-950 bg-[#071426] px-3 py-2.5 sm:min-w-[230px]">
              <Activity className="size-4 shrink-0 text-cyan-300" />
              <select id="banca-sel" value={ativa?.id ?? ""} onChange={(e) => escolherBanca(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-blue-100 outline-none">
                {bancasDaMesa.map((b) => <option key={b.id} value={b.id} className="bg-[#071426]">{b.nome}</option>)}
              </select>
              <span className="shrink-0 rounded-md bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Ativa</span>
            </div>
            <Button size="sm" variant="outline" className="h-10 rounded-xl border-cyan-900/80 bg-[#071426] text-blue-100 hover:border-cyan-400 hover:bg-blue-950/60" onClick={() => setPainel(!painel)} aria-expanded={painel}>
              <WalletCards className="size-4" />{painel ? "Fechar gestão" : `Minhas bancas · ${bancasDaMesa.length}`}
            </Button>
          </div>
        </div>
      </header>
      {painel && (
        <section className="border-b border-cyan-950/70 bg-[#06101f]/80 px-4 py-5 sm:px-6 lg:px-20">
          <div className="mx-auto max-w-[1600px] space-y-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300/80">Central de contas</p><h3 className="mt-1 text-lg font-bold text-slate-100">Seu portfólio de bancas</h3><p className="mt-1 max-w-2xl text-sm text-slate-400">Cada banca mantém seu próprio ciclo e histórico. Escolha uma para continuar operando ou crie uma nova.</p></div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <form className="flex min-w-0 flex-1 flex-wrap gap-2 sm:min-w-[330px]" onSubmit={(e) => {
                  e.preventDefault(); if (!nome.trim() || !taxaAvaliacao.trim()) return;
                  const valor = Number(taxaAvaliacao.trim().replace(",", "."));
                  if (!Number.isFinite(valor) || valor < 0) return;
                  const b = novaBanca(nome);
                  b.taxaCompra = valor;
                  b.mesa = mesa;
                  if (mesa !== "tradefive") selecionarMesaGold(b.state.assets.ouro, mesa);
                  b.state = aplicarForex(b.state, forexDoDocumento(doc));
                  b.state.assets.nasdaq.params.taxa = valor;
                  b.state.assets.ouro.params.taxa = valor;
                  setNome(""); setTaxaAvaliacao("");
                  // Fechar a gestão para mostrar imediatamente os cards e os menus laterais.
                  setPainel(false);
                  persist({ ...doc, activeId: b.id, activeIdsMesa: { ...doc.activeIdsMesa, [mesa]: b.id }, bancas: [...doc.bancas, b] });
                }}>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da nova banca" aria-label="Nome da nova banca" className="h-10 min-w-0 rounded-xl border-cyan-950 bg-[#071426] text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400" maxLength={60} />
                  <Input type="text" inputMode="decimal" value={taxaAvaliacao} onChange={(e) => setTaxaAvaliacao(e.target.value)} placeholder="Taxa de avaliação ($)" aria-label="Taxa de avaliação em dólares" required className="h-10 min-w-[145px] flex-1 rounded-xl border-cyan-950 bg-[#071426] text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400" />
                  <Button type="submit" className="h-10 shrink-0 rounded-xl bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"><Plus className="size-4" /><span className="hidden sm:inline">Criar banca</span><span className="sm:hidden">Criar</span></Button>
                </form>
                <Button type="button" variant="outline" className="h-10 rounded-xl border-cyan-900/80 bg-[#071426] text-blue-100 hover:border-cyan-400" onClick={exportar}><Download className="size-4" />Exportar CSV</Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {bancasDaMesa.map((b) => {
                const r = resumoBanca(b);
                const isActive = b.id === ativa?.id;
                return (
                  <article key={b.id} className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-[#0b1b30] via-[#081426] to-[#050c17] p-2.5 sm:p-3 transition-colors ${isActive ? "border-cyan-400/70 shadow-[0_0_26px_rgba(0,190,255,0.09)]" : "border-cyan-950/90 hover:border-cyan-800"}`}>
                    {isActive && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-300 via-teal-300 to-emerald-300" />}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg border ${isActive ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-200" : "border-slate-700 bg-slate-800/70 text-slate-400"}`}><Building2 className="size-4" /></div>
                        <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-100">{b.nome}</h4><p className="text-[10px] text-slate-500">{isActive ? "Selecionada para operação" : "Banca cadastrada"}</p></div>
                      </div>
                      {isActive ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300"><CheckCircle2 className="size-3" />Ativa</span> :
                        <Button size="sm" variant="outline" className="h-7 shrink-0 rounded-lg border-cyan-900 bg-[#071426] text-cyan-200 hover:border-cyan-400 hover:bg-cyan-950/50" onClick={() => escolherBanca(b.id)}>Abrir <ArrowUpRight className="size-3.5" /></Button>}
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg border border-white/5 bg-black/15 px-2.5 py-1.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ciclos</p><p className="text-base font-bold tabular-nums text-slate-100">{r.ciclos}</p></div>
                      <div className="rounded-lg border border-white/5 bg-black/15 px-2.5 py-1.5"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Resultado</p><p className={`truncate text-base font-bold tabular-nums ${r.lucro >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{fmtSigned(r.lucro)}</p></div>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-white/5 pt-2 text-[11px]">
                      <div><dt className="text-slate-500">Aprovadas</dt><dd className=" font-semibold text-emerald-300">{r.aprovadas}</dd></div>
                      <div><dt className="text-slate-500">Reprovadas</dt><dd className=" font-semibold text-rose-300">{r.reprovadas}</dd></div>
                      <div><dt className="text-slate-500">Compra da banca</dt><dd className=" font-mono font-semibold text-amber-200">${fmt(b.taxaCompra ?? b.state.assets.ouro.params.taxa)}</dd></div>
                      <div><dt className="text-slate-500">Total gasto</dt><dd className=" font-mono text-slate-200">${fmt(r.totalGasto)}</dd></div>
                      <div><dt className="text-slate-500">Último evento</dt><dd className=" text-slate-300">{r.ultima ? new Date(r.ultima).toLocaleDateString("pt-BR") : "Sem eventos"}</dd></div>
                    </dl>
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/5 pt-2 text-[11px]"><span className="text-slate-400">ID da Conta na Mesa</span><span className="truncate font-mono text-cyan-200" title={b.contaMesa ?? b.challengeAccount?.account_external_id ?? "Não configurada"}>{b.contaMesa ?? b.challengeAccount?.account_external_id ?? "Não configurada"}</span></div>
                    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-white/5 pt-2">
                      <Button size="sm" variant="ghost" className="h-7 rounded-lg px-1.5 text-[11px] text-cyan-200 hover:bg-cyan-950/60" onClick={() => {
                        const entrada = window.prompt("ID COMPLETO da conta na mesa (não use apenas os 4 últimos dígitos)", b.contaMesa ?? b.challengeAccount?.account_external_id ?? "");
                        if (entrada === null) return;
                        const contaMesa = entrada.trim();
                        if (contaMesa.length > 100 || /[\x00-\x1F\x7F]/.test(contaMesa)) { window.alert("ID inválido (máximo de 100 caracteres, sem controles)."); return; }
                        persist({ ...doc, bancas: doc.bancas.map((x) => x.id === b.id ? { ...x, contaMesa: contaMesa || undefined, ...(x.challengeAccount && contaMesa ? { challengeAccount: { ...x.challengeAccount, account_external_id: contaMesa } } : {}) } : x) });
                      }}><Pencil className="size-3.5" />ID da conta</Button>
                      <Button size="sm" variant="ghost" className="h-7 rounded-lg px-1.5 text-[11px] text-slate-300 hover:bg-cyan-950/60 hover:text-cyan-200" onClick={() => {
                        const n = window.prompt("Novo nome da banca", b.nome)?.trim();
                        if (n) persist({ ...doc, bancas: doc.bancas.map((x) => (x.id === b.id ? { ...x, nome: n.slice(0, 60) } : x)) });
                      }}><Pencil className="size-3.5" />Renomear</Button>
                      <Button size="sm" variant="ghost" className="h-7 rounded-lg px-1.5 text-[11px] text-amber-200 hover:bg-amber-950/40 hover:text-amber-100" onClick={() => {
                        const anterior = b.taxaCompra ?? b.state.assets.ouro.params.taxa;
                        const entrada = window.prompt("Valor real pago nesta banca ($)", String(anterior));
                        if (entrada === null) return;
                        const valor = Number(entrada.trim().replace(",", "."));
                        if (!Number.isFinite(valor) || valor < 0) { window.alert("Informe um valor válido."); return; }
                        const bancas = doc.bancas.map((x) => {
                          if (x.id !== b.id) return x;
                          const state = structuredClone(x.state);
                          state.assets.nasdaq.params.taxa = valor;
                          state.assets.ouro.params.taxa = valor;
                          return { ...x, taxaCompra: valor, state };
                        });
                        persist({ ...doc, bancas });
                      }}><Pencil className="size-3.5" />Corrigir valor pago</Button>
                      {doc.bancas.length > 1 && (
                        <Button size="sm" variant="ghost" className="h-7 rounded-lg px-1.5 text-[11px] text-rose-300 hover:bg-rose-950/40 hover:text-rose-200" onClick={() => {
                          if (!window.confirm(`Excluir a banca "${b.nome}" e todo o histórico dela?`)) return;
                          const rest = doc.bancas.filter((x) => x.id !== b.id);
                          // Fechar a gestão para manter os controles laterais visíveis após excluir.
                          setPainel(false);
                          persist({ ...doc, bancas: rest, activeId: isActive ? rest.find((x) => (x.mesa ?? "tradefive") === mesa)?.id ?? "" : doc.activeId, activeIdsMesa: { ...doc.activeIdsMesa, [mesa]: isActive ? rest.find((x) => (x.mesa ?? "tradefive") === mesa)?.id ?? "" : doc.activeIdsMesa?.[mesa] } });
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

      {ativa ? <Platform key={ativa.id} leftMenuOpen={sectionsMenuOpen} setLeftMenuOpen={onSectionsMenuChange} load={loadActive} save={saveActive} isAdmin={isAdmin} officialAcceptedAt={ativa.officialAcceptedAt ?? null} allBancas={bancasDaMesa} bancasGlobais={doc.bancas} bancaAtivaId={ativa.id} contaMesa={ativa.contaMesa ?? ativa.challengeAccount?.account_external_id} podeDesfazerForex={podeDesfazerForex} mesaAtiva={mesa} onMesaChange={escolherMesa} /> : <section className="mx-auto my-10 max-w-lg rounded-xl border border-amber-800/60 bg-[#081321] p-5 text-center text-slate-200"><h3 className="font-bold">Nenhuma banca cadastrada na {MESAS_FUTUROS[mesa].nome}</h3><p className="mt-2 text-sm text-slate-400">As bancas das outras mesas permanecem preservadas. Crie uma banca nesta mesa para começar.</p><Button type="button" className="mt-3" onClick={() => setPainel(true)}>Cadastrar banca</Button></section>}
    </div>
  );
}

