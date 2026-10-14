import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TermsStatus = {
  version: string;
  isAdmin: boolean;
  accepted: boolean;
};

export async function getTermsStatusForUser(userId: string): Promise<TermsStatus> {
  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (rolesError) throw new Error("Não foi possível verificar as permissões da conta.");

  const isAdmin = !!roles?.some((row) => row.role === "admin");
  if (isAdmin) return { version: CURRENT_TERMS_VERSION, isAdmin: true, accepted: true };

  // A tabela ainda pode não existir até a migração ser revisada e aplicada.
  const termsDb = supabaseAdmin as unknown as {
    from: (table: "terms_acceptances") => {
      select: (columns: string) => {
        eq: (column: "user_id" | "terms_version", value: string) => {
          eq: (column: "user_id" | "terms_version", value: string) => {
            maybeSingle: () => Promise<{ data: { accepted_at: string } | null; error: { message: string } | null }>;
          };
          maybeSingle: () => Promise<{ data: { accepted_at: string } | null; error: { message: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await termsDb
    .from("terms_acceptances")
    .select("accepted_at")
    .eq("user_id", userId)
    .eq("terms_version", CURRENT_TERMS_VERSION)
    .maybeSingle();

  if (error) throw new Error("Não foi possível verificar o aceite dos termos.");
  return { version: CURRENT_TERMS_VERSION, isAdmin: false, accepted: !!data };
}

export async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

export async function recordTermsAcceptance(userId: string, deviceHash: string) {
  const status = await getTermsStatusForUser(userId);
  if (status.isAdmin || status.accepted) return { ...status, alreadyAccepted: true };

  const termsDb = supabaseAdmin as unknown as {
    from: (table: "terms_acceptances") => {
      insert: (values: {
        user_id: string;
        terms_version: string;
        device_hash: string;
      }) => {
        select: (columns: string) => {
          single: () => Promise<{ data: { accepted_at: string } | null; error: { message: string; code?: string } | null }>;
        };
      };
    };
  };
  const { data, error } = await termsDb
    .from("terms_acceptances")
    .insert({
      user_id: userId,
      terms_version: CURRENT_TERMS_VERSION,
      device_hash: deviceHash,
    })
    .select("accepted_at")
    .single();

  if (error) {
    // Uma requisição concorrente pode ter gravado o aceite da mesma versão.
    if (error.code === "23505") {
      const current = await getTermsStatusForUser(userId);
      if (current.accepted) return { ...current, alreadyAccepted: true };
    }
    throw new Error("Não foi possível registrar o aceite dos termos.");
  }

  return {
    version: CURRENT_TERMS_VERSION,
    isAdmin: false,
    accepted: true,
    acceptedAt: data?.accepted_at ?? new Date().toISOString(),
    alreadyAccepted: false,
  };
}
