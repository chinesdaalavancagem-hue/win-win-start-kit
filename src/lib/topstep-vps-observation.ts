import { z } from "zod";

// Observacoes versionadas. O relay continua SOMENTE TRANSPORTE:
// v3 inclui conta e banca para um executor externo autorizar MT5 DEMO.
const base = {
  event_id: z.string().uuid(),
  session_id: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  client_seq: z.number().int().min(0).max(2_000_000_000),
  observed_at_ms: z.number().int().nonnegative(),
  symbol: z.enum(["MGC", "MNQ"]),
};
const version = z.union([z.literal(2), z.literal(3)]).optional();
const bankId = z.string().regex(/^[A-Za-z0-9_-]{4,100}$/).optional();
const sourceAccountId = z.string().regex(/^[A-Za-z0-9_-]{4,80}$/).optional();

export const observationSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("position"),
    relay_version: version,
    bank_id: bankId,
    source_account_id: sourceAccountId,
    practice_label: z.string().trim().min(5).max(90).regex(/\bpractice\b/i).optional(),
    net_contracts: z.number().int().min(-100).max(100),
    practice_visible: z.literal(true) }).strict(),
  z.object({ ...base, kind: z.literal("card"),
    relay_version: version,
    bank_id: bankId,
    source_account_id: sourceAccountId,
    day: z.number().int().min(1).max(365),
    phase: z.enum(["AVALIACAO", "FINANCIADA"]),
    planned_contracts: z.number().int().min(1).max(100),
    card_lot: z.number().finite().positive().max(100),
    card_confirmed: z.literal(true) }).strict(),
]).superRefine((observation, ctx) => {
  // v1 e v2 legados permanecem apenas observacionais.
  if (observation.relay_version === 2) {
    const identityPresent = observation.kind === "card"
      ? Boolean(observation.bank_id)
      : Boolean(observation.practice_label);
    if (!identityPresent) ctx.addIssue({
      code: z.ZodIssueCode.custom, message: "v2_requires_scoped_source_identity",
    });
  }
  // v3 e um novo formato aditivo: NUNCA transforma v1/v2 em autorizacao.
  if (observation.relay_version === 3) {
    if (!observation.bank_id || !observation.source_account_id ||
        (observation.kind === "position" && !observation.practice_label)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, message: "v3_requires_bank_account_and_practice_identity",
      });
    }
  }
});
