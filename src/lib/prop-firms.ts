import { z } from "zod";

export const FIRM_NAMES = {
  "lucid-trading": "Lucid Trading",
  tradeify: "Tradeify",
  "my-funded-futures": "My Funded Futures",
  topstep: "Topstep",
} as const;
export const firmIdSchema = z.enum(["lucid-trading", "tradeify", "my-funded-futures", "topstep"]);
export const affiliateUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !/\s/.test(value); } catch { return false; }
}, "Informe um link HTTPS válido, sem credenciais.");
export const firmSchema = z.object({
  id: firmIdSchema,
  affiliate_url: affiliateUrlSchema,
  coupon: z.string().trim().max(80),
  account_sizes: z.array(z.number().int().positive().max(10_000_000)).max(20).transform((sizes) => [...new Set(sizes)].sort((a, b) => a - b)),
});
export type Firm = z.infer<typeof firmSchema> & { name: string };

const DEFAULT_FIRM_URLS: Record<keyof typeof FIRM_NAMES, string> = {
  "lucid-trading":
    "https://lucidtrading.com/?ref=cupommesasprop&utm_source=cupommesasprop&utm_medium=afiliado&utm_campaign=lucidtrading",
  tradeify:
    "https://tradeify.co/?ref=TWC&utm_source=cupommesasprop&utm_medium=afiliado&utm_campaign=tradeify",
  "my-funded-futures":
    "https://myfundedfutures.com/challenge?ref=355&utm_source=cupommesasprop&utm_campaign=myfundedfutures&utm_medium=afiliado",
  topstep: "https://www.topstep.com/?ref=TWC&utm_source=cupommesasprop&utm_medium=afiliado&utm_campaign=topstep&utm_content=topstep",
};

export const EMPTY_FIRMS: Firm[] = Object.entries(FIRM_NAMES).map(([id, name]) => ({
  id: firmIdSchema.parse(id),
  name,
  affiliate_url: DEFAULT_FIRM_URLS[id as keyof typeof FIRM_NAMES],
  coupon: "",
  account_sizes: [50_000],
}));

export const challengeAccountSchema = z.object({
  prop_firm_id: firmIdSchema,
  account_external_id: z.string().trim().min(1, "Informe o identificador da conta.").max(100),
  account_size: z.number().finite().positive().max(10_000_000),
  link_compra_utilizado: affiliateUrlSchema,
  registered_at: z.number().finite().nonnegative(),
  source_banca_id: z.string().max(100),
});
export type ChallengeAccount = z.infer<typeof challengeAccountSchema>;
