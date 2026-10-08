import { supabase } from "@/integrations/supabase/client";

export async function signOut(navigate: (o: { to: string; replace: boolean }) => void) {
  try {
    localStorage.removeItem("hedge-lucid-hfm-multiativo-v2");
  } catch {}
  await supabase.auth.signOut();
  navigate({ to: "/auth", replace: true });
}

export async function getMyAccess(userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);
  return { profile, isAdmin: !!roles?.some((r) => r.role === "admin") };
}
