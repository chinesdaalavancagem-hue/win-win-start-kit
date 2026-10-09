import { bearer, hashToken } from "./integracao";

// Resolve o dono do token; só contas aprovadas podem usar a integração.
export async function autenticarToken(request: Request): Promise<string | null> {
  const token = bearer(request);
  if (!token) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("integration_tokens").select("user_id").eq("token_hash", await hashToken(token)).maybeSingle();
  if (!data) return null;
  const { data: ok } = await supabaseAdmin.rpc("is_approved", { _user_id: data.user_id });
  return ok ? data.user_id : null;
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
