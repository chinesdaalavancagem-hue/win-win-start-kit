import { z } from "zod";

// Observacoes versionadas. Sem handlers de negociacao.
const base = {
  event_id: z.string().uuid(),
  session_id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  client_seq: z.number().int().min(0).max(2_000_000_000),
  observed_at_ms: z.number().int().nonnegative(),
  symbol: z.enum(["MGC", "MNQ"]),
};
export const observationSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("position"),
    relay_version: z.literal(2).optional(),
    practice_label: z.string().trim().min(5).max(90).regex(/\bpractice\b/i).optional(),
    net_contracts: z.number().int().min(-100).max(100),
    practice_visible: z.literal(true) }).strict(),
  z.object({ ...base, kind: z.literal("card"),
    relay_version: z.literal(2).optional(),
    bank_id: z.string().regex(/^[A-Za-z0-9_-]{4,100}$/).optional(),
    day: z.number().int().min(1).max(365),
    phase: z.enum(["AVALIACAO", "FINANCIADA"]),
    planned_contracts: z.number().int().min(1).max(100),
    card_lot: z.number().finite().positive().max(100),
    card_confirmed: z.literal(true) }).strict(),
]).superRefine((observation, ctx) => {
  // Compatibilidade com extensão legada: eventos v1 continuam somente
  // observacionais. Somente o novo v2 identifica banca e conta visual.
  if (observation.relay_version !== 2) return;
  const identityPresent = observation.kind === "card"
    ? Boolean(observation.bank_id)
    : Boolean(observation.practice_label);
  if (!identityPresent) ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: "v2_requires_scoped_source_identity",
  });
});

