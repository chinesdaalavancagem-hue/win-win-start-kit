import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PushInput = { endpoint: string; keys: { p256dh: string; auth: string } };

function validarInscricaoPush(value: unknown): PushInput {
  const v = value as Partial<PushInput> | null;
  if (!v || typeof v.endpoint !== "string" || typeof v.keys?.p256dh !== "string" ||
    typeof v.keys?.auth !== "string") {
    throw new Error("Inscrição de push inválida");
  }
  let endpoint: URL;
  try { endpoint = new URL(v.endpoint); } catch { throw new Error("Endpoint de push inválido"); }
  const host = endpoint.hostname.toLowerCase();
  const allowedHost = host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host === "push.services.mozilla.com" ||
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com");
  if (endpoint.protocol !== "https:" || !allowedHost || endpoint.username || endpoint.password ||
    v.keys.p256dh.length > 256 || v.keys.auth.length > 256) {
    throw new Error("Endpoint de push inválido");
  }
  return { endpoint: endpoint.toString(), keys: { p256dh: v.keys.p256dh, auth: v.keys.auth } };
}

export const salvarInscricaoPush = createServerFn({ method: "POST" })
  .inputValidator(validarInscricaoPush)
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert({
      user_id: context.userId,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
    }, { onConflict: "user_id,endpoint" });
    if (error) throw new Error("Não foi possível salvar a inscrição de notificações");
    return { ok: true };
  });

export const enviarPushTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
      throw new Error("As chaves VAPID não estão configuradas no servidor.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if (error) throw new Error("Não foi possível verificar as inscrições de notificações.");
    if (!count) throw new Error("Ative as notificações neste aparelho antes de enviar um teste.");

    const { enviarPushAoUsuario } = await import("@/lib/push.server");
    await enviarPushAoUsuario(context.userId, {
      title: "🧪 Teste de Notificação — Win or Win",
      body: "Seu aparelho está configurado para receber notificações push.",
      url: "/plataforma",
    });
    return { ok: true };
  });
