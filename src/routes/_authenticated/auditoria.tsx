import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/auditoria")({
  beforeLoad: async ({ context }) => {
    if (!(await requireAdmin(context.user.id))) throw redirect({ to: "/plataforma" });
  },
  head: () => ({ meta: [{ title: "Auditoria da Master — Win or Win" }, { name: "description", content: "Histórico de acessos, alterações e eventos da plataforma." }] }),
  component: Auditoria,
});

type AuditRow = { id: string; category: string; action: string; outcome: string; details: string; created_at: string; user: string };
const CATEGORIES = ["Acesso", "Navegação", "Ação", "Integração", "Análise de IA", "Sistema"];

function Auditoria() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [category, setCategory] = useState("");
  const [userId, setUserId] = useState("");
  const [appliedUserId, setAppliedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
      const params = new URLSearchParams({ limit: "100" });
      if (category) params.set("category", category);
      if (appliedUserId.trim()) params.set("userId", appliedUserId.trim());
      const response = await fetch("/api/auditoria?" + params.toString(), { headers: { authorization: "Bearer " + token }, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 403) throw new Error("Acesso restrito à conta Master.");
        if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente.");
        throw new Error("Não foi possível carregar a auditoria.");
      }
      setRows((payload.logs ?? []) as AuditRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao consultar auditoria.");
    } finally {
      setLoading(false);
    }
  }, [category, appliedUserId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <header className="relative overflow-hidden rounded-2xl border border-cyan-900/70 bg-gradient-to-br from-[#071a2d] via-[#0b1224] to-[#111827] p-5 shadow-lg shadow-cyan-950/20 md:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Segurança e rastreabilidade</p><h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Auditoria da Master</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Consulte acessos, ações administrativas, análises e eventos de integração com filtros.</p></div>
          <Button asChild size="sm" variant="outline" className="border-slate-600 bg-white/5 text-white hover:bg-white/10"><Link to="/plataforma">← Voltar à plataforma</Link></Button>
        </div>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:flex-row sm:items-end md:p-6">
        <label className="flex-1 space-y-1 text-sm">
          <span className="font-medium">Categoria</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 transition focus:border-cyan-700">
            <option value="">Todas as categorias</option>
            {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="flex-1 space-y-1 text-sm">
          <span className="font-medium">Filtrar por conta (opcional)</span>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="UUID da conta" className="w-full rounded-md border bg-background px-3 py-2" />
        </label>
        <Button onClick={() => { if (userId.trim() === appliedUserId) void load(); else setAppliedUserId(userId.trim()); }} disabled={loading}>Pesquisar</Button>
      </section>

      {error && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando registros...</p> : (
        <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-sm">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-3 py-3 font-semibold">Data e hora</th>
                <th className="px-3 py-3 font-semibold">Usuário</th>
                <th className="px-3 py-3 font-semibold">Categoria / evento</th>
                <th className="px-3 py-3 font-semibold">Resultado</th>
                <th className="px-3 py-3 font-semibold">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top transition-colors hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-3">{new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                  <td className="px-3 py-3"><p className="font-medium">{row.user || "Usuário"}</p></td>
                  <td className="px-3 py-3"><p>{row.category}</p><p className="text-xs text-muted-foreground">{row.action}</p></td>
                  <td className="px-3 py-3"><span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-medium">{row.outcome}</span></td>
                  <td className="max-w-sm whitespace-pre-wrap break-words px-3 py-3 text-xs text-muted-foreground">{row.details || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Nenhum registro encontrado para esse filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Apenas a conta Master pode consultar estes registros. O servidor valida a sessão e a função administrativa antes de retornar qualquer dado. Segredos, cookies, hashes, chaves e identificadores técnicos não são exibidos nos detalhes.</p>
    </main>
  );
}
