import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_FIRMS, FIRM_NAMES, firmSchema } from "./prop-firms";

export const listPropFirms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("prop_firms").select("*");
    if (error) throw new Error("Não foi possível carregar as mesas.");
    return EMPTY_FIRMS.map((fallback) => {
      const row = data?.find((firm) => firm.id === fallback.id);
      const parsed = firmSchema.safeParse(row);
      return parsed.success
        ? {
            ...parsed.data,
            name: FIRM_NAMES[parsed.data.id],
            affiliate_url: parsed.data.affiliate_url || fallback.affiliate_url,
            account_sizes: [50_000],
          }
        : fallback;
    });
  });

export const savePropFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Somente a master pode configurar as mesas.");
    const { error } = await context.supabase.from("prop_firms").upsert({
      ...data,
      name: FIRM_NAMES[data.id],
      account_sizes: [50_000],
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Não foi possível salvar a mesa.");
    return { ok: true };
  });
