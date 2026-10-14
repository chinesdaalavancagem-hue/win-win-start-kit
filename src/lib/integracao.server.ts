import { bearer, hashToken } from "./integracao";

type IntegrationAuthResult =
  | { userId: string; status: 200 }
  | { userId: null; status: 401 | 500 };

function safeDiagnosticMessage(error: unknown, sensitiveValues: string[] = []): string {
  let message = error instanceof Error ? error.message : "Falha desconhecida na autenticação da integração";
  for (const value of sensitiveValues) {
    if (value) message = message.split(value).join("[redacted]");
  }
  message = message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 200);
  return message;
}

// Resolve o dono do token; nunca registra o token, hash, e-mail ou ID de usuário.
export async function autenticarToken(request: Request): Promise<IntegrationAuthResult> {
  const token = bearer(request);
  if (!token) {
    console.warn("[integration-auth]", { status: 401, message: "Authorization Bearer ausente ou malformado" });
    return { userId: null, status: 401 };
  }

  let tokenHash = "";
  try {
    tokenHash = await hashToken(token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("integration_tokens")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      console.error("[integration-auth]", {
        status: 500,
        message: safeDiagnosticMessage(error, [token, tokenHash]),
      });
      return { userId: null, status: 500 };
    }
    if (!data) {
      console.warn("[integration-auth]", { status: 401, message: "Chave não encontrada em integration_tokens" });
      return { userId: null, status: 401 };
    }

    const { data: ok, error: approvalError } = await supabaseAdmin.rpc("is_approved", { _user_id: data.user_id });
    if (approvalError) {
      console.error("[integration-auth]", {
        status: 500,
        message: safeDiagnosticMessage(approvalError, [token, tokenHash, data.user_id]),
      });
      return { userId: null, status: 500 };
    }
    if (!ok) {
      console.warn("[integration-auth]", { status: 401, message: "Conta associada à chave não aprovada" });
      return { userId: null, status: 401 };
    }
    return { userId: data.user_id, status: 200 };
  } catch (error) {
    console.error("[integration-auth]", {
      status: 500,
      message: safeDiagnosticMessage(error, [token, tokenHash]),
    });
    return { userId: null, status: 500 };
  }
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
