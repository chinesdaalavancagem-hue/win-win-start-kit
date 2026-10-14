import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Salva o Chat ID do Telegram do usuário. O bot é o mesmo do servidor;
// cada usuário só registra o Chat ID dele.
export const salvarChatId = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const chatId = (d as { chatId?: unknown })?.chatId;
    if (typeof chatId !== "string") throw new Error("Chat ID inválido");
    const v = chatId.trim();
    if (!/^-?\d{3,20}$/.test(v)) throw new Error("Chat ID inválido");
    return v;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ telegram_chat_id: data }).eq("id", context.userId);
    if (error) throw new Error("Não foi possível salvar o Chat ID");
    try {
      const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        category: "integration",
        action: "integration.telegram_chat_saved",
        outcome: "success",
        details: {},
      });
      if (auditError) console.error("[audit] telegram chat save event failed", auditError.message);
    } catch {
      console.error("[audit] telegram chat save logging failed");
    }
    return { ok: true };
  });
