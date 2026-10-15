import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Platform } from "./Platform";
import { fmt, fmtSigned } from "@/lib/platform/engine";
import { type BancasDoc, novaBanca, parseBancas, relatorioCsv, resumoBanca } from "@/lib/platform/bancas";
import { ComprarDesafioModal } from "./ComprarDesafioModal";
import { needsNewChallenge } from "@/lib/platform/challenges";
import { applyMasterSyncValues } from "@/lib/platform/master-sync";
import { supabase } from "@/integrations/supabase/client";
import { Plus, ExternalLink } from "lucide-react";

export function Bancas({ load, save, isAdmin }: { load: () => Promise<string | null>; save: (v: string) => Promise<boolean>; isAdmin: boolean }) {
  const [doc, setDoc] = useState<BancasDoc | null>(null);
  const [err, setErr] = useState(false);
  const [painel, setPainel] = useState(false);
  const [nome, setNome] = useState("");
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const docRef = useRef<BancasDoc | null>(null);
  const syncInFlight = useRef(false);

  useEffect(() => { load().then((r) => { const d = parseBancas(r); docRef.current = d; setDoc(d); }).catch(() => setErr(true)); }, [load]);

  const persist = useCallback((d: BancasDoc) => { docRef.current = d; setDoc(d); return save(JSON.stringify(d)); }, [save]);

  // Contas comuns consultam a publicação da Master periodicamente e aplicam apenas os campos autorizados.
  useEffect(() => {
    if (isAdmin) return;
    let alive = true;
    const poll = async () => {
      if (syncInFlight.current || !docRef.current) return;
      syncInFlight.current = true;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch("/api/plataforma/sincronizacao-numeros", {
          headers: { authorization: "Bearer " + token },
          cache: "no-store",
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!alive || !result.enabled || !result.values || typeof result.values !== "object") return;
        const current = docRef.current;
        if (!current) return;
        const merged = applyMasterSyncValues(JSON.stringify(current), result.values as Record<string, number[]>);
        if (!merged) return;
        // Não grave um snapshot se a conta mudou enquanto o polling calculava o merge.
        // Isso reduz a chance de uma publicação antiga atropelar uma edição local recente.
        if (docRef.current !== current) return;
        const next = parseBancas(merged);
        const saved = await save(merged);
        // Nunca substitua a interface por um snapshot de sincronização se houve edição
        // local durante o salvamento.
        if (saved && alive && docRef.current === current) {
          docRef.current = next;
          setDoc(next);
        }
      } catch {
        // A sincronização não deve interromper o uso normal da plataforma.
      } finally {
        syncInFlight.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [isAdmin, save]);

  const activeId = doc?.activeId;
  const loadActive = useCallback(async () => {
    const d = docRef.current; const b = d?.bancas.find((x) => x.id === d.activeId);
    return b ? JSON.stringify(b.state) : null;
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveActive = useCallback(async (v: string) => {
    const d = docRef.current; if (!d) return false;
    const id = activeId;
    const next = { ...d, bancas: d.bancas.map((b) => (b.id === id ? { ...b, state: JSON.parse(v) } : b)) };
    docRef.current = next;
    setDoc(next);
    const before = d.bancas.find((b) => b.id === id);
    const after = next.bancas.find((b) => b.id === id);
    const ok = await save(JSON.stringify(next));
    if (ok && before && after && needsNewChallenge(after.state) && after.state.log.at(-1)?.id !== before.state.log.at(-1)?.id) setPurchaseOpen(true);
    return ok;
  }, [activeId, save]);

  if (err) return <p className="m-auto text-destructive">Falha ao carregar as bancas.</p>;
  if (!doc) return <p className="m-auto text-muted-foreground">Carregando bancas...</p>;
  const ativa = doc.bancas.find((b) => b.id === doc.activeId) ?? doc.bancas[0];
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
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
        <label htmlFor="banca-sel" className="text-muted-foreground">Banca:</label>
        <select id="banca-sel" value={doc.activeId} onChange={(e) => persist({ ...doc, activeId: e.target.value })}
          className="rounded-md border bg-background px-2 py-1 font-semibold text-foreground">
          {doc.bancas.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => setPainel(!painel)} aria-expanded={painel}>
          {painel ? "Fechar gestão" : `Gerenciar bancas (${doc.bancas.length})`}
        </Button>
        <Button size="sm" onClick={() => setPurchaseOpen(true)}><Plus className="size-4" />Adquirir novo teste</Button>
      </div>
      {needsNewChallenge(ativa.state) && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-4 py-3 text-sm"><p>Ciclo encerrado na mesa. Adquira ou renove seu teste para iniciar o próximo ciclo.</p><Button size="sm" variant="outline" onClick={() => setPurchaseOpen(true)}><ExternalLink className="size-4" />Novo teste</Button></div>}
      {ativa.challengeAccount && <p className="border-b px-4 py-2 text-xs text-muted-foreground">Conta {ativa.challengeAccount.account_external_id} · ${fmt(ativa.challengeAccount.account_size)}</p>}
      {purchaseOpen && <ComprarDesafioModal open={purchaseOpen} onOpenChange={setPurchaseOpen} source={ativa} onRegister={async (banca) => {
        const current = docRef.current;
        if (!current) return false;
        if (current.bancas.some((b) => b.challengeAccount?.prop_firm_id === banca.challengeAccount?.prop_firm_id && b.challengeAccount?.account_external_id === banca.challengeAccount?.account_external_id)) throw new Error("Conta já cadastrada");
        const next = { ...current, activeId: banca.id, bancas: [...current.bancas, banca] };
        const ok = await save(JSON.stringify(next));
        if (ok) { docRef.current = next; setDoc(next); }
        return ok;
      }} />}

      {painel && (
        <section className="space-y-4 border-b px-4 py-4">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => {
            e.preventDefault(); if (!nome.trim()) return;
            const b = novaBanca(nome); setNome("");
            persist({ ...doc, activeId: b.id, bancas: [...doc.bancas, b] });
          }}>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da nova banca (ex.: Mesa X + CFD Y)" className="max-w-xs" maxLength={60} />
            <Button type="submit">Cadastrar banca</Button>
            <Button type="button" variant="outline" onClick={exportar}>Exportar relatório (CSV)</Button>
          </form>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {doc.bancas.map((b) => {
              const r = resumoBanca(b);
              const isActive = b.id === doc.activeId;
              return (
                <div key={b.id} className={`rounded-lg border bg-card p-3 ${isActive ? "border-primary" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="truncate">{b.nome}</strong>
                    {isActive ? <span className="text-xs text-primary">ativa</span> :
                      <Button size="sm" variant="ghost" onClick={() => persist({ ...doc, activeId: b.id })}>Abrir</Button>}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Ciclos</dt><dd>{r.ciclos}</dd>
                    <dt className="text-muted-foreground">Reprovadas</dt><dd className="text-destructive">{r.reprovadas}</dd>
                    <dt className="text-muted-foreground">Aprovadas</dt><dd className="text-primary">{r.aprovadas}</dd>
                    <dt className="text-muted-foreground">Lucro</dt><dd>{fmtSigned(r.lucro)}</dd>
                    <dt className="text-muted-foreground">Total gasto</dt><dd>${fmt(r.totalGasto)}</dd>
                    <dt className="text-muted-foreground">Último evento</dt><dd>{r.ultima ? new Date(r.ultima).toLocaleDateString("pt-BR") : "—"}</dd>
                  </dl>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => {
                      const n = window.prompt("Novo nome da banca", b.nome)?.trim();
                      if (n) persist({ ...doc, bancas: doc.bancas.map((x) => (x.id === b.id ? { ...x, nome: n.slice(0, 60) } : x)) });
                    }}>Renomear</Button>
                    {doc.bancas.length > 1 && (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                        if (!window.confirm(`Excluir a banca "${b.nome}" e todo o histórico dela?`)) return;
                        const rest = doc.bancas.filter((x) => x.id !== b.id);
                        persist({ ...doc, bancas: rest, activeId: isActive ? rest[0]?.id ?? doc.activeId : doc.activeId });
                      }}>Excluir</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Platform key={ativa.id} load={loadActive} save={saveActive} isAdmin={isAdmin} />
    </div>
  );
}
