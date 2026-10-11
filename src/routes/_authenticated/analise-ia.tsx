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
        setError(`Erro ${response.status}: ${"error" in payload && payload.error ? payload.error : "Não foi possível concluir a análise."}`);
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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Win or Win Platform</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Análise de risco com IA</h1>
        </div>
        <a href="/plataforma" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">Voltar à plataforma</a>
      </header>

      <section className="rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Dados para a análise</h2>
        <p className="mt-1 text-sm text-muted-foreground">Os parâmetros são lidos da banca ativa salva na sua conta. Informe o capital disponível para comparar os custos estimados.</p>
        <form onSubmit={analyze} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid gap-1 text-sm font-medium">
            Ativo
            <select value={asset} onChange={(event) => setAsset(event.target.value as AssetKey)} className="h-10 rounded-md border bg-background px-3">
              <option value="nasdaq">Nasdaq</option>
              <option value="ouro">Ouro</option>
              <option value="saque2">Saque 2</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Capital disponível (USD)
            <input required min="0.01" max="1000000000" step="0.01" inputMode="decimal" type="number" value={capital} onChange={(event) => setCapital(event.target.value)} className="h-10 rounded-md border bg-background px-3" />
          </label>
          <button type="submit" disabled={loading} className="h-10 rounded-md bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-60">
            {loading ? "Analisando…" : "Analisar banca"}
          </button>
        </form>
      </section>

      <aside className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <strong>Aviso de risco:</strong> esta análise é informativa, não é recomendação financeira. Operar pode causar perdas. Os cálculos dependem dos parâmetros salvos e não garantem lucro, aprovação, saque ou conclusão de ciclo. O cenário não prevê o resultado real.
      </aside>

      {error && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}

      {result && (
        <div className="grid gap-5">
          <section className="rounded-xl border bg-card p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Resultado determinístico — {assetLabels[result.metrics.asset]}</h2>
                <p className="text-sm text-muted-foreground">Calculado pelo motor da plataforma; a IA não altera estes valores.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Custo estimado se todos os dias passarem</p>
                <p className="text-xl font-bold tabular-nums">{money(result.metrics.totalCostIfAllDaysPass)}</p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead><tr className="border-b text-muted-foreground"><th className="p-2">Dia</th><th className="p-2">Meta</th><th className="p-2">Lotes salvos</th><th className="p-2">Custo do dia</th><th className="p-2">Custo acumulado</th><th className="p-2">Capital informado</th></tr></thead>
                <tbody>{result.metrics.days.map((day) => (
                  <tr key={day.day} className="border-b last:border-0">
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
            <h2 className="text-lg font-semibold">Explicação da IA</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{result.explanation}</p>
            <p className="mt-4 text-xs text-muted-foreground">A IA explica apenas os indicadores calculados; não executa ordens e não escolhe operações por você.</p>
          </section>
        </div>
      )}
    </main>
  );
}
