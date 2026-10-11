import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { novaBanca } from "@/lib/platform/bancas";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } }, error: null }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: table === "profiles" ? { approved: true, rejected: false } : { data: null }, error: null,
      }) }) }),
      upsert,
      insert: async () => ({ error: null }),
    }),
  },
}));

import { Route } from "@/routes/api/plataforma/dados";

const post = (Route as unknown as {
  server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
}).server.handlers.POST;

function save(state: unknown) {
  return post({ request: new Request("http://localhost/api/plataforma/dados", {
    method: "POST", headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({ data: JSON.stringify(state) }),
  }) });
}

describe("validação do salvamento", () => {
  beforeEach(() => { upsert.mockReset(); upsert.mockResolvedValue({ error: null }); });

  it("salva o documento de múltiplas bancas sem alterar seu formato", async () => {
    const banca = novaBanca("Principal");
    banca.state.assets.nasdaq.days[0].mnq = 7;
    const doc = { bancasVersion: 1, activeId: banca.id, bancas: [banca, novaBanca("Segunda")] };
    expect((await save(doc)).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ data: JSON.stringify(doc), user_id: "test-user" }));
  });

  it("continua salvando o estado legado", async () => {
    const state = defaultState();
    expect((await save(state)).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ data: JSON.stringify(state) }));
  });

  it.each([
    { bancas: [] },
    { bancas: [null] },
    { bancas: [{ state: defaultState() }, { state: { assets: { nasdaq: { days: [] } } } }] },
    { assets: { nasdaq: { days: [] }, ouro: { days: "invalid" } } },
  ])("rejeita estados inválidos antes de gravar: %j", async (state) => {
    const response = await save(state);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_state" });
    expect(upsert).not.toHaveBeenCalled();
  });
});