import { createFileRoute } from "@tanstack/react-router";

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

function compareStates(previous: string | null, next: string) {
  const changes: Array<{ field: string; previous: unknown; next: unknown }> = [];
  let operation: Record<string, unknown> | undefined;
  let operationChanged = false;
  try {
    const before = previous ? JSON.parse(previous) as Record<string, unknown> : null;
    const after = JSON.parse(next) as Record<string, unknown>;
    const walk = (a: unknown, b: unknown, path: string) => {
      if (path === "activeTab" || path === "log" || path.startsWith("log.") || changes.length >= 20) return;
      if (a && b && typeof a === "object" && typeof b === "object") {
        if (Array.isArray(a) && Array.isArray(b)) {
          for (let i = 0; i < Math.min(a.length, b.length) && changes.length < 20; i++) walk(a[i], b[i], path ? path + "." + i : String(i));
          if (a.length !== b.length && changes.length < 20) changes.push({ field: path + ".length", previous: a.length, next: b.length });
          return;
        }
        if (!Array.isArray(a) && !Array.isArray(b)) {
          const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
          for (const key of keys) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? path + "." + key : key);
          return;
        }
      }
      if (a !== b && (a === null || ["string", "number", "boolean", "undefined"].includes(typeof a))
        && (b === null || ["string", "number", "boolean", "undefined"].includes(typeof b))) {
        changes.push({ field: path.slice(0, 180), previous: a ?? null, next: b ?? null });
      }
    };
    if (before) walk(before, after, "");
    const beforeLog = before && Array.isArray(before.log) ? before.log as Array<Record<string, unknown>> : [];
    const afterLog = Array.isArray(after.log) ? after.log as Array<Record<string, unknown>> : [];
    const oldOperation = beforeLog.at(-1);
    const newOperation = afterLog.at(-1);
    operationChanged = JSON.stringify(oldOperation ?? null) !== JSON.stringify(newOperation ?? null);
    if (operationChanged && newOperation) {
      operation = { asset: newOperation.asset, day: newOperation.day, type: newOperation.tipo };
    }
    return { changes, operation, operationChanged, initialSave: !before };
  } catch {
    return { changes: [], operation: undefined, operationChanged: false, initialSave: !previous };
  }
}

export const Route = createFileRoute("/api/plataforma/dados")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return json({ error: "unauthorized" }, 401);

        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).data !== "string") {
          return json({ error: "invalid_body" }, 400);
        }
        const value = (body as { data: string }).data;
        if (value.length > 200_000) return json({ error: "payload_too_large" }, 413);
        try {
          const parsed = JSON.parse(value);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid_state" }, 400);
        } catch {
          return json({ error: "invalid_state" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: previousRow, error: readError } = await supabaseAdmin.from("app_data")
          .select("data").eq("user_id", user.id).maybeSingle();
        if (readError) {
          console.error("[strategy] previous state read failed", readError.message);
          return json({ error: "read_failed" }, 500);
        }

        const { error: saveError } = await supabaseAdmin.from("app_data").upsert({
          user_id: user.id,
          data: value,
          updated_at: new Date().toISOString(),
        });
        if (saveError) {
          console.error("[strategy] state save failed", saveError.message);
          const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
            user_id: user.id,
            category: "strategy",
            action: "strategy.save_failed",
            outcome: "failed",
            details: { reason: "database_write_failed" },
          });
          if (auditError) console.error("[audit] failed-save event could not be stored", auditError.message);
          return json({ error: "save_failed" }, 500);
        }

        const diff = compareStates(previousRow?.data ?? null, value);
        if (diff.initialSave || diff.changes.length || diff.operationChanged) {
          const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
            user_id: user.id,
            category: "strategy",
            action: diff.operationChanged ? "strategy.action" : "strategy.updated",
            outcome: "success",
            details: {
              changes: diff.changes,
              operation: diff.operation,
              initial_state_saved: diff.initialSave,
            } as import("@/integrations/supabase/types").Json,
          });
          if (auditError) console.error("[audit] strategy change could not be stored", auditError.message);
        }
        return json({ ok: true });
      },
    },
  },
});
