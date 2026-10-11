type AuditCategory = "auth" | "strategy" | "integration" | "navigation" | "system" | "ui";
type AuditOutcome = "success" | "failed" | "denied" | "started" | "unknown";

export async function registrarAuditoria(event: {
  category: AuditCategory;
  action: string;
  outcome?: AuditOutcome;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch("/api/auditoria", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // A falha de auditoria não deve bloquear a operação principal do usuário.
  }
}
