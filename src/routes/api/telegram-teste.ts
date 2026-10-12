import { createFileRoute } from "@tanstack/react-router";
import { enviarTelegram } from "@/lib/telegram.server";
import { json } from "@/lib/integracao.server";

export const Route = createFileRoute("/api/telegram-teste")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let body: unknown = {};
          try { body = await request.json(); } catch { /* usa configuração padrão */ }
          const input = body && typeof body === "object" ? body as { botToken?: unknown; chatId?: unknown } : {};
          const botToken = typeof input.botToken === "string" ? input.botToken.trim() : "";
          const chatId = typeof input.chatId === "string" ? input.chatId.trim() : "";
          const tokenConfigurado = botToken || process.env.TELEGRAM_BOT_TOKEN?.trim();
          const chatConfigurado = chatId || process.env.TELEGRAM_CHAT_ID?.trim();
          if (!tokenConfigurado || !chatConfigurado) {
            return json({ ok: false, error: "Configure o botToken e o chatId ou as variáveis TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID." }, 400);
          }
          const enviado = await enviarTelegram("🧪 <b>Teste de Notificação — Win or Win</b>\nSeu bot do Telegram está configurado para receber alertas.", {
            botToken: botToken || undefined,
            chatId: chatId || undefined,
          });
          if (!enviado) return json({ ok: false, error: "O Telegram não confirmou o envio. Verifique o token, o Chat ID e se você iniciou uma conversa com o bot." }, 502);
          return json({ ok: true });
        } catch {
          return json({ ok: false, error: "Não foi possível iniciar o teste do Telegram." }, 500);
        }
      },
    },
  },
});
