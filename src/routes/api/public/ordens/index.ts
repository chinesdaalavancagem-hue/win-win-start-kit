import { createFileRoute } from "@tanstack/react-router";
import { mirrorSide, ordemSchema } from "@/lib/integracao";
import { autenticarToken, json } from "@/lib/integracao.server";

export const Route = createFileRoute("/api/public/ordens/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await autenticarToken(request);
        if (auth.status === 401) return json({ error: "unauthorized" }, 401);
        if (auth.status === 500) return json({ error: "auth_unavailable" }, 500);
        const userId = auth.userId;
        if (!userId) return json({ error: "unauthorized" }, 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid json" }, 400);
        }

        const parsed = ordemSchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "invalid order", issues: parsed.error.flatten().fieldErrors }, 400);
        }
        const o = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("order_queue").upsert(
          {
            user_id: userId,
            external_id: o.id,
            symbol: o.symbol,
            side: o.side,
            mirror_side: mirrorSide(o.side),
            qty: o.qty,
            price: o.price ?? null,
          },
          { onConflict: "user_id,external_id", ignoreDuplicates: true },
        ).select("id").maybeSingle();

        if (error) {
          console.error(error);
          return json({ error: "queue failed" }, 500);
        }

        const isNewOrder = Boolean(data);

        const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
          user_id: userId,
          category: "integration",
          action: "integration.order_received",
          outcome: isNewOrder ? "success" : "unknown",
          details: { symbol: o.symbol, qty: o.qty, side: o.side, duplicate: !isNewOrder },
        });
        if (auditError) console.error("[audit] incoming order event failed", auditError.message);

        // Notifica o trader via Telegram e Push no celular quando uma ordem real for recebida
        if (isNewOrder) {
          void (async () => {
            try {
              const [{ enviarTelegram, chatIdDoUsuario }, { enviarPushAoUsuario }] = await Promise.all([
                import("@/lib/telegram.server"),
                import("@/lib/push.server"),
              ]);

              const operacao = o.side === "buy" ? "🟢 COMPRA" : "🔴 VENDA";
              const espelho = mirrorSide(o.side) === "buy" ? "COMPRA" : "VENDA";
              const msgTelegram = `⚡ <b>Nova Ordem Recebida — Tradovate</b>\n\n<b>Ativo:</b> ${o.symbol}\n<b>Operação na Mesa:</b> ${operacao} (${o.qty} ctr)\n<b>Espelhamento CFD:</b> ${espelho}\n${o.price ? `<b>Preço:</b> ${o.price}\n` : ""}<b>Status:</b> Na fila para execução no MT5</b>`;

              const chatId = await chatIdDoUsuario(userId);
              if (chatId) {
                await enviarTelegram(msgTelegram, { chatId });
              }

              await enviarPushAoUsuario(userId, {
                title: `Ordem Tradovate: ${operacao} ${o.qty} ${o.symbol}`,
                body: `Espelhamento ${espelho} enviado para o MT5.`,
                url: "/plataforma",
              });
            } catch (err) {
              console.error("[notificacoes] falha silenciosa ao enviar alertas de ordem:", err);
            }
          })();
        }

        return json({ ok: true, id: data?.id ?? null, duplicate: !isNewOrder }, isNewOrder ? 201 : 200);
      },
    },
  },
});
