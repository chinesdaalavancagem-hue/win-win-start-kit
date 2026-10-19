import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getMyAccess, signOut } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria-registro";
import { Bancas } from "@/components/platform/Bancas";
import { queueSaveUnlessConflicted, readVersionedAppData, recoverVersionConflict } from "@/lib/platform/versioned-save";

export const Route = createFileRoute("/_authenticated/plataforma")({
  head: () => ({ meta: [{ title: "Plataforma — Win or Win" }, { name: "description", content: "Sua plataforma Win or Win." }, { property: "og:title", content: "Plataforma — Win or Win" }, { property: "og:description", content: "Planeje contratos, operações, bônus e saques na Win or Win." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Plataforma,
});

function Plataforma() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "pending" | "rejected" | "ok">("loading");
  const [isAdmin, setIsAdmin] = useState(false);
  const [name, setName] = useState("");
  const versionRef = useRef<number | null>(null);
  const conflictRef = useRef(false);

  useEffect(() => {
    void registrarAuditoria({ category: "navigation", action: "navigation.opened", outcome: "success", details: { page: "platform" } });
    getMyAccess(user.id).then(({ profile, isAdmin }) => {
      setIsAdmin(isAdmin);
      setName(profile?.full_name ?? "");
      if (profile?.rejected) return setState("rejected");
      if (!profile?.approved) return setState("pending");
      setState("ok");
    });
  }, [user.id]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("app_data").select("data,version").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const snapshot = readVersionedAppData(data);
    versionRef.current = snapshot.version;
    return snapshot.data || null;
  }, [user.id]);

  // Todas as gravações locais passam pela mesma fila para preservar a ordem em que foram solicitadas.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const save = useCallback((v: string) => queueSaveUnlessConflicted(
    saveQueue,
    conflictRef,
    async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return false;
        const response = await fetch("/api/plataforma/dados", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + token,
          },
          body: JSON.stringify({ data: v, expectedVersion: versionRef.current }),
        });
        if (response.status === 409) {
          // Bloqueia imediatamente todos os saves até o reload. O load() após
          // recarregar buscará data e version juntos como um único snapshot.
          conflictRef.current = true;
          await recoverVersionConflict(() => window.location.reload());
          return false;
        }
        if (!response.ok) return false;
        const result = await response.json().catch(() => null) as { version?: unknown } | null;
        if (typeof result?.version === "number") versionRef.current = result.version;
        return true;
      } catch {
        return false;
      }
    },
    false,
  ), []);

  return (
    <div className="flex min-h-screen flex-col bg-[#030914] text-slate-100">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-cyan-950/80 bg-[#050d1b]/95 px-3 py-3 text-sm shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-md sm:px-5">
        <span className="flex min-w-0 items-center gap-2 text-blue-100/75">
          <span className="truncate">Olá, {name.split(" ")[0] || user.email}</span>
          {isAdmin && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">Master</span>}
        </span>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-0.5">
          {state === "ok" && <Button asChild size="sm" variant="outline" className="shrink-0 rounded-xl border-cyan-800/70 bg-[#07162a] text-blue-100 hover:border-cyan-400 hover:bg-blue-950/70"><Link to="/integracao">▦ Integração</Link></Button>}
          {state === "ok" && <Button asChild size="sm" variant="outline" className="shrink-0 rounded-xl border-cyan-950 bg-[#07101f] text-blue-100 hover:border-cyan-500 hover:bg-blue-950/70"><Link to="/analise-ia">◉ Análise IA</Link></Button>}
          {isAdmin === true && <Button asChild size="sm" variant="outline" className="shrink-0 rounded-xl border-cyan-950 bg-[#07101f] text-blue-100 hover:border-cyan-500 hover:bg-blue-950/70"><Link to="/admin">♙ Aprovar cadastros</Link></Button>}
          {isAdmin === true && <Button asChild size="sm" variant="outline" className="shrink-0 rounded-xl border-cyan-950 bg-[#07101f] text-blue-100 hover:border-cyan-500 hover:bg-blue-950/70"><Link to="/auditoria">⛨ Auditoria</Link></Button>}
          <Button size="sm" variant="ghost" className="shrink-0 text-slate-400 hover:text-white" onClick={() => signOut(navigate)}>Sair</Button>
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
      {state === "ok" && (
        <a
          href="https://t.me/yansignal"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar com o suporte pelo Telegram"
          title="Suporte pelo Telegram"
          className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full border border-sky-300/40 bg-[#229ED9] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition hover:bg-[#168ac4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:bottom-6 sm:right-6"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
            <path d="M21.5 3.5 2.8 10.7c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.9 5.8c.2.6.1.9.8.9.5 0 .8-.2 1.1-.5l2.7-2.6 5.6 4.1c1 .5 1.7.2 2-1L24 4.8c.4-1.4-.5-2-2.5-1.3ZM8.1 13.3l10.8-6.8c.5-.3 1-.1.6.3-8.9 8-.3 3.1-2.2-4.6Z" />
          </svg>
          <span>Suporte</span>
        </a>
      )}
    </div>
  );
}
