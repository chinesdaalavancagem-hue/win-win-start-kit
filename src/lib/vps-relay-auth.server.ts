import { bearer, hashToken } from "./integracao";

export async function autenticarChaveVpsObservacao(request: Request):
  Promise<{status:200;userId:string}|{status:401|500;userId:null}> {
  const token = bearer(request);
  if (!token || !token.startsWith("wowvps_")) return { status:401, userId:null };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Tabela da migracao da Etapa 1 (tipos gerados serao atualizados apos migrar).
    const db = supabaseAdmin as unknown as { from:(name:string)=>any };
    const { data, error } = await db.from("topstep_vps_tokens")
      .select("user_id").eq("token_hash", await hashToken(token))
      .is("revoked_at", null).gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) return {status:500,userId:null};
    if (!data?.user_id) return {status:401,userId:null};
    const { data: approved, error: approvalError } =
      await supabaseAdmin.rpc("is_approved", {_user_id:data.user_id});
    if (approvalError) return {status:500,userId:null};
    if (!approved) return {status:401,userId:null};
    return {status:200,userId:data.user_id};
  } catch {
    // Nao registrar tokens, hashes nem dados do usuario em logs.
    return {status:500,userId:null};
  }
}
