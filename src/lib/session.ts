import { supabase } from "@/integrations/supabase/client";
import { registrarAuditoria } from "@/lib/auditoria-registro";

export async function signOut(navigate: (o: { to: string; replace: boolean }) => void) {
  await registrarAuditoria({ category: "auth", action: "logout", outcome: "success" });
  try {
    localStorage.removeItem("hedge-lucid-hfm-multiativo-v2");
  } catch {}
  try {
    await supabase.auth.signOut();
  } catch {}
  void navigate;
  // Hard reload: limpa toda memória/scripts da sessão anterior
  window.location.replace("/auth");
}

export async function requireAdmin(userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return !!data?.some((r) => r.role === "admin");
}

export async function getMyAccess(userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  return { profile, isAdmin: !!roles?.some((r) => r.role === "admin") };
}
