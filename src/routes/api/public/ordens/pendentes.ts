import { createFileRoute } from "@tanstack/react-router";
import { autenticarToken, json } from "@/lib/integracao.server";
import { resolveCfdLot } from "@/lib/integracao-lotes";

// O robô busca as ordens pendentes; só as ordens com lote válido são marcadas como enviadas.
// "qty" continua sendo a quantidade de contratos da mesa para compatibilidade;
// "lot" é o lote CFD definido pelo ciclo/dia salvo na plataforma.
export const Route = createFileRoute("/api/public/ordens/pendentes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await autenticarToken(request);
        if (!userId) return json({ error: "unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: saved, error: savedError } = await supabaseAdmin.from("app_data").select("data")
          .eq("user_id", userId).maybeSingle();
        if (savedError) {
          console.error("[integration] failed to load app_data", savedError.message);
          return json({ error: "platform state unavailable" }, 500);
        }

        const { data: rows, error: rowsError } = await supabaseAdmin.from("order_queue")
          .select("id, symbol, mirror_side, qty, price, created_at")
          .eq("user_id", userId).eq("status", "pending").order("created_at").limit(20);
        if (rowsError) {
          console.error("[integration] failed to load pending orders", rowsError.message);
          return json({ error: "pending orders unavailable" }, 500);
        }
        if (!rows?.length) return json({ orders: [] });

        const resolved = rows.map((row) => ({
          row,
          resolution: resolveCfdLot(saved?.data ?? null, row.symbol),
        }));
        const lotErrors = resolved
          .filter(({ resolution }) => resolution.lot == null)
          .map(({ row, resolution }) => ({
            id: row.id,
            symbol: row.symbol,
            error: resolution.error ?? "Não foi possível determinar o lote do ciclo atual.",
          }));
        const valid = resolved.filter(({ resolution }) =>
          typeof resolution.lot === "number" && Number.isFinite(resolution.lot) && resolution.lot > 0
        );
        if (!valid.length) return json({ orders: [], lot_errors: lotErrors });

        const ids = valid.map(({ row }) => row.id);
        const { data, error } = await supabaseAdmin.from("order_queue")
          .update({ status: "sent", updated_at: new Date().toISOString() })
          .in("id", ids).eq("user_id", userId).eq("status", "pending")
          .select("id, symbol, mirror_side, qty, price, created_at");
        if (error) {
          console.error("[integration] failed to claim pending orders", error.message);
          return json({ error: "claim failed" }, 500);
        }

        const resolvedById = new Map(valid.map(({ row, resolution }) => [row.id, resolution]));
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

        return json({
          orders: (data ?? []).map((row) => {
            const resolution = resolvedById.get(row.id)!;
            return {
              id: row.id,
              symbol: row.symbol,
              side: row.mirror_side,
              qty: Number(row.qty),
              lot: resolution.lot,
              lot_asset: resolution.assetKey ?? undefined,
              lot_day: resolution.day ?? undefined,
              price: row.price,
              created_at: row.created_at,
            };
          }),
          ...(lotErrors.length ? { lot_errors: lotErrors } : {}),
        });
      },
    },
  },
});
