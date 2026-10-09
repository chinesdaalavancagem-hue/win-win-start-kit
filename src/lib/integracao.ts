import { z } from "zod";

// Ordem enviada pela mesa (Tradovate ou ponte). Aceita "buy"/"sell" e "Buy"/"Sell".
export const ordemSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(100)),
  symbol: z.string().trim().min(1).max(40),
  side: z.string().transform((s) => s.toLowerCase()).pipe(z.enum(["buy", "sell"])),
  qty: z.coerce.number().positive().max(10000),
  price: z.preprocess((v) => (v === null || v === "" ? undefined : v), z.coerce.number().positive().optional()),
});
export type Ordem = z.infer<typeof ordemSchema>;

export const confirmarSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["done", "error"]),
  error: z.string().max(500).optional(),
});

// Hedge: o CFD sempre recebe a direção contrária à da mesa.
export function mirrorSide(side: "buy" | "sell"): "buy" | "sell" {
  return side === "buy" ? "sell" : "buy";
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bearer(request: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(request.headers.get("authorization") ?? "");
  return m?.[1] ?? null;
}
