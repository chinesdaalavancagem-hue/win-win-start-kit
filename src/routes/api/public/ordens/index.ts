import { createFileRoute } from "@tanstack/react-router";
import { mirrorSide, ordemSchema } from "@/lib/integracao";
import { autenticarToken, json } from "@/lib/integracao.server";

// Recebe uma ordem da mesa e coloca na fila para o robô do MT5.
export const Route = createFileRoute("/api/public/ordens/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await autenticarToken(request);
        if (auth.status === 401) return json({ error: "unauthorized" }, 401);
        if (auth.status === 500) return json({ error: "auth_unavailable" }, 500);
        const userId = auth.userId;
        if (!userId) return json({ error: "unauthorized" }, 401);
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
        const parsed = ordemSchema.safeParse(body);
        if (!parsed.success) return json({ error: "invalid order", issues: parsed.error.flatten().fieldErrors }, 400);
        const o = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("order_queue")
          .upsert({ user_id: userId, external_id: o.id, symbol: o.symbol, side: o.side, mirror_side: mirrorSide(o.side), qty: o.qty, price: o.price ?? null },
            { onConflict: "user_id,external_id", ignoreDuplicates: true })
          .select("id").maybeSingle();
        if (error) { console.error(error); return json({ error: "queue failed" }, 500); }
        const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
          user_id: userId,
          category: "integration",
          action: "integration.order_received",
          outcome: data ? "success" : "unknown",
          details: { symbol: o.symbol, qty: o.qty, side: o.side, duplicate: !data },
        });
        if (auditError) console.error("[audit] incoming order event failed", auditError.message);
        return json({ ok: true, id: data?.id ?? null, duplicate: !data }, data ? 201 : 200);
      },
    },
  },
});
