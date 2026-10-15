import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getMyAccess, signOut } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria-registro";
import { Bancas } from "@/components/platform/Bancas";
import { MasterNumberSync } from "@/components/platform/MasterNumberSync";
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
  const [masterDataForSync, setMasterDataForSync] = useState<string | null>(null);
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

  const handleMasterDocumentChange = useCallback((raw: string | null) => setMasterDataForSync(raw), []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("app_data").select("data,version").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const snapshot = readVersionedAppData(data);
    versionRef.current = snapshot.version;
    return snapshot.data || null;
  }, [user.id]);

  // Todas as gravações (edições locais e sincronização da Master) passam pela
  // mesma fila para preservar a ordem em que foram solicitadas.
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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
          <span className="truncate">Olá, {name.split(" ")[0] || user.email}</span>
          {isAdmin && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">Master</span>}
        </span>
        <div className="flex gap-2">
          {state === "ok" && <Button asChild size="sm" variant="outline"><Link to="/integracao">Integração</Link></Button>}
          {state === "ok" && <Button asChild size="sm" variant="outline"><Link to="/analise-ia">Análise IA</Link></Button>}
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
      {state === "ok" && <>{isAdmin && <MasterNumberSync masterData={masterDataForSync} />}<Bancas load={load} save={save} isAdmin={isAdmin} onDocumentChange={handleMasterDocumentChange} /></>}
    </div>
  );
}
