import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hashToken } from "./integracao";

// Uma chave exclusiva para o canal de observacao VPS.
// Nao afeta a chave de Integracao/Tradovate e nao autoriza rotas de ordens.
export const gerarChaveObservacaoVps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: approved, error: approvalError } = await context.supabase.rpc(
      "is_approved", { _user_id: context.userId });
    if (approvalError || !approved) throw new Error("Conta não aprovada");
    const bytes=crypto.getRandomValues(new Uint8Array(32));
    const token = "wowvps_" + btoa(String.fromCharCode(...bytes))
      .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {from:(name:string)=>any};
    const { error } = await db.from("topstep_vps_tokens").upsert({
      user_id:context.userId,
      token_hash:await hashToken(token),
      created_at:new Date().toISOString(),
      expires_at:new Date(Date.now()+90*24*3600*1000).toISOString(),
      revoked_at:null,
    }, {onConflict:"user_id"});
    if(error) throw new Error("Não foi possível gerar a chave VPS");
    return {token, validade_dias:90};
  });

export const revogarChaveObservacaoVps = createServerFn({ method:"POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {from:(name:string)=>any};
    const { error }=await db.from("topstep_vps_tokens")
      .update({revoked_at:new Date().toISOString()})
      .eq("user_id",context.userId);
    if(error)throw new Error("Não foi possível revogar a chave VPS");
    return {ok:true};
  });
