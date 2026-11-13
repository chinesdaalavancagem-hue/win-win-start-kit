import { describe, expect, it } from "vitest";
import { extrairCotacaoGC, extrairSpotXau } from "../routes/api/cotacoes/vest-gc";

describe("cotação automática GC-PERP", () => {
  it("usa apenas o índice confirmado do ativo correto", () => {
    const response = { tickers: [
      { symbol: "BTC-PERP", indexPrice: "80000" },
      { symbol: "GC-PERP", indexPrice: "3944.10", markPrice: "3945.50" },
    ]};
    expect(extrairCotacaoGC(response)).toBe(3944.1);
  });
  it("usa o mark como reserva quando o índice não estiver presente", () => {
    expect(extrairCotacaoGC({ tickers: [{ symbol:"GC-PERP", markPrice:"3900.25" }] })).toBe(3900.25);
  });
  it("não inventa preços ou aceita respostas de outro mercado", () => {
    expect(extrairCotacaoGC({ tickers: [{symbol:"GC-PERP", indexPrice:"0"}] })).toBeNull();
    expect(extrairCotacaoGC({ tickers: [{symbol:"MGC-PERP", indexPrice:"4000"}] })).toBeNull();
    expect(extrairCotacaoGC({ tickers: [{symbol:"GC-PERP", indexPrice:"-5"}] })).toBeNull();
    expect(extrairCotacaoGC({})).toBeNull();
  });
});

describe("fonte de reserva XAU/USD", () => {
  it("aceita preço válido e recente do ouro spot", () => {
    const now = Date.parse("2026-11-13T16:00:00Z");
    expect(extrairSpotXau({symbol:"XAU",currency:"USD",price:4000.25,updatedAt:"2026-11-13T15:59:45Z"},now))
      .toEqual({price:4000.25,asOf:Date.parse("2026-11-13T15:59:45Z")});
  });
  it("rejeita preços atrasados, inválidos ou de outras moedas", () => {
    const now = Date.parse("2026-11-13T16:00:00Z");
    expect(extrairSpotXau({symbol:"XAU",currency:"USD",price:4000,updatedAt:"2026-11-13T15:40:00Z"},now)).toBeNull();
    expect(extrairSpotXau({symbol:"XAU",currency:"EUR",price:4000,updatedAt:"2026-11-13T15:59:45Z"},now)).toBeNull();
    expect(extrairSpotXau({symbol:"XAU",currency:"USD",price:0,updatedAt:"2026-11-13T15:59:45Z"},now)).toBeNull();
  });
});
