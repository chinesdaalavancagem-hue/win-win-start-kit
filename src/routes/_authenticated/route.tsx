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

    // The server, not browser state, decides whether the current version was accepted.
    try {
      const response = await fetch("/api/termos/status", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw redirect({ to: "/termos" });
      const status = await response.json() as { accepted?: boolean };
      if (!status.accepted) throw redirect({ to: "/termos" });
    } catch (error) {
      // Preserve TanStack redirects; fail closed on network or database errors.
      if (error && typeof error === "object" && "options" in error) throw error;
      throw redirect({ to: "/termos" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
