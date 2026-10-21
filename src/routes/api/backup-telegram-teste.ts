import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/integracao.server";

// Somente teste de conectividade; nao exporta ou transmite dados do banco.
const DESTINO_AUTORIZADO = "-1003826563115";
const INTERVALO_MS = 10 * 60 * 1000;
let ultimoEnvio = 0;

export const Route = createFileRoute("/api/backup-telegram-teste")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
        if (!jwt) return json({ ok: false, error: "unauthorized" }, 401);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(jwt);
          if (authError || !auth.user) return json({ ok: false, error: "unauthorized" }, 401);

          const { data: roles, error: roleError } = await supabaseAdmin
            .from("user_roles").select("role").eq("user_id", auth.user.id);
          if (roleError || !roles?.some((row) => row.role === "admin")) {
            return json({ ok: false, error: "forbidden" }, 403);
          }

          const token = process.env.BACKUP_TELEGRAM_BOT_TOKEN?.trim();
          const chatId = process.env.BACKUP_TELEGRAM_CHAT_ID?.trim();
          if (!token || !chatId || chatId !== DESTINO_AUTORIZADO) {
            return json({ ok: false, error: "backup_telegram_not_configured" }, 503);
          }

          const agora = Date.now();
          if (agora - ultimoEnvio < INTERVALO_MS) {
            return json({ ok: false, error: "Aguarde 10 minutos antes de outro teste." }, 429);
          }
          // Reservar janela antes de enviar para reduzir testes duplicados.
          ultimoEnvio = agora;

          const { enviarTelegram } = await import("@/lib/telegram.server");
          const enviado = await enviarTelegram(
            "🧪 <b>Win or Win — teste do canal privado de backup</b>\nNenhum dado de produção foi enviado.",
            { botToken: token, chatId },
          );
          if (!enviado) return json({ ok: false, error: "telegram_delivery_failed" }, 502);
          return json({ ok: true });
        } catch {
          // Nunca retornar ou registrar tokens, URLs do bot ou mensagens internas.
          return json({ ok: false, error: "backup_telegram_test_failed" }, 500);
        }
      },
    },
  },
});
