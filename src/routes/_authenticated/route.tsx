import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw redirect({ to: "/auth" });

    // Só redireciona quando uma resposta válida do servidor confirma ausência de aceite.
    try {
      const response = await fetch("/api/termos/status", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      // Falhas HTTP (por exemplo, banco/tabela indisponível) não significam ausência de aceite.
      if (!response.ok) return { user: data.user, termsCheckError: true };

      const status = await response.json() as { accepted?: unknown };
      if (status.accepted === false) throw redirect({ to: "/termos" });
      if (status.accepted !== true) return { user: data.user, termsCheckError: true };

      return { user: data.user, termsCheckError: false };
    } catch (error) {
      // Preserva redirecionamentos intencionais; erros de rede/consulta exibem mensagem.
      if (error && typeof error === "object" && "options" in error) throw error;
      return { user: data.user, termsCheckError: true };
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { termsCheckError } = Route.useRouteContext();
  const [retrying, setRetrying] = useState(false);

  if (termsCheckError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <section role="alert" className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Não foi possível verificar seus termos, tente novamente</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Não liberamos nem redirecionamos seu acesso enquanto a verificação estiver indisponível.
          </p>
          <button
            type="button"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              window.location.reload();
            }}
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {retrying ? "Tentando novamente..." : "Tentar novamente"}
          </button>
        </section>
      </main>
    );
  }

  return <Outlet />;
}
