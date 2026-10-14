import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/termos/aceite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAuthenticatedUser, recordTermsAcceptance } = await import("@/lib/terms.server");
        const user = await getAuthenticatedUser(request);
        if (!user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Pedido inválido." }, 400);
        }

        const deviceHash = body && typeof body === "object"
          ? (body as Record<string, unknown>).deviceHash
          : undefined;
        if (typeof deviceHash !== "string" || !/^[0-9a-f]{64}$/.test(deviceHash)) {
          return json({ error: "Hash do aparelho inválido." }, 400);
        }

        try {
          const result = await recordTermsAcceptance(user.id, deviceHash);
          return json({ ok: true, version: result.version, alreadyAccepted: result.alreadyAccepted });
        } catch {
          return json({ error: "Não foi possível registrar o aceite. Tente novamente." }, 503);
        }
      },
    },
  },
});
