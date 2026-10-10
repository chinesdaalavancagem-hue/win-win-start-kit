import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hashToken } from "./integracao";

// Gera uma nova chave (a anterior deixa de valer). Só é mostrada uma vez.
export const gerarChave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("is_approved", { _user_id: context.userId });
    if (!ok) throw new Error("Conta não aprovada");
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = "wow_" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("integration_tokens")
      .upsert({ user_id: context.userId, token_hash: await hashToken(token), created_at: new Date().toISOString() });
    if (error) throw new Error("Não foi possível gerar a chave");
    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      category: "integration",
      action: "integration.key_generated",
      outcome: "success",
      details: { token_material_stored_as_hash: true },
    });
    if (auditError) console.error("[audit] key generation event failed", auditError.message);
    return { token };
  });
