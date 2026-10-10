import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/auditoria")({
  beforeLoad: async ({ context }) => {
    if (!(await requireAdmin(context.user.id))) throw redirect({ to: "/plataforma" });
  },
  head: () => ({ meta: [{ title: "Auditoria — Win or Win" }, { name: "description", content: "Histórico de atividades e diagnóstico da plataforma." }] }),
  component: Auditoria,
});

type AuditRow = {
  id: string;
  user_id: string;
  category: string;
  action: string;
  outcome: string;
  details: Record<string, unknown>;
  request_id: string;
  created_at: string;
  user: { full_name: string; email: string } | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  auth: "Acesso",
  strategy: "Estratégia",
  integration: "Integração",
  navigation: "Navegação",
  system: "Sistema",
  ui: "Interface",
};
const OUTCOME_LABEL: Record<string, string> = {
  success: "Concluído",
  failed: "Falhou",
  denied: "Recusado",
  started: "Iniciado",
  unknown: "Não confirmado",
};

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
      const response = await fetch("/api/auditoria?" + params.toString(), {
        headers: { authorization: "Bearer " + token },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(response.status === 403 ? "Acesso restrito à conta Master." : "Não foi possível carregar a auditoria.");
      setRows((payload.logs ?? []) as AuditRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao consultar auditoria.");
    } finally {
      setLoading(false);
    }
  }, [category, appliedUserId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Auditoria</h1>
          <p className="mt-1 text-sm text-muted-foreground">Histórico de alterações, acessos e eventos de integração.</p>
        </div>
        <Button asChild size="sm" variant="outline"><Link to="/plataforma">Voltar à plataforma</Link></Button>
      </header>

      <section className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-sm">
          <span className="font-medium">Categoria</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2">
            <option value="">Todas as categorias</option>
            <option value="auth">Acesso</option>
            <option value="strategy">Estratégia</option>
            <option value="integration">Integração</option>
            <option value="navigation">Navegação</option>
            <option value="system">Sistema</option>
            <option value="ui">Interface</option>
          </select>
        </label>
        <label className="flex-1 space-y-1 text-sm">
          <span className="font-medium">ID da conta (opcional)</span>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="UUID do usuário" className="w-full rounded-md border bg-background px-3 py-2" />
        </label>
        <Button onClick={() => setAppliedUserId(userId.trim())} disabled={loading}>Pesquisar</Button>
      </section>

      {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Carregando registros...</p> : (
        <div className="overflow-x-auto rounded-lg border">
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
                <tr key={row.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-3">{new Date(row.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{row.user?.full_name || "Usuário"}</p>
                    <p className="text-xs text-muted-foreground">{row.user?.email || row.user_id}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p>{CATEGORY_LABEL[row.category] ?? row.category}</p>
                    <p className="text-xs text-muted-foreground">{row.action}</p>
                  </td>
                  <td className="px-3 py-3">{OUTCOME_LABEL[row.outcome] ?? row.outcome}</td>
                  <td className="max-w-sm whitespace-pre-wrap break-words px-3 py-3 text-xs text-muted-foreground">{JSON.stringify(row.details ?? {})}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Nenhum registro encontrado para esse filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Os registros mostram eventos recebidos pelo servidor. Uma ação sem confirmação não é tratada como concluída; o histórico deve ser cruzado com os registros técnicos para investigar a causa de uma falha.</p>
    </main>
  );
}
