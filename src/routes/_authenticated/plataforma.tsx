import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getMyAccess, signOut } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/plataforma")({
  head: () => ({ meta: [{ title: "Plataforma — Win or Win" }, { name: "description", content: "Sua plataforma Win or Win." }] }),
  component: Plataforma,
});

declare global {
  interface Window {
    __winStorage?: {
      get: (k: string) => Promise<{ value: string } | null>;
      set: (k: string, v: string) => Promise<boolean>;
    };
  }
}

function Plataforma() {
  const { user } = Route.useRouteContext();
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
      window.__winStorage = {
        async get() {
          const { data } = await supabase.from("app_data").select("data").eq("user_id", user.id).maybeSingle();
          return data?.data ? { value: data.data } : null;
        },
        async set(_k, v) {
          const { error } = await supabase
            .from("app_data")
            .upsert({ user_id: user.id, data: v, updated_at: new Date().toISOString() });
          return !error;
        },
      };
      setState("ok");
    });
    return () => { delete window.__winStorage; };
  }, [user.id]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm">
        <span className="truncate text-muted-foreground">Olá, {name.split(" ")[0] || user.email}</span>
        <div className="flex gap-2">
          {isAdmin && <Button asChild size="sm" variant="outline"><Link to="/admin">Aprovar cadastros</Link></Button>}
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
      {state === "ok" && <iframe title="Win or Win Platform" src="/plataforma.html" className="w-full flex-1 border-0" />}
    </div>
  );
}
