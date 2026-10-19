import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { autenticarToken, json } from "@/lib/integracao.server";
import { enviarTelegram, chatIdDoUsuario } from "@/lib/telegram.server";
import { enviarPushAoUsuario } from "@/lib/push.server";

// O Python envia a chave no JSON; nunca devolvemos nem registramos esse segredo.
const hedgeSchema = z.object({
  chave: z.string().min(20).max(200),
  simbolo: z.string().trim().min(1).max(40),
  acao: z.string().trim().toUpperCase().pipe(z.enum(["BUY", "SELL"])),
  lote: z.number().finite().positive().max(10000),
  ticket: z.union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative()]).optional(),
  preco: z.number().finite().positive().optional(),
  status: z.enum(["executado", "erro"]),
  horario: z.string().max(40).optional(),
  mensagem: z.string().max(500).optional(),
}).strict();

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const Route = createFileRoute("/api/public/notificacoes-hedge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Limita o tamanho antes de processar entradas externas.
        if (Number(request.headers.get("content-length") || 0) > 8192) {
          return json({ error: "payload too large" }, 413);
        }
        let body: unknown;
        try {
          const raw = await request.text();
          if (raw.length > 8192) return json({ error: "payload too large" }, 413);
          body = JSON.parse(raw);
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        const parsed = hedgeSchema.safeParse(body);
        if (!parsed.success) return json({ error: "invalid body" }, 400);
        const { chave, simbolo, acao, lote, ticket, preco, status, horario, mensagem } = parsed.data;

        // Reutiliza a autenticação aprovada das integrações, sem duplicar regras.
        const headers = new Headers(request.headers);
        headers.set("authorization", `Bearer ${chave}`);
        const auth = await autenticarToken(new Request(request.url, { method: "POST", headers }));
        if (auth.status === 401 || !auth.userId && auth.status !== 500) {
          return json({ error: "unauthorized" }, 401);
        }
        if (auth.status === 500 || !auth.userId) {
          return json({ error: "auth_unavailable" }, 500);
        }

        const sucesso = status === "executado";
        const titulo = sucesso ? "Ordem de Hedge Executada" : "Falha na Execução do Hedge";
        const descricao = `${acao} ${lote} no ${simbolo}`;
        const detalhes = [
          `<b>Ativo:</b> ${escapeHtml(simbolo)}`,
          `<b>Ação:</b> ${acao}`,
          `<b>Lote:</b> ${lote}`,
          preco !== undefined ? `<b>Preço:</b> ${preco}` : null,
          ticket !== undefined ? `<b>Ticket:</b> ${escapeHtml(String(ticket))}` : null,
          horario ? `<b>Horário:</b> ${escapeHtml(horario)}` : null,
          mensagem ? `<b>Mensagem:</b> ${escapeHtml(mensagem)}` : null,
        ].filter(Boolean).join("\n");

        // Aguarda o envio best-effort: não declara notificação antes de tentar enviá-la.
        // Telegram sem chat próprio não deve cair no chat global da Master.
        const [telegram, push] = await Promise.allSettled([
          (async () => {
            const chatId = await chatIdDoUsuario(auth.userId);
            return chatId ? enviarTelegram(`${sucesso ? "✅" : "❌"} <b>${titulo} — MT5</b>\n\n${detalhes}`, { chatId }) : false;
          })(),
          enviarPushAoUsuario(auth.userId, {
            title: `${titulo}: ${descricao}`,
            body: mensagem || (sucesso ? "Execução confirmada pelo MetaTrader 5." : "O MT5 informou erro na execução."),
            url: "/plataforma",
          }),
        ]);
        const telegramEnviado = telegram.status === "fulfilled" && telegram.value;
        const pushProcessado = push.status === "fulfilled";
        return json({ ok: true, notificado: Boolean(telegramEnviado || pushProcessado) });
      },
    },
  },
});
