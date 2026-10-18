import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getMyAccess, requireAdmin } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    if (!(await requireAdmin(context.user.id))) throw redirect({ to: "/plataforma" });
  },
  head: () => ({ meta: [{ title: "Cadastros — Win or Win" }, { name: "description", content: "Aprovação de cadastros Win or Win." }, { property: "og:title", content: "Cadastros — Win or Win" }, { property: "og:description", content: "Gerencie a aprovação de membros Win or Win." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Admin,
});

type Profile = { id: string; full_name: string; phone: string; cpf: string; birth_date: string | null; email: string; approved: boolean; rejected: boolean; created_at: string };

function Admin() {
  const { user } = Route.useRouteContext();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Profile[]>([]);

  async function load() {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setRows((data as Profile[]) ?? []);
  }

  useEffect(() => {
    getMyAccess(user.id).then(({ isAdmin }) => { setAllowed(isAdmin); if (isAdmin) load(); });
  }, [user.id]);

  async function toggle(p: Profile) {
    await supabase.from("profiles").update({ approved: !p.approved }).eq("id", p.id);
    load();
  }

  async function reject(p: Profile) {
    await supabase.from("profiles").update({ approved: false, rejected: true }).eq("id", p.id);
    load();
  }

  async function reactivate(p: Profile) {
    await supabase.from("profiles").update({ rejected: false }).eq("id", p.id);
    load();
  }

  if (allowed === null) return <p className="p-8 text-muted-foreground">Carregando...</p>;
  if (!allowed) return <p className="p-8">Acesso negado.</p>;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <header className="relative overflow-hidden rounded-2xl border border-cyan-900/70 bg-gradient-to-br from-[#071a2d] via-[#0b1224] to-[#111827] p-5 shadow-lg shadow-cyan-950/20 md:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Área administrativa</p><h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Aprovar cadastros</h1><p className="mt-2 text-sm text-slate-300">Revise os pedidos de acesso e gerencie o estado de cada conta.</p></div>
          <Button asChild variant="outline" size="sm" className="border-slate-600 bg-white/5 text-white hover:bg-white/10"><Link to="/plataforma">← Voltar à plataforma</Link></Button>
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-4"><p className="text-sm text-muted-foreground">Aguardando análise</p><p className="mt-2 text-2xl font-bold tabular-nums">{rows.filter((p) => !p.approved && !p.rejected).length}</p></div>
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-4"><p className="text-sm text-muted-foreground">Aprovados</p><p className="mt-2 text-2xl font-bold tabular-nums">{rows.filter((p) => p.approved && !p.rejected).length}</p></div>
        <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-transparent p-4"><p className="text-sm text-muted-foreground">Rejeitados</p><p className="mt-2 text-2xl font-bold tabular-nums">{rows.filter((p) => p.rejected).length}</p></div>
      </div>
      <div className="space-y-3">
        {rows.map((p) => (
          <div key={p.id} className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-colors hover:border-cyan-900/50 md:flex-row md:items-center md:justify-between">
            <div className="text-sm">
              <p className="font-semibold text-base">{p.full_name || "(sem nome)"} {p.id === user.id && <span className="text-muted-foreground">(você)</span>}</p>
              <p className="text-muted-foreground">{p.email} · {p.phone}</p>
              <p className="mt-1 text-xs text-muted-foreground">Nascimento: {p.birth_date ? new Date(p.birth_date + "T00:00").toLocaleDateString("pt-BR") : "-"}</p>
            </div>
            {p.id !== user.id && (
              <div className="flex items-center gap-2">
                {p.approved ? (
                  <>
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">Aprovado</span>
                    <Button size="sm" variant="outline" onClick={() => reject(p)}>Rejeitar</Button>
                  </>
                ) : p.rejected ? (
                  <>
                    <span className="rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold text-destructive">Rejeitado</span>
                    <Button size="sm" variant="outline" onClick={() => reactivate(p)}>Reativar</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="default" onClick={() => toggle(p)}>Aprovar</Button>
                    <Button size="sm" variant="outline" onClick={() => reject(p)}>Rejeitar</Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted-foreground">Nenhum cadastro ainda.</p>}
      </div>
    </main>
  );
}
