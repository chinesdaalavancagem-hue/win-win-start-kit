import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw redirect({ to: "/auth" });

    // O status é calculado pelo servidor; falha de rede/banco bloqueia o acesso.
    let response: Response;
    try {
      response = await fetch("/api/termos/status", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch {
      throw redirect({ to: "/termos" });
    }
    if (!response.ok) throw redirect({ to: "/termos" });

    let status: { accepted?: boolean };
    try {
      status = await response.json() as { accepted?: boolean };
    } catch {
      throw redirect({ to: "/termos" });
    }
    if (!status.accepted) throw redirect({ to: "/termos" });

    return { user: data.user };
  },
  component: () => <Outlet />,
});
