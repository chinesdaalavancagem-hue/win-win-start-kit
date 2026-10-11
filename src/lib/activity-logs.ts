// Registro de atividades em public.activity_logs (etapa 2).
// Nunca bloqueia nem quebra o fluxo principal: toda falha é engolida em silêncio.
// details só recebe metadados seguros — nunca senha, token ou conteúdo de integration_tokens.

type ActivityAction =
  | "login.success"
  | "login.failed"
  | "logout"
  | "create"
  | "update"
  | "delete";

export function registrarAtividade(
  action: ActivityAction,
  details: Record<string, unknown> = {},
): void {
  void (async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;
      await supabase.from("activity_logs").insert({
        user_id: userId,
        action,
        details: details as import("@/integrations/supabase/types").Json,
      });
    } catch {
      // Falha de registro nunca atrapalha o usuário.
    }
  })();
}

// Tentativa de login malsucedida: acontece antes de existir sessão,
// então usa a função do banco log_failed_login (concedida a anon/authenticated).
export function registrarLoginFalho(attemptedEmail: string): void {
  void (async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.rpc("log_failed_login", {
        attempted_email: attemptedEmail.slice(0, 254),
      });
    } catch {
      // Falha de registro nunca atrapalha o usuário.
    }
  })();
}
