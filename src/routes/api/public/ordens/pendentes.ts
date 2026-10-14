import { createFileRoute } from "@tanstack/react-router";
import { autenticarToken, json } from "@/lib/integracao.server";
import { resolveCfdLot } from "@/lib/integracao-lotes";

// O robô busca as ordens pendentes; elas passam a "sent" para não repetir.
// "qty" continua sendo a quantidade de contratos da mesa para compatibilidade;
// "lot" é o lote CFD definido pelo ciclo/dia salvo na plataforma.
export const Route = createFileRoute("/api/public/ordens/pendentes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await autenticarToken(request);
        if (auth.status === 401) return json({ error: "unauthorized" }, 401);
        if (auth.status === 500) return json({ error: "auth_unavailable" }, 500);
        const userId = auth.userId;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows } = await supabaseAdmin.from("order_queue").select("id")
          .eq("user_id", userId).eq("status", "pending").order("created_at").limit(20);
        const ids = (rows ?? []).map((r) => r.id);
        if (!ids.length) return json({ orders: [] });

        const { data, error } = await supabaseAdmin.from("order_queue")
          .update({ status: "sent", updated_at: new Date().toISOString() })
          .in("id", ids).eq("status", "pending")
          .select("id, symbol, mirror_side, qty, price, created_at");
        if (error) { console.error(error); return json({ error: "claim failed" }, 500); }
        if (data?.length) {
          const { error: auditError } = await supabaseAdmin.from("audit_logs").insert(data.map((row) => ({
            user_id: userId,
            category: "integration",
            action: "integration.order_dispatched",
            outcome: "success",
            details: { order_id: row.id, symbol: row.symbol, qty: Number(row.qty) },
          })));
          if (auditError) console.error("[audit] dispatched order event failed", auditError.message);
        }

        const { data: saved } = await supabaseAdmin.from("app_data").select("data")
          .eq("user_id", userId).maybeSingle();
        return json({
          orders: (data ?? []).map((r) => {
            const resolution = resolveCfdLot(saved?.data ?? null, r.symbol);
            return {
              id: r.id,
              symbol: r.symbol,
              side: r.mirror_side,
              qty: Number(r.qty),
              lot: resolution.lot ?? 0,
              lot_error: resolution.error ?? undefined,
              lot_asset: resolution.assetKey ?? undefined,
              lot_day: resolution.day ?? undefined,
              price: r.price,
              created_at: r.created_at,
            };
          }),
        });
      },
    },
  },
});
