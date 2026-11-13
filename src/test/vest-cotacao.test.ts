import { describe, expect, it } from "vitest";
import { extrairCotacaoGC } from "../routes/api/cotacoes/vest-gc";

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
