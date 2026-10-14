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

export const Route = createFileRoute("/api/termos/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getAuthenticatedUser, getTermsStatusForUser } = await import("@/lib/terms.server");
        const user = await getAuthenticatedUser(request);
        if (!user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

        try {
          const status = await getTermsStatusForUser(user.id);
          return json(status);
        } catch {
          // Fail closed: erro de banco/configuração nunca libera a rota protegida.
          return json({ error: "Não foi possível verificar os termos. A migração pode estar pendente." }, 503);
        }
      },
    },
  },
});
