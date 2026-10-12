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
