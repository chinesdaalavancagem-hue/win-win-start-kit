import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { autenticarToken, json } from "@/lib/integracao.server";

// TopstepX VPS: somente eventos visuais; esta rota NUNCA grava em order_queue,
// NUNCA chama MT5 e NUNCA reconhece eventos como fills oficiais.
const base = {
  event_id: z.string().uuid(),
  session_id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  client_seq: z.number().int().min(0).max(2_000_000_000),
  observed_at_ms: z.number().int().nonnegative(),
  symbol: z.enum(["MGC", "MNQ"]),
};
const observationSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("position"),
    net_contracts: z.number().int().min(-100).max(100),
    practice_visible: z.literal(true) }).strict(),
  z.object({ ...base, kind: z.literal("card"),
    day: z.number().int().min(1).max(365),
    phase: z.enum(["AVALIACAO", "FINANCIADA"]),
    planned_contracts: z.number().int().min(1).max(100),
    card_lot: z.number().finite().positive().max(100),
    card_confirmed: z.literal(true) }).strict(),
]);

async function auth(request: Request) {
  return autenticarToken(request);
}

export const Route = createFileRoute("/api/public/topstep-vps/observacoes/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authenticated = await auth(request);
        if (authenticated.status !== 200 || !authenticated.userId)
          return json({ error: "unauthorized" }, authenticated.status);
        if (!(request.headers.get("content-type") || "").includes("application/json"))
          return json({ error: "invalid_content_type" }, 415);
        if (Number(request.headers.get("content-length") || "0") > 4096)
          return json({ error: "payload_too_large" }, 413);
        let raw = "";
        try { raw = await request.text(); }
        catch { return json({ error: "invalid_body" }, 400); }
        if (raw.length > 4096) return json({ error: "payload_too_large" }, 413);
        let body: unknown;
        try { body = JSON.parse(raw); }
        catch { return json({ error: "invalid_json" }, 400); }
        const parsed = observationSchema.safeParse(body);
        if (!parsed.success) return json({ error: "invalid_observation" }, 400);
        const o = parsed.data;
        // Eventos atrasados, reprocessados apos F5 ou gerados no futuro
        // sao descartados. Sem "catch-up" de eventos de negociacao.
        const age = Date.now() - o.observed_at_ms;
        if (age < -5000 || age > 15000)
          return json({ error: "stale_observation" }, 409);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("topstep_vps_observations")
          .upsert({
            user_id: authenticated.userId, event_id: o.event_id,
            session_id: o.session_id, client_seq: o.client_seq,
            kind: o.kind, observed_at_ms: o.observed_at_ms,
            payload: o,
          }, { onConflict: "user_id,event_id", ignoreDuplicates: true })
          .select("id").maybeSingle();
        if (error) return json({ error: "relay_unavailable" }, 503);
        return json({ ok: true, stored: Boolean(data), orders_enabled: false },
          data ? 201 : 200);
      },
      GET: async ({ request }) => {
        const authenticated = await auth(request);
        if (authenticated.status !== 200 || !authenticated.userId)
          return json({ error: "unauthorized" }, authenticated.status);
        const url = new URL(request.url);
        const rawAfter = url.searchParams.get("after") ?? "0";
        if (!/^(0|[1-9][0-9]{0,15})$/.test(rawAfter))
          return json({ error: "invalid_cursor" }, 400);
        const after = Number(rawAfter);
        if (!Number.isSafeInteger(after)) return json({ error: "invalid_cursor" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // A primeira consulta carrega apenas as ultimas 30 observacoes,
        // para nao percorrer um historico antigo antes das novas.
        let query = supabaseAdmin.from("topstep_vps_observations")
          .select("id,event_id,session_id,client_seq,kind,observed_at_ms,payload,received_at")
          .eq("user_id", authenticated.userId)
          .gte("received_at", new Date(Date.now() - 120000).toISOString());
        if (after > 0) query = query.gt("id", after);
        const { data, error } = await query.order("id", { ascending: after > 0 }).limit(30);
        if (error) return json({ error: "relay_unavailable" }, 503);
        const events = after === 0 ? (data ?? []).reverse() : (data ?? []);
        const last = events.length ? Number(events[events.length - 1].id) : after;
        return json({ ok: true, mode: "OBSERVACAO_SEM_ORDENS",
          events, next_cursor: last, orders_enabled: false });
      },
    },
  },
});
