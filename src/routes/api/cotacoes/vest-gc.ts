import { createFileRoute } from "@tanstack/react-router";

// Cotação de referência para projeções. Não envia ordens e não utiliza credenciais MT5.
// A API pública da Vest informa preço do próprio GC-PERP, não o bid/ask do CFD.
const URL_VEST = "https://serverprod.vest.exchange/v2/ticker/latest?symbols=GC-PERP";
const positive = (value: unknown) => {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 && n < 1000000 ? n : null;
};
export function extrairCotacaoGC(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const arr = Array.isArray(body.tickers) ? body.tickers : Array.isArray(body.data) ? body.data : [];
  const ticker = arr.find((item): item is Record<string, unknown> =>
    !!item && typeof item === "object" && (item as Record<string, unknown>).symbol === "GC-PERP");
  return ticker ? (positive(ticker.indexPrice) ?? positive(ticker.markPrice)) : null;
}
export const Route = createFileRoute("/api/cotacoes/vest-gc")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const response = await fetch(URL_VEST, {
            headers: { "Accept": "application/json", "xrestservermm": "restserver0" },
            signal: AbortSignal.timeout(4500),
            cache: "no-store",
          });
          if (!response.ok) throw new Error("upstream_not_ok");
          const payload: unknown = await response.json();
          const price = extrairCotacaoGC(payload);
          if (price === null) throw new Error("invalid_quote");
          return Response.json({ ok: true, symbol: "GC-PERP", price, source: "Vest index/mark", asOf: Date.now() }, {
            headers: { "Cache-Control": "no-store" },
          });
        } catch {
          return Response.json({ ok: false, error: "cotacao_indisponivel" }, {
            status: 503, headers: { "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
