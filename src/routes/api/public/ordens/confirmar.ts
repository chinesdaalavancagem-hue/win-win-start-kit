import { createFileRoute } from "@tanstack/react-router";
import { confirmarSchema } from "@/lib/integracao";
import { autenticarToken, json } from "@/lib/integracao.server";
import { enviarTelegram, chatIdDoUsuario } from "@/lib/telegram.server";

async function enviarTelegramComTimeout(mensagem: string, chatId?: string): Promise<void> {
  try {
    await enviarTelegram(mensagem, { chatId });
  } catch {
    // Falhas de notificação não podem afetar o processamento da ordem.
  }
}


// O robô do MT5 informa se executou (done) ou falhou (error).
export const Route = createFileRoute("/api/public/ordens/confirmar")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await autenticarToken(request);
        if (!userId) return json({ error: "unauthorized" }, 401);
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }
        const p = confirmarSchema.safeParse(body);
        if (!p.success) return json({ error: "invalid body" }, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("order_queue")
          .update({ status: p.data.status, error: p.data.error ?? null, updated_at: new Date().toISOString() })
          .eq("id", p.data.id).eq("user_id", userId).eq("status", "sent").select("id,symbol").maybeSingle();
        if (error) { console.error(error); return json({ error: "update failed" }, 500); }
        if (!data) return json({ error: "not found" }, 404);
        const succeeded = p.data.status === "done";
        const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
          user_id: userId,
          category: "integration",
          action: succeeded ? "integration.order_confirmed" : "integration.order_failed",
          outcome: succeeded ? "success" : "failed",
          details: { order_id: data.id, symbol: data.symbol, error_reported: !succeeded },
        });
        if (auditError) console.error("[audit] order confirmation event failed", auditError.message);
        const chatId = await chatIdDoUsuario(userId);
        await enviarTelegramComTimeout(`✅ <b>Ordem Executada no MetaTrader 5</b>\n<b>Ativo:</b> ${data.symbol}\n<b>Status:</b> ${p.data.status}${p.data.error ? `\n<b>Erro:</b> ${p.data.error}` : ""}`, chatId ?? undefined);
        void import("@/lib/push.server").then(({ enviarPushAoUsuario }) =>
          enviarPushAoUsuario(userId, {
            title: succeeded ? "✅ Ordem Executada no MT5" : "⚠️ Falha na Ordem no MT5",
            body: `Ativo: ${data.symbol} | Status: ${p.data.status}`,
            url: "/plataforma",
          }),
        ).catch(() => {
          // Push é best-effort; a confirmação e o alerta do Telegram não dependem dele.
        });
        return json({ ok: true });
      },
    },
  },
});
