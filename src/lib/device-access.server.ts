import { supabaseAdmin } from "@/integrations/supabase/client.server";

const COOKIE = "wow_device";
const YEAR = 365 * 24 * 60 * 60;

export function deviceType(userAgent: string): "mobile" | "desktop" {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ? "mobile" : "desktop";
}

export async function hashDeviceToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export function readDeviceToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map(s => s.trim()).find(s => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function deviceCookie(token: string): string {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${YEAR}`;
}

export async function isDeviceAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Falha fechada: token válido + status aprovado ou privilégio administrativo. */
export async function deviceAllowed(request: Request, userId: string): Promise<boolean> {
  if (await isDeviceAdmin(userId)) return true;
  const token = readDeviceToken(request);
  if (!token) return false;
  const hash = await hashDeviceToken(token);
  const { data, error } = await supabaseAdmin.from("device_access").select("status")
    .eq("user_id", userId).eq("token_hash", hash).maybeSingle();
  if (error) throw error;
  return data?.status === "approved";
}

export async function registerOrCheckDevice(request: Request, userId: string) {
  if (await isDeviceAdmin(userId)) return { allowed: true, cookie: null as string | null };
  const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("approved,rejected").eq("id", userId).maybeSingle();
  if (profileError) throw profileError;
  // A aprovação do cadastro é controlada separadamente; não registra dispositivo antes dela.
  if (!profile?.approved || profile.rejected) return { allowed: true, cookie: null as string | null };
  let token = readDeviceToken(request);
  const fresh = !token;
  if (!token) token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashDeviceToken(token);
  const { data: existing, error: readError } = await supabaseAdmin.from("device_access")
    .select("id,status,device_type").eq("user_id", userId).eq("token_hash", tokenHash).maybeSingle();
  if (readError) throw readError;
  const cookie = fresh ? deviceCookie(token) : null;
  if (existing) {
    if (existing.status === "approved") {
      await supabaseAdmin.from("device_access").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
    }
    return { allowed: existing.status === "approved", cookie };
  }
  const type = deviceType(request.headers.get("user-agent") ?? "");
  const { data: newDevice, error: insertError } = await supabaseAdmin.from("device_access")
    .insert({ user_id: userId, token_hash: tokenHash, device_type: type, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300), status: "pending" })
    .select("id").single();
  if (insertError || !newDevice) throw insertError ?? new Error("device registration unavailable");
  const { count, error: countError } = await supabaseAdmin.from("device_access")
    .select("id", { count: "exact", head: true }).eq("user_id", userId).eq("device_type", type).eq("status", "approved");
  if (countError) throw countError;
  if (!count) {
    // Primeiro navegador desta categoria. Índice único impede dois registros aprovados simultaneamente.
    const { error } = await supabaseAdmin.from("device_access").update({ status: "approved", last_seen_at: new Date().toISOString() }).eq("id", newDevice.id);
    if (!error) return { allowed: true, cookie };
  }
  return { allowed: false, cookie };
}
