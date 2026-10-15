import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MASTER_SYNC_FIELDS, extractMasterSyncValues } from "@/lib/platform/master-sync";

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

async function isAdmin(supabaseAdmin: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabaseAdmin.from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !error && !!data;
}

export const Route = createFileRoute("/api/plataforma/sincronizacao-numeros")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return json({ error: "unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profile } = await supabaseAdmin.from("profiles").select("approved,rejected")
          .eq("id", user.id).maybeSingle();
        if (!profile?.approved || profile.rejected) return json({ error: "account_not_approved" }, 403);
        const admin = await isAdmin(supabaseAdmin, user.id);
        const { data: config, error } = await supabaseAdmin.from("master_number_sync")
          .select("admin_user_id,enabled,allowed_fields,published_values,updated_at").eq("id", "default").maybeSingle();
        if (error) return json({ error: "sync_unavailable" }, 503);
        if (!config) return json({ enabled: false, allowedFields: [], values: {}, updatedAt: null, isAdmin: admin });
        if (admin && config.admin_user_id !== user.id) return json({ error: "master_mismatch" }, 403);
        return json({
          enabled: !!config.enabled,
          allowedFields: admin ? config.allowed_fields : [],
          values: config.enabled ? config.published_values : {},
          updatedAt: config.updated_at,
          isAdmin: admin,
        });
      },
      POST: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return json({ error: "unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!(await isAdmin(supabaseAdmin, user.id))) return json({ error: "forbidden" }, 403);
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        if (!body || typeof body !== "object") return json({ error: "invalid_body" }, 400);
        const input = body as Record<string, unknown>;
        if (typeof input.enabled !== "boolean" || !Array.isArray(input.allowedFields)) return json({ error: "invalid_body" }, 400);
        const validIds = new Set<string>(MASTER_SYNC_FIELDS.map((field) => field.id));
        if (!input.allowedFields.every((field) => typeof field === "string" && validIds.has(field))) {
          return json({ error: "invalid_fields" }, 400);
        }
        const allowedFields = [...new Set(input.allowedFields as string[])];

        // Depois que a primeira Master é registrada, nenhum outro administrador pode
        // assumir a publicação global nem substituir sua configuração.
        const { data: existingConfig, error: configReadError } = await supabaseAdmin
          .from("master_number_sync").select("admin_user_id").eq("id", "default").maybeSingle();
        if (configReadError) return json({ error: "sync_unavailable" }, 503);
        if (existingConfig && existingConfig.admin_user_id !== user.id) {
          return json({ error: "master_mismatch" }, 403);
        }
        const { data: masterRow, error: masterError } = await supabaseAdmin.from("app_data")
          .select("data").eq("user_id", user.id).maybeSingle();
        if (masterError || !masterRow?.data) return json({ error: "master_data_unavailable" }, 409);
        let values: Record<string, number[]>;
        try { values = extractMasterSyncValues(masterRow.data, allowedFields); }
        catch { return json({ error: "invalid_master_data" }, 409); }
        const { error: saveError } = await supabaseAdmin.from("master_number_sync").upsert({
          id: "default",
          admin_user_id: user.id,
          enabled: input.enabled,
          allowed_fields: allowedFields,
          published_values: values,
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
        if (saveError) {
          console.error("[master-number-sync] save failed", saveError.message);
          return json({ error: "save_failed" }, 500);
        }
        await supabaseAdmin.from("audit_logs").insert({
          user_id: user.id, category: "strategy", action: input.enabled ? "master_sync.enabled" : "master_sync.locked",
          outcome: "success", details: { allowed_fields: allowedFields, enabled: input.enabled },
        });
        return json({ ok: true, enabled: input.enabled, allowedFields, values, updatedAt: new Date().toISOString() });
      },
    },
  },
});
