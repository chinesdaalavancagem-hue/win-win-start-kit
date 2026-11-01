import { describe, expect, it } from "vitest";
import { observationSchema } from "@/lib/topstep-vps-observation";

const base = {
  event_id: "123e4567-e89b-42d3-a456-426614174000",
  session_id: "sess1234567890", client_seq: 12,
  observed_at_ms: 1762000000000, symbol: "MGC",
};

describe("topstep VPS relay v2", () => {
  it("recebe card v2 com banco confirmado", () => {
    const r = observationSchema.safeParse({
      ...base, kind: "card", relay_version: 2, bank_id: "banca1234",
      day: 2, phase: "AVALIACAO", planned_contracts: 20,
      card_lot: 0.37, card_confirmed: true,
    });
    expect(r.success).toBe(true);
  });
  it("exige banca em card v2", () => {
    const r = observationSchema.safeParse({
      ...base, kind: "card", relay_version: 2,
      day: 2, phase: "AVALIACAO", planned_contracts: 20,
      card_lot: 0.37, card_confirmed: true,
    });
    expect(r.success).toBe(false);
  });
  it("recebe posição Practice v2 com identificação visual", () => {
    const r = observationSchema.safeParse({
      ...base, kind: "position", relay_version: 2,
      practice_label: "Practice", net_contracts: 19, practice_visible: true,
    });
    expect(r.success).toBe(true);
  });
  it("rejeita posição de conta real como Practice", () => {
    const r = observationSchema.safeParse({
      ...base, kind: "position", relay_version: 2,
      practice_label: "Express-50K", net_contracts: 19, practice_visible: true,
    });
    expect(r.success).toBe(false);
  });
  it("mantem leitura v1 sem criar autorizacao de ordens", () => {
    const r = observationSchema.safeParse({
      ...base, kind: "position", net_contracts: 0, practice_visible: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.relay_version).toBeUndefined();
  });
  it("rejeita campos arbitrarios em ambos os formatos", () => {
    const r = observationSchema.safeParse({
      ...base, kind: "position", relay_version: 2,
      practice_label: "Practice", net_contracts: 0, practice_visible: true,
      token: "nao_permitido",
    });
    expect(r.success).toBe(false);
  });
});
