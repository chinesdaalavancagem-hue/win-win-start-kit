import { describe, expect, it } from "vitest";
import { bearer, mirrorSide, ordemSchema } from "@/lib/integracao";

describe("integração de ordens", () => {
  it("CFD recebe direção contrária à mesa", () => {
    expect(mirrorSide("buy")).toBe("sell");
    expect(mirrorSide("sell")).toBe("buy");
  });
  it("aceita ordem da Tradovate com Buy maiúsculo", () => {
    expect(ordemSchema.parse({ id: 123, symbol: "MNQZ6", side: "Buy", qty: "2" })).toMatchObject({ id: "123", side: "buy", qty: 2 });
  });
  it("rejeita quantidade zero", () => {
    expect(ordemSchema.safeParse({ id: "1", symbol: "MNQ", side: "buy", qty: 0 }).success).toBe(false);
  });
  it("sem chave não autentica", () => {
    expect(bearer(new Request("http://x"))).toBeNull();
  });
});
