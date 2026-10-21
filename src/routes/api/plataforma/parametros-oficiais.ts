import { createFileRoute } from "@tanstack/react-router";
import { isOfficialParams } from "@/lib/platform/official-params";
import type { Json } from "@/integrations/supabase/types";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function context(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return null;
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
    db.from("profiles").select("approved,rejected").eq("id", user.id).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  if (profileError || rolesError || !profile?.approved || profile.rejected) return null;
  return { db, userId: user.id, master: roles?.some(r => r.role === "admin") ?? false };
}

export const Route = createFileRoute("/api/plataforma/parametros-oficiais")({
  server: { handlers: {
    GET: async ({ request }) => {
      const ctx = await context(request);
      if (!ctx) return reply({ error: "unauthorized" }, 401);
      const { data, error } = await ctx.db.from("master_number_sync").select("published_values,updated_at").eq("id", "default").maybeSingle();
      if (error) return reply({ error: "read_failed" }, 503);
      const values = data?.published_values as Record<string, unknown> | undefined;
      const requested = new URL(request.url).searchParams.get("mesa");
      const mesa = requested === "lucid" || requested === "mff" ? requested : "tradefive";
      const collection = values?.official_parameters_by_mesa;
      const profiles = collection && typeof collection === "object" && !Array.isArray(collection) ? collection as Record<string, unknown> : {};
      const payload = profiles[mesa] ?? (mesa === "tradefive" ? values?.official_parameters : null);
      return reply({ published: isOfficialParams(payload) && (payload.mesaFuturos ?? "tradefive") === mesa ? { payload, updatedAt: data?.updated_at } : null });
    },
    POST: async ({ request }) => {
      const ctx = await context(request);
      if (!ctx) return reply({ error: "unauthorized" }, 401);
      if (!ctx.master) return reply({ error: "forbidden" }, 403);
      let payload: unknown;
      try { payload = (await request.json() as { payload?: unknown }).payload; } catch { return reply({ error: "invalid_json" }, 400); }
      if (!isOfficialParams(payload)) return reply({ error: "invalid_parameters" }, 400);
      const { data: old, error } = await ctx.db.from("master_number_sync").select("published_values").eq("id", "default").maybeSingle();
      if (error) return reply({ error: "read_failed" }, 503);
      const previous = old?.published_values;
      const fields = previous && typeof previous === "object" && !Array.isArray(previous) ? previous as Record<string, Json> : {};
      const mesa = payload.mesaFuturos ?? "tradefive";
      const previousProfiles = fields.official_parameters_by_mesa;
      const byMesa = previousProfiles && typeof previousProfiles === "object" && !Array.isArray(previousProfiles) ? previousProfiles as Record<string, Json> : {};
      const published_values = { ...fields, official_parameters_by_mesa: { ...byMesa, [mesa]: payload as unknown as Json } };
      const updated_at = new Date().toISOString();
      const result = old
        ? await ctx.db.from("master_number_sync").update({ published_values, updated_at }).eq("id", "default").select("id").single()
        : await ctx.db.from("master_number_sync").insert({ id: "default", admin_user_id: ctx.userId, enabled: false, allowed_fields: [], published_values, updated_at }).select("id").single();
      if (result.error) return reply({ error: "publish_failed" }, 503);
      return reply({ ok: true, updatedAt: updated_at });
    },
  } },
});
