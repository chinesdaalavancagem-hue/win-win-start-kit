import { createFileRoute } from "@tanstack/react-router";

// Referência de preço somente para simulação; nunca envia ordens.
// Primeira fonte: GC-PERP Vest. Reserva: XAU/USD spot público, NÃO é preço executável.
const VEST_URL = "https://serverprod.vest.exchange/v2/ticker/latest?symbols=GC-PERP";
const SPOT_URL = "https://api.gold-api.com/price/XAU";
const MAX_SPOT_AGE_MS = 120000;
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
export function extrairSpotXau(payload: unknown, now = Date.now()): {price:number;asOf:number}|null {
  if (!payload || typeof payload !== "object") return null;
  const x = payload as Record<string, unknown>;
  if (x.symbol !== "XAU" || x.currency !== "USD") return null;
  const price = positive(x.price);
  const asOf = typeof x.updatedAt === "string" ? Date.parse(x.updatedAt) : NaN;
  if (price === null || !Number.isFinite(asOf) || asOf > now + 30000 || now - asOf > MAX_SPOT_AGE_MS) return null;
  return { price, asOf };
}
async function requestJson(url: string, headers: Record<string,string>): Promise<unknown> {
  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(4500), cache: "no-store" });
  if (!resp.ok) throw new Error("upstream_unavailable");
  return resp.json() as Promise<unknown>;
}
export const Route = createFileRoute("/api/cotacoes/vest-gc")({
  server: {
    handlers: {
      GET: async () => {
        const headers = { "Cache-Control": "no-store" };
        try {
          const value = await requestJson(VEST_URL, { "Accept":"application/json", "xrestservermm":"restserver0" });
          const price = extrairCotacaoGC(value);
          if (price !== null) return Response.json({
            ok:true, symbol:"GC-PERP", price, source:"Vest GC-PERP", asOf:Date.now(), referenceOnly:true,
          },{headers});
        } catch { /* tentar fonte independente de reserva */ }
        try {
          const value = await requestJson(SPOT_URL, {"Accept":"application/json"});
          const data = extrairSpotXau(value);
          if (data) return Response.json({
            ok:true, symbol:"XAU/USD", price:data.price,source:"XAU/USD spot (referência)",asOf:data.asOf,referenceOnly:true,
          },{headers});
        } catch { /* falha das duas fontes */ }
        return Response.json({ok:false,error:"cotacao_indisponivel"}, {status:503,headers});
      },
    },
  },
});
