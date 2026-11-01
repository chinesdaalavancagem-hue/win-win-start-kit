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
const version = z.union([z.literal(2), z.literal(3), z.literal(4)]).optional();
const bankId = z.string().regex(/^[A-Za-z0-9_-]{4,100}$/).optional();
const sourceAccountId = z.string().regex(/^[A-Za-z0-9_-]{4,80}$/).optional();
const visualName = z.string().trim().min(3).max(100).regex(/^[A-Za-z0-9$().,# _-]+$/);

export const observationSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("position"),
    relay_version: version,
    bank_id: bankId,
    source_account_id: sourceAccountId,
    practice_label: z.string().trim().min(5).max(90).regex(/\bpractice\b/i).optional(),
    practice_visible: z.literal(true).optional(),
    account_label: visualName.optional(),
    account_name: visualName.optional(),
    account_kind: z.enum(["PRACTICE", "OPERACIONAL"]).optional(),
    account_visible: z.literal(true).optional(),
    net_contracts: z.number().int().min(-100).max(100) }).strict(),
  z.object({ ...base, kind: z.literal("card"),
    relay_version: version,
    bank_id: bankId,
    source_account_id: sourceAccountId,
    linked_source_account_id: sourceAccountId,
    day: z.number().int().min(1).max(365),
    phase: z.enum(["AVALIACAO", "FINANCIADA"]),
    planned_contracts: z.number().int().min(1).max(100),
    card_lot: z.number().finite().positive().max(100),
    card_confirmed: z.literal(true) }).strict(),
]).superRefine((observation, ctx) => {
  const fail = (message: string) => ctx.addIssue({code:z.ZodIssueCode.custom,message});
  if (observation.kind === "position" && observation.relay_version !== 4) {
    if (observation.practice_visible !== true) fail("legacy_position_requires_practice_visible");
    if (observation.account_label || observation.account_name || observation.account_kind || observation.account_visible)
      fail("legacy_position_cannot_include_v4_fields");
  }
  if (observation.kind === "card" && observation.relay_version !== 4 && observation.linked_source_account_id)
    fail("legacy_card_cannot_include_linked_source_id");
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
  if (observation.relay_version === 4) {
    if (!observation.bank_id || !observation.source_account_id ||
        !/^[1-9][0-9]{0,19}$/.test(observation.source_account_id))
      fail("v4_requires_bank_and_numeric_official_account_id");
    if (observation.kind === "position") {
      if (!observation.account_label || !observation.account_name ||
          !observation.account_kind || observation.account_visible !== true)
        fail("v4_requires_official_and_visible_account_identity");
      const practiceLabel = /\bpractice\b/i.test(observation.account_label || "");
      const practiceName = /\bpractice\b|^PRAC-/i.test(observation.account_name || "");
      if ((observation.account_kind === "PRACTICE") !== practiceLabel ||
          (observation.account_kind === "PRACTICE") !== practiceName)
        fail("v4_account_kind_mismatch");
      if (observation.practice_visible || observation.practice_label)
        fail("v4_no_legacy_practice_fields");
    } else if (observation.linked_source_account_id &&
        observation.linked_source_account_id !== observation.source_account_id) {
      fail("v4_linked_id_does_not_match_source_account_id");
    }
  }
});
