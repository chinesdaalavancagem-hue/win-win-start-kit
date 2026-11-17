import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
      if (!response.ok) return { user: data.user, termsCheckError: true, deviceBlocked: false };

      const status = await response.json() as { accepted?: unknown };
      if (status.accepted === false) throw redirect({ to: "/termos" });
      if (status.accepted !== true) return { user: data.user, termsCheckError: true, deviceBlocked: false };

      const deviceResponse = await fetch("/api/dispositivos/", {
        headers: { authorization: `Bearer ${token}` }, cache: "no-store", credentials: "same-origin",
      });
      const device = deviceResponse.ok ? await deviceResponse.json() as { allowed?: boolean } : null;
      return { user: data.user, termsCheckError: false, deviceBlocked: device?.allowed !== true };
    } catch (error) {
      // Preserva redirecionamentos intencionais; erros de rede/consulta exibem mensagem.
      if (error && typeof error === "object" && "options" in error) throw error;
      return { user: data.user, termsCheckError: true, deviceBlocked: false };
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { termsCheckError, deviceBlocked } = Route.useRouteContext();
  const [retrying, setRetrying] = useState(false);
  const [revoked, setRevoked] = useState(false);

  useEffect(() => {
    if (termsCheckError || deviceBlocked) return;
    let alive = true;
    const check = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) return;
        const response = await fetch("/api/dispositivos/", { headers: { authorization: `Bearer ${data.session.access_token}` }, credentials: "same-origin", cache: "no-store" });
        if (!response.ok || (await response.json() as { allowed?: boolean }).allowed !== true) if (alive) setRevoked(true);
      } catch { if (alive) setRevoked(true); }
    };
    const timer = window.setInterval(() => void check(), 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [termsCheckError, deviceBlocked]);

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

  if (deviceBlocked || revoked) return <main className="flex min-h-screen items-center justify-center bg-[#030914] px-4 text-slate-100"><section role="alert" className="w-full max-w-sm rounded-xl border border-rose-900 bg-[#091321] p-7 text-center shadow-xl"><h1 className="text-lg font-bold">Acesso não autorizado</h1><p className="mt-2 text-sm text-slate-300">Contate o administrador.</p></section></main>;
  return <Outlet />;
}
