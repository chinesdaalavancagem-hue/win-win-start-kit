import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getMyAccess, signOut } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria.client";
import { Bancas } from "@/components/platform/Bancas";

export const Route = createFileRoute("/_authenticated/plataforma")({
  head: () => ({ meta: [{ title: "Plataforma — Win or Win" }, { name: "description", content: "Sua plataforma Win or Win." }, { property: "og:title", content: "Plataforma — Win or Win" }, { property: "og:description", content: "Planeje contratos, operações, bônus e saques na Win or Win." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Plataforma,
});

function Plataforma() {
  const { user } = Route.useRouteContext();
  const lastSavedRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "pending" | "rejected" | "ok">("loading");
  const [isAdmin, setIsAdmin] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    getMyAccess(user.id).then(({ profile, isAdmin }) => {
      setIsAdmin(isAdmin);
      setName(profile?.full_name ?? "");
      if (profile?.rejected) return setState("rejected");
      if (!profile?.approved) return setState("pending");
      setState("ok");
    });
  }, [user.id]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("app_data").select("data").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    lastSavedRef.current = data?.data ?? null;
    return data?.data || null;
  }, [user.id]);
  const save = useCallback(async (v: string) => {
    const previous = lastSavedRef.current;
    const { error } = await supabase.from("app_data").upsert({ user_id: user.id, data: v, updated_at: new Date().toISOString() });
    if (error) {
      void registrarAuditoria({ category: "strategy", action: "strategy.save_failed", outcome: "failed", details: { reason: "database_write_failed" } });
      return false;
    }

    const changes: Array<{ field: string; previous: unknown; next: unknown }> = [];
    try {
      const before = previous ? JSON.parse(previous) as Record<string, unknown> : null;
      const after = JSON.parse(v) as Record<string, unknown>;
      const walk = (a: unknown, b: unknown, path: string) => {
        if (path === "activeTab" || path === "log" || path.startsWith("log.") || changes.length >= 20) return;
        if (a && b && typeof a === "object" && typeof b === "object") {
          if (Array.isArray(a) && Array.isArray(b)) {
            for (let i = 0; i < Math.min(a.length, b.length) && changes.length < 20; i++) walk(a[i], b[i], path ? path + "." + i : String(i));
            return;
          }
          if (!Array.isArray(a) && !Array.isArray(b)) {
            const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
            for (const key of keys) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? path + "." + key : key);
            return;
          }
        }
        if (a !== b && (a === null || ["string", "number", "boolean", "undefined"].includes(typeof a))
          && (b === null || ["string", "number", "boolean", "undefined"].includes(typeof b))) {
          changes.push({ field: path.slice(0, 180), previous: a ?? null, next: b ?? null });
        }
      };
      if (before) walk(before, after, "");
      const priorState = before as { log?: Array<Record<string, unknown>> } | null;
      const nextState = after as { log?: Array<Record<string, unknown>> };
      const priorOperation = priorState?.log?.at(-1);
      const nextOperation = nextState.log?.at(-1);
      const operationChanged = JSON.stringify(priorOperation ?? null) !== JSON.stringify(nextOperation ?? null);
      lastSavedRef.current = v;
      if (changes.length || operationChanged) {
        void registrarAuditoria({
          category: "strategy",
          action: "strategy.updated",
          outcome: "success",
          details: {
            changes,
            operation: operationChanged && nextOperation ? {
              asset: nextOperation.asset,
              day: nextOperation.day,
              type: nextOperation.tipo,
            } : undefined,
          },
        });
      }
    } catch {
      lastSavedRef.current = v;
      void registrarAuditoria({ category: "strategy", action: "strategy.updated", outcome: "success", details: { change_summary: "state_updated" } });
    }
    return true;
  }, [user.id]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <span className="truncate">Olá, {name.split(" ")[0] || user.email}</span>
          {isAdmin && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">Master</span>}
        </span>
        <div className="flex gap-2">
          {state === "ok" && <Button asChild size="sm" variant="outline"><Link to="/integracao">Integração</Link></Button>}
          {isAdmin === true && <Button asChild size="sm" variant="outline"><Link to="/admin">Aprovar cadastros</Link></Button>}
          {isAdmin === true && <Button asChild size="sm" variant="outline"><Link to="/auditoria">Auditoria</Link></Button>}
          <Button size="sm" variant="ghost" onClick={() => signOut(navigate)}>Sair</Button>
        </div>
      </header>
      {state === "loading" && <p className="m-auto text-muted-foreground">Carregando...</p>}
      {state === "pending" && (
        <div className="m-auto max-w-sm px-6 text-center">
          <h1 className="text-2xl font-bold">Cadastro em análise</h1>
          <p className="mt-2 text-muted-foreground">Seu acesso será liberado assim que o administrador aprovar sua conta.</p>
        </div>
      )}
      {state === "rejected" && (
        <div className="m-auto max-w-sm px-6 text-center">
          <h1 className="text-2xl font-bold">Cadastro rejeitado</h1>
          <p className="mt-2 text-muted-foreground">Seu cadastro não foi aprovado. Se achar que houve um engano, fale com o administrador.</p>
        </div>
      )}
      {state === "ok" && <Bancas load={load} save={save} isAdmin={isAdmin} />}
    </div>
  );
}
