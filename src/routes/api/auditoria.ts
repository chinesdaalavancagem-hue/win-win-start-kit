import { createFileRoute } from "@tanstack/react-router";

const CATEGORIES = new Set(["auth", "strategy", "integration", "navigation", "system"]);
const OUTCOMES = new Set(["success", "failed", "denied", "started", "unknown"]);
const ACTIONS = new Set([
  "login.success", "login.failed", "signup.success", "logout",
  "strategy.updated", "strategy.save_failed", "strategy.action", "strategy.undo",
  "integration.key_generated", "integration.key_failed",
  "integration.download_requested", "integration.download_failed",
  "integration.connection_test", "integration.disconnected",
  "integration.file_published", "integration.order_received", "integration.order_dispatched",
  "integration.order_confirmed", "integration.order_failed", "navigation.opened",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function authenticatedUser(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

function safeDetails(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const forbidden = /password|secret|token|authorization|cookie|cpf|phone|email|key/i;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, 20)) {
    if (forbidden.test(key)) continue;
    if (typeof value === "string") result[key] = value.slice(0, 240);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) result[key] = value;
    else if (Array.isArray(value)) result[key] = value.slice(0, 20).map((item) => {
      if (typeof item === "string") return item.slice(0, 120);
      if (typeof item === "number" || typeof item === "boolean" || item === null) return item;
      if (item && typeof item === "object") {
        const safe: Record<string, unknown> = {};
        for (const [childKey, childValue] of Object.entries(item as Record<string, unknown>).slice(0, 10)) {
          if (forbidden.test(childKey)) continue;
          if (typeof childValue === "string") safe[childKey] = childValue.slice(0, 120);
          else if (typeof childValue === "number" || typeof childValue === "boolean" || childValue === null) safe[childKey] = childValue;
        }
        return safe;
      }
      return undefined;
    });
  }
  try {
    if (JSON.stringify(result).length > 2500) return { truncated: true };
  } catch {
    return {};
  }
  return result;
}

export const Route = createFileRoute("/api/auditoria")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return json({ error: "unauthorized" }, 401);

        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_body" }, 400);
        const event = body as Record<string, unknown>;
        if (typeof event.category !== "string" || !CATEGORIES.has(event.category)
          || typeof event.action !== "string" || !ACTIONS.has(event.action)
          || (event.outcome !== undefined && (typeof event.outcome !== "string" || !OUTCOMES.has(event.outcome)))) {
          return json({ error: "invalid_event" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("audit_logs").insert({
          user_id: user.id,
          category: event.category,
          action: event.action,
          outcome: typeof event.outcome === "string" ? event.outcome : "success",
          details: safeDetails(event.details) as import("@/integrations/supabase/types").Json,
          request_id: crypto.randomUUID(),
        });
        if (error) {
          console.error("[audit] insert failed", error.message);
          return json({ error: "audit_write_failed" }, 500);
        }
        return json({ ok: true }, 201);
      },
      GET: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return json({ error: "unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: roles, error: roleError } = await supabaseAdmin.from("user_roles")
          .select("role").eq("user_id", user.id);
        if (roleError || !roles?.some((row) => row.role === "admin")) return json({ error: "forbidden" }, 403);

        const url = new URL(request.url);
        const category = url.searchParams.get("category");
        const userId = url.searchParams.get("userId");
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
        let query = supabaseAdmin.from("audit_logs")
          .select("id,user_id,category,action,outcome,details,request_id,created_at")
          .order("created_at", { ascending: false }).limit(limit);
        if (category && CATEGORIES.has(category)) query = query.eq("category", category);
        if (userId) {
          if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "invalid_user_id" }, 400);
          query = query.eq("user_id", userId);
        }

        const { data: logs, error } = await query;
        if (error) {
          console.error("[audit] read failed", error.message);
          return json({ error: "audit_read_failed" }, 500);
        }
        const ids = [...new Set((logs ?? []).map((row) => row.user_id))];
        const { data: profiles } = ids.length
          ? await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", ids)
          : { data: [] as { id: string; full_name: string; email: string }[] };
        const users = new Map((profiles ?? []).map((profile) => [profile.id, {
          full_name: profile.full_name, email: profile.email,
        }]));
        return json({
          logs: (logs ?? []).map((row) => ({ ...row, user: users.get(row.user_id) ?? null })),
        });
      },
    },
  },
});
