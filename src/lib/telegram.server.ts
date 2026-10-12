type TelegramOptions = { botToken?: string; chatId?: string };

export async function enviarTelegram(
  mensagem: string,
  options: TelegramOptions = {},
): Promise<boolean> {
  try {
    const token = options.botToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = options.chatId?.trim() || process.env.TELEGRAM_CHAT_ID?.trim();
    if (!token || !chatId) return false;

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(2500),
      body: JSON.stringify({
        chat_id: chatId,
        text: mensagem,
        parse_mode: "HTML",
      }),
    });
    return response.ok;
  } catch {
    // Notificações nunca devem interromper o fluxo principal.
    return false;
  }
}

// Chat ID individual do usuário; se não configurado, usa o do servidor (master).
export async function chatIdDoUsuario(userId: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles").select("telegram_chat_id").eq("id", userId).maybeSingle();
    const chatId = data?.telegram_chat_id?.trim();
    return chatId || null;
  } catch {
    return null;
  }
}
