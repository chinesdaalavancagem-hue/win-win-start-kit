import { createFileRoute } from "@tanstack/react-router";
import { confirmarSchema } from "@/lib/integracao";
import { autenticarToken, json } from "@/lib/integracao.server";

// O robô do MT5 informa se executou (done) ou falhou (error).
export const Route = createFileRoute("/api/public/ordens/confirmar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await autenticarToken(request);
        if (!userId) return json({ error: "unauthorized" }, 401);
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
        const p = confirmarSchema.safeParse(body);
        if (!p.success) return json({ error: "invalid body" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("order_queue")
          .update({ status: p.data.status, error: p.data.error ?? null, updated_at: new Date().toISOString() })
          .eq("id", p.data.id).eq("user_id", userId).eq("status", "sent").select("id").maybeSingle();
        if (error) { console.error(error); return json({ error: "update failed" }, 500); }
        if (!data) return json({ error: "not found" }, 404);
        return json({ ok: true });
      },
    },
  },
});
