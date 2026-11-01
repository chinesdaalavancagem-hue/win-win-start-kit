import { describe, expect, it } from "vitest";
import { observationSchema } from "@/lib/topstep-vps-observation";

const base = {
  relay_version: 3 as const,
  event_id: "123e4567-e89b-42d3-a456-426614174000",
  session_id: "sess1234567890",
  client_seq: 14,
  observed_at_ms: 1762000000000,
  symbol: "MGC" as const,
  bank_id: "banca1234",
  source_account_id: "187b21529f",
};

describe("relay v3 — identificacao obrigatoria para executor DEMO", () => {
  it("aceita card de banca/conta vinculadas", () => {
    expect(observationSchema.safeParse({
      ...base, kind: "card", day: 1, phase: "AVALIACAO",
      planned_contracts: 20, card_lot: 0.52, card_confirmed: true,
    }).success).toBe(true);
  });
  it("aceita snapshot da Practice identificada", () => {
    expect(observationSchema.safeParse({
      ...base, kind: "position", practice_label: "Practice",
      net_contracts: -20, practice_visible: true,
    }).success).toBe(true);
  });
  it("rejeita posicao v3 sem conta de origem", () => {
    const { source_account_id: _discard, ...noAccount } = base;
    expect(observationSchema.safeParse({
      ...noAccount, kind: "position", practice_label: "Practice",
      net_contracts: 20, practice_visible: true,
    }).success).toBe(false);
  });
  it("rejeita card v3 sem banca", () => {
    const { bank_id: _discard, ...noBank } = base;
    expect(observationSchema.safeParse({
      ...noBank, kind: "card", day: 1, phase: "AVALIACAO",
      planned_contracts: 20, card_lot: 0.52, card_confirmed: true,
    }).success).toBe(false);
  });
  it("mantem v2 observacao sem autorizar ordens", () => {
    expect(observationSchema.safeParse({
      ...base, relay_version: 2, kind: "position",
      practice_label: "Practice", net_contracts: 0, practice_visible: true,
    }).success).toBe(true);
  });
});
