import { createFileRoute } from "@tanstack/react-router";
import { autenticarToken, json } from "@/lib/integracao.server";

// O robô do MT5 busca as ordens pendentes; elas passam a "sent" para não repetir.
export const Route = createFileRoute("/api/public/ordens/pendentes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await autenticarToken(request);
        if (!userId) return json({ error: "unauthorized" }, 401);
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
        return json({ orders: (data ?? []).map((r) => ({ id: r.id, symbol: r.symbol, side: r.mirror_side, qty: Number(r.qty), price: r.price, created_at: r.created_at })) });
      },
    },
  },
});
