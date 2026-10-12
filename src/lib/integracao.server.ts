import { bearer, hashToken } from "./integracao";

// Resolve o dono do token; nunca registra o token nem seu hash.
export async function autenticarToken(request: Request): Promise<string | null> {
  const token = bearer(request);
  if (!token) {
    console.warn("[integration-auth]", { status: 401, message: "Authorization Bearer ausente ou malformado" });
    return null;
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("integration_tokens")
      .select("user_id")
      .eq("token_hash", await hashToken(token))
      .maybeSingle();

    if (error) {
      console.error("[integration-auth]", { status: 500, message: error.message });
      return null;
    }
    if (!data) {
      console.warn("[integration-auth]", { status: 401, message: "Chave não encontrada em integration_tokens" });
      return null;
    }

    const { data: ok, error: approvalError } = await supabaseAdmin.rpc("is_approved", { _user_id: data.user_id });
    if (approvalError) {
      console.error("[integration-auth]", { status: 500, message: approvalError.message });
      return null;
    }
    if (!ok) {
      console.warn("[integration-auth]", { status: 401, message: "Conta associada à chave não aprovada" });
      return null;
    }
    return data.user_id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na autenticação da integração";
    console.error("[integration-auth]", { status: 500, message });
    return null;
  }
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
