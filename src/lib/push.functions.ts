import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PushInput = { endpoint: string; keys: { p256dh: string; auth: string } };

export const salvarInscricaoPush = createServerFn({ method: "POST" })
  .inputValidator((value: unknown): PushInput => {
    const v = value as Partial<PushInput>;
    if (!v || typeof v.endpoint !== "string" || !v.endpoint.startsWith("https://") ||
      typeof v.keys?.p256dh !== "string" || typeof v.keys?.auth !== "string") {
      throw new Error("Inscrição de push inválida");
    }
    return { endpoint: v.endpoint, keys: { p256dh: v.keys.p256dh, auth: v.keys.auth } };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert({
      user_id: context.userId, endpoint: data.endpoint,
      p256dh: data.keys.p256dh, auth: data.keys.auth,
    }, { onConflict: "user_id,endpoint" });
    if (error) throw new Error("Não foi possível salvar a inscrição de notificações");
    return { ok: true };
  });

export const enviarPushTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { enviarPushAoUsuario } = await import("@/lib/push.server");
    await enviarPushAoUsuario(context.userId, {
      title: "🧪 Teste de Notificação — Win or Win",
      body: "Seu aparelho está configurado para receber notificações push.",
      url: "/plataforma",
    });
    return { ok: true };
  });
