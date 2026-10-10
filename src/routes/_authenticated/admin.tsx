import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getMyAccess } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/admin")({
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
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cadastros</h1>
        <Button asChild variant="outline" size="sm"><Link to="/plataforma">Voltar</Link></Button>
      </div>
      <div className="mt-6 space-y-3">
        {rows.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm">
              <p className="font-semibold">{p.full_name || "(sem nome)"} {p.id === user.id && <span className="text-muted-foreground">(você)</span>}</p>
              <p className="text-muted-foreground">{p.email} · {p.phone}</p>
              <p className="text-muted-foreground">Nascimento: {p.birth_date ? new Date(p.birth_date + "T00:00").toLocaleDateString("pt-BR") : "-"}</p>
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
