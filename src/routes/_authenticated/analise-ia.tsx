import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AssetKey } from "@/lib/platform/engine";
import type { DeterministicAnalysis } from "@/lib/platform/ai-analysis";

type Result = { metrics: DeterministicAnalysis; explanation: string; remainingToday: number };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
const assetLabels: Record<AssetKey, string> = { nasdaq: "Nasdaq", ouro: "Ouro", saque2: "Saque 2" };

export const Route = createFileRoute("/_authenticated/analise-ia")({
  head: () => ({ meta: [{ title: "Análise de risco com IA — Win or Win" }] }),
  component: AnaliseIA,
});

function AnaliseIA() {
  const [asset, setAsset] = useState<AssetKey>("nasdaq");
  const [capital, setCapital] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (sessionError || !token) {
        setError("Sua sessão expirou. Entre novamente.");
        return;
      }
      const response = await fetch("/api/analise-ia", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ asset, capitalAvailable: Number(capital.replace(",", ".")) }),
      });
      const payload = await response.json() as Result | { error?: string };
      if (!response.ok) {
        setError(response.status === 429
          ? "Você atingiu o limite de 3 análises hoje. Tente novamente amanhã."
          : "Não foi possível concluir a análise. Tente novamente.");
        return;
      }
      setResult(payload as Result);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 md:py-8">
      <header className="relative overflow-hidden rounded-2xl border border-cyan-900/70 bg-gradient-to-br from-[#071a2d] via-[#0b1224] to-[#111827] p-5 shadow-lg shadow-cyan-950/20 md:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Inteligência operacional</p><h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Análise de risco com IA</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Entenda os custos estimados da sua banca com cálculos determinísticos e uma explicação assistida por IA.</p></div>
          <a href="/plataforma" className="rounded-xl border border-slate-600 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10">← Voltar à plataforma</a>
        </div>
      </header>

      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm md:p-6">
        <div className="mb-4 flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-lg font-bold text-cyan-300">01</span><div><h2 className="text-lg font-semibold">Configure sua análise</h2><p className="mt-1 text-sm text-muted-foreground">Escolha o ativo e informe o capital disponível.</p></div></div>
        <p className="mt-1 text-sm text-muted-foreground">Os parâmetros são lidos da banca ativa salva na sua conta. Informe o capital disponível para comparar os custos estimados.</p>
        <form onSubmit={analyze} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm font-medium">
            Ativo
            <select value={asset} onChange={(event) => setAsset(event.target.value as AssetKey)} className="h-11 rounded-xl border border-border bg-background px-3 transition focus:border-cyan-700">
              <option value="nasdaq">Nasdaq</option>
              <option value="ouro">Ouro</option>
              <option value="saque2">Saque 2</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Capital disponível (USD)
            <input required min="0.01" max="1000000000" step="0.01" inputMode="decimal" type="number" value={capital} onChange={(event) => setCapital(event.target.value)} className="h-10 rounded-md border bg-background px-3" />
          </label>
          <button type="submit" disabled={loading} className="h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60">
            {loading ? "Analisando…" : "Analisar banca"}
          </button>
        </form>
      </section>

      <aside className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-transparent p-4 text-sm leading-6">
        <strong>Aviso de risco:</strong> esta análise é informativa, não é recomendação financeira. Operar pode causar perdas. Os cálculos dependem dos parâmetros salvos e não garantem lucro, aprovação, saque ou conclusão de ciclo. O cenário não prevê o resultado real.
      </aside>

      {error && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"><p>{error}</p></div>}

      {result && (
        <div className="grid gap-5">
          <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Resultado calculado — {assetLabels[result.metrics.asset]}</h2>
                <p className="text-sm text-muted-foreground">Calculado pelo motor da plataforma; a IA não altera estes valores.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Custo estimado se todos os dias passarem</p>
                <p className="text-xl font-bold tabular-nums">{money(result.metrics.totalCostIfAllDaysPass)}</p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-muted/50"><tr className="border-b text-muted-foreground"><th className="p-2">Dia</th><th className="p-2">Meta</th><th className="p-2">Lotes salvos</th><th className="p-2">Custo do dia</th><th className="p-2">Custo acumulado</th><th className="p-2">Capital informado</th></tr></thead>
                <tbody>{result.metrics.days.map((day) => (
                  <tr key={day.day} className="border-b transition-colors hover:bg-muted/30 last:border-0">
                    <td className="p-2">{day.day}</td>
                    <td className="p-2 tabular-nums">{money(day.target)}</td>
                    <td className="p-2 tabular-nums">{day.lots}</td>
                    <td className="p-2 tabular-nums">{money(day.costIfPass)}</td>
                    <td className="p-2 tabular-nums">{money(day.cumulativeCostIfPass)}</td>
                    <td className="p-2">{day.capitalCoversCumulativeCost ? "Cobre o acumulado" : "Acumulado excede a banca"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Dias em que o custo acumulado supera o capital informado: {result.metrics.daysAboveCapital.length ? result.metrics.daysAboveCapital.join(", ") : "nenhum neste cenário de custos estimados"}.</p>
            <p className="mt-2 text-xs text-muted-foreground">Análises restantes hoje (UTC): {result.remainingToday} de 3.</p>
          </section>

          <section className="rounded-xl border bg-card p-4 sm:p-6">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-lg font-bold text-violet-300">✦</span><div><h2 className="text-lg font-semibold">Explicação da IA</h2><p className="mt-1 text-sm text-muted-foreground">Contexto sobre os indicadores calculados pelo motor da plataforma.</p></div></div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{result.explanation}</p>
            <p className="mt-4 text-xs text-muted-foreground">A IA explica apenas os indicadores calculados; não executa ordens e não escolhe operações por você.</p>
          </section>
        </div>
      )}
    </main>
  );
}
