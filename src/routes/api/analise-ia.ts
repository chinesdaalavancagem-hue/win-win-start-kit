import { createFileRoute } from "@tanstack/react-router";
import { createResponsesCall } from "@/lib/ai/responses.server";
import { parseBancas } from "@/lib/platform/bancas";
import { buildDeterministicAnalysis } from "@/lib/platform/ai-analysis";
import type { AssetKey } from "@/lib/platform/engine";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const validAsset = (value: unknown): value is AssetKey =>
  value === "nasdaq" || value === "ouro" || value === "saque2";

export const Route = createFileRoute("/api/analise-ia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!accessToken) return json({ error: "Entre na sua conta para usar a análise." }, 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Pedido inválido." }, 400);
        }
        const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
        const asset = input.asset;
        if (!validAsset(asset)) return json({ error: "Selecione um ativo válido." }, 400);
        const capital = input.capitalAvailable;
        if (typeof capital !== "number" || !Number.isFinite(capital) || capital <= 0 || capital > 1_000_000_000) {
          return json({ error: "Informe uma banca positiva de até 1 bilhão." }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
        const user = authData.user;
        if (authError || !user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles").select("approved,rejected").eq("id", user.id).maybeSingle();
        if (profileError || !profile?.approved || profile.rejected) {
          return json({ error: "Sua conta precisa estar aprovada para usar a análise." }, 403);
        }

        const { data: saved, error: savedError } = await supabaseAdmin
          .from("app_data").select("data").eq("user_id", user.id).maybeSingle();
        if (savedError || !saved?.data) {
          return json({ error: "Não foi possível carregar a banca salva." }, 400);
        }

        let parsed: ReturnType<typeof parseBancas>;
        try {
          const raw = typeof saved.data === "string" ? saved.data : JSON.stringify(saved.data);
          parsed = parseBancas(raw);
        } catch {
          return json({ error: "Os dados salvos da banca não puderam ser lidos." }, 400);
        }
        const activeBanca = parsed.bancas.find((item) => item.id === parsed.activeId);
        if (!activeBanca) return json({ error: "Não foi encontrada uma banca ativa." }, 400);

        let metrics: ReturnType<typeof buildDeterministicAnalysis>;
        try {
          metrics = buildDeterministicAnalysis(activeBanca.state, asset, capital);
        } catch {
          return json({ error: "Não foi possível calcular os números dessa banca." }, 400);
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return json({ error: "Assistente não configurado." }, 503);

        const { data: remaining, error: quotaError } = await supabaseAdmin
          .rpc("consume_ai_analysis_quota", { p_user_id: user.id, p_limit: 3 });
        if (quotaError) {
          return json({ error: "O limite diário não pôde ser verificado. Tente novamente mais tarde." }, 503);
        }
        if (remaining === null || typeof remaining !== "number") {
          return json({ error: "Você atingiu o limite de 3 análises por dia. Tente novamente amanhã (UTC)." }, 429);
        }

        const systemPrompt = [
          "Você explica os resultados determinísticos da plataforma Win or Win em português do Brasil.",
          "Os números recebidos já foram calculados pelo motor do sistema; não altere, recalcule, invente ou contradiga esses números.",
          "Use apenas os dados agregados fornecidos. Não peça nem tente inferir identidade, e-mail, ID de usuário, tokens ou chaves.",
          "Não dê ordens de compra ou venda, não indique execução de operações, não prescreva lotes nem tome decisões pelo usuário.",
          "Não prometa lucro, aprovação, saque ou conclusão de ciclo. Não trate cenários como previsões nem assuma probabilidades de sucesso.",
          "Explique que custos são estimativas baseadas nos parâmetros salvos, que resultados reais podem diferir e que operar envolve risco de perda.",
          "Seja objetivo: explique o custo cumulativo, os dias em que ele supera o capital informado e as limitações do cálculo.",
        ].join("\n");

        const safeMetrics = JSON.stringify(metrics);
        let streamError: unknown;
        const streamPartTypes: string[] = [];
        let finishReason: string | undefined;
        let explanation = "";
        try {
          const call = createResponsesCall(
            request,
            { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" },
            [{ role: "system", content: systemPrompt }, { role: "user", content: safeMetrics }],
            (error) => { streamError = error; },
          );
          for await (const part of call.result.fullStream) {
            const type = typeof part.type === "string" ? part.type : "unknown";
            const category = type === "start"
              ? "start"
              : type.startsWith("reasoning")
                ? "reasoning"
                : type.startsWith("text")
                  ? "text"
                  : type === "finish"
                    ? "finish"
                    : type === "error"
                      ? "error"
                      : type;
            if (streamPartTypes.length < 100) streamPartTypes.push(category);

            if (type === "text-delta") explanation += part.text;
            if (type === "finish" && typeof part.finishReason === "string") finishReason = part.finishReason;
            if (type === "error") throw part.error;
          }
          if (streamError !== undefined) throw streamError;
          try {
            await supabaseAdmin.from("activity_logs").insert({
              user_id: user.id,
              action: "ai.analysis.completed",
              details: {},
            });
          } catch {
            // A análise não deve falhar se o registro de atividade falhar.
          }
          // REMOVER ANTES DO MERGE: debug temporário exposto na resposta.
          return json({
            metrics,
            explanation,
            remainingToday: remaining,
            debug: { streamPartTypes, finishReason: finishReason ?? null },
          });
        } catch (error) {
          type GatewayError = {
            name?: unknown;
            message?: unknown;
            status?: unknown;
            statusCode?: unknown;
            code?: unknown;
            response?: { status?: unknown };
            responseBody?: unknown;
            cause?: unknown;
          };
          const actualError = streamError ?? error;
          const root = actualError && typeof actualError === "object" ? actualError as GatewayError : {};
          const cause = root.cause && typeof root.cause === "object" ? root.cause as GatewayError : {};
          const gatewayStatus = [root.statusCode, root.status, root.response?.status, cause.statusCode, cause.status, cause.response?.status]
            .find((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599);
          const responseBody = typeof root.responseBody === "string"
            ? root.responseBody
            : typeof cause.responseBody === "string" ? cause.responseBody : "";
          let gatewayPayload: { error?: { code?: unknown; message?: unknown; type?: unknown }; code?: unknown; message?: unknown } = {};
          try {
            gatewayPayload = JSON.parse(responseBody);
          } catch {
            // O corpo não era JSON; usamos os campos estruturados disponíveis no erro.
          }
          const gatewayError: { code?: unknown; message?: unknown; type?: unknown } =
            gatewayPayload.error && typeof gatewayPayload.error === "object"
              ? gatewayPayload.error
              : gatewayPayload;
          const rawCode = [gatewayError.code, gatewayError.type, root.code, cause.code]
            .find((value): value is string => typeof value === "string" && value.length > 0);
          const rawMessage = [gatewayError.message, root.message, cause.message]
            .find((value): value is string => typeof value === "string" && value.length > 0)
            ?? "O gateway não forneceu uma mensagem de erro.";
          const redact = (value: string) => {
            let safe = value.replaceAll(apiKey, "[CHAVE REDACTED]");
            const redactMetrics = (item: unknown) => {
              if (typeof item === "string" && item.length > 0) safe = safe.replaceAll(item, "[DADO DA BANCA REDACTED]");
              else if (typeof item === "number" && Number.isFinite(item)) safe = safe.replaceAll(String(item), "[VALOR REDACTED]");
              else if (Array.isArray(item)) item.forEach(redactMetrics);
              else if (item && typeof item === "object") Object.values(item).forEach(redactMetrics);
            };
            redactMetrics(metrics);
            redactMetrics(activeBanca.state);
            return safe
              .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL REDACTED]")
              .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[UUID REDACTED]")
              .replace(/\b(?:nasdaq|ouro|saque2)\b/gi, "[ATIVO REDACTED]")
              .replace(/\b\d+(?:[.,]\d+)?\b/g, "[VALOR REDACTED]")
              .slice(0, 500);
          };
          const errorName = typeof root.name === "string" ? root.name : error instanceof Error ? error.name : "UnknownError";
          const safeCode = rawCode ? redact(rawCode) : "SEM_CODIGO";
          const safeMessage = redact(rawMessage);
          console.error("[analise-ia] Falha na chamada à IA", {
            status: gatewayStatus ?? 502,
            code: safeCode,
            name: errorName,
            message: safeMessage,
          });
          // REMOVER ANTES DO MERGE: debug temporário exposto na resposta.
          return json({
            error: "A análise não ficou disponível agora. Tente novamente.",
            debug: {
              status: gatewayStatus ?? 502,
              code: safeCode,
              message: safeMessage,
              streamPartTypes,
              finishReason: finishReason ?? null,
            },
          }, 502);
        }
      },
    },
  },
});
