import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deviceAllowed, isDeviceAdmin, registerOrCheckDevice } from "@/lib/device-access.server";

function json(body: unknown, status = 200, cookie?: string | null) {
  return new Response(JSON.stringify(body), { status, headers: {
    "content-type": "application/json", "cache-control": "no-store",
    ...(cookie ? { "set-cookie": cookie } : {}),
  } });
}

async function userFrom(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data.user;
}

export const Route = createFileRoute("/api/dispositivos/")({
  server: { handlers: {
    GET: async ({ request }) => {
      const user = await userFrom(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      try {
        const admin = await isDeviceAdmin(user.id);
        if (new URL(request.url).searchParams.get("admin") === "1") {
          if (!admin) return json({ error: "unauthorized" }, 403);
          const { data, error } = await supabaseAdmin.from("device_access")
            .select("id,user_id,device_type,user_agent,status,created_at,last_seen_at").order("created_at", { ascending: false }).limit(200);
          if (error) throw error;
          const ids = [...new Set((data ?? []).map(r => r.user_id))];
          const { data: profiles } = ids.length ? await supabaseAdmin.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
          return json({ devices: (data ?? []).map(r => ({ ...r, name: profiles?.find(p => p.id === r.user_id)?.full_name ?? "Usuário", email: profiles?.find(p => p.id === r.user_id)?.email ?? "" })) });
        }
        const result = await registerOrCheckDevice(request, user.id);
        return json({ allowed: result.allowed }, 200, result.cookie);
      } catch {
        return json({ allowed: false, error: "device_unavailable" }, 503);
      }
    },
    POST: async ({ request }) => {
      const user = await userFrom(request);
      if (!user || !(await isDeviceAdmin(user.id))) return json({ error: "unauthorized" }, 403);
      const body = await request.json().catch(() => null) as { deviceId?: unknown; action?: unknown } | null;
      if (!body || typeof body.deviceId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.deviceId) || !["approve", "revoke", "deny"].includes(String(body.action))) return json({ error: "invalid_request" }, 400);
      try {
        if (body.action === "approve") {
          const { data, error } = await supabaseAdmin.rpc("approve_device_access", { p_device_id: body.deviceId, p_admin_id: user.id });
          if (error) throw error;
          return json({ ok: data === true });
        }
        const { error } = await supabaseAdmin.from("device_access").update({ status: "revoked", decided_at: new Date().toISOString(), decided_by: user.id }).eq("id", body.deviceId);
        if (error) throw error;
        return json({ ok: true });
      } catch { return json({ error: "action_failed" }, 503); }
    },
  } },
});
