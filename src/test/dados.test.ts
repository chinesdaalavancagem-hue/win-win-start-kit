import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { novaBanca } from "@/lib/platform/bancas";

const { upsert, insert, update, previous, syncConfig } = vi.hoisted(() => ({
  upsert: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  previous: { data: null as string | null },
  syncConfig: { data: null as { enabled: boolean; allowed_fields: string[]; admin_user_id: string } | null },
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("@/lib/terms.server", () => ({
  getTermsStatusForUser: async () => ({ accepted: true }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } }, error: null }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: table === "profiles" ? { approved: true, rejected: false }
          : table === "user_roles" ? { role: "admin" }
          : table === "master_number_sync" ? syncConfig.data
          : { data: previous.data },
        error: null,
      }) }) }),
      upsert,
      update: (values: unknown) => {
        update(table, values);
        return { eq: () => ({ eq: async () => ({ error: null }) }) };
      },
      insert: (rows: unknown) => insert(table, rows),
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
  beforeEach(() => {
    vi.stubEnv("MASTER_USER_ID", "test-user");
    upsert.mockReset(); upsert.mockResolvedValue({ error: null });
    insert.mockReset(); insert.mockResolvedValue({ error: null });
    update.mockReset();
    previous.data = null;
    syncConfig.data = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("não publica com configuração antiga pertencente a outro administrador", async () => {
    syncConfig.data = { enabled: true, allowed_fields: ["nasdaq.params.mnq"], admin_user_id: "other-admin" };

    const response = await save(defaultState());

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("não publica quando MASTER_USER_ID não está configurado", async () => {
    vi.stubEnv("MASTER_USER_ID", "");
    syncConfig.data = { enabled: true, allowed_fields: ["nasdaq.params.mnq"], admin_user_id: "test-user" };

    const response = await save(defaultState());

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("registra cada número alterado por ID da banca, sem confundir reordenação", async () => {
    const a = novaBanca("Principal"); const b = novaBanca("Segunda");
    previous.data = JSON.stringify({ bancasVersion: 1, activeId: a.id, bancas: [a, b] });
    a.state.cfdBalance = 123;
    const day = a.state.assets.nasdaq.days[0];
    if (!day) throw new Error("Dia inicial ausente");
    day.mnq = 7;
    expect((await save({ bancasVersion: 1, activeId: b.id, bancas: [b, a] })).status).toBe(200);
    expect(insert).toHaveBeenCalledWith("activity_logs", [
      expect.objectContaining({ user_id: "test-user", action: "update", details: {
        banca_id: a.id, campo: "assets.nasdaq.days.0.mnq", valor_antigo: 20, valor_novo: 7,
      } }),
      expect.objectContaining({ action: "update", details: {
        banca_id: a.id, campo: "cfdBalance", valor_antigo: 0, valor_novo: 123,
      } }),
    ]);
  });

  it("não registra números iguais, textos ou o primeiro salvamento", async () => {
    const banca = novaBanca("Principal");
    const doc = { bancasVersion: 1, activeId: banca.id, bancas: [banca] };
    await save(doc);
    previous.data = JSON.stringify(doc);
    banca.nome = "Outro nome";
    await save(doc);
    expect(insert.mock.calls.filter(([table]) => table === "activity_logs")).toEqual([]);
  });

  it("registra mudanças no formato legado", async () => {
    const state = defaultState(); previous.data = JSON.stringify(state);
    state.cfdBalance = 25;
    await save(state);
    expect(insert).toHaveBeenCalledWith("activity_logs", [{ user_id: "test-user", action: "update",
      details: { banca_id: "legado", campo: "cfdBalance", valor_antigo: 0, valor_novo: 25 } }]);
  });

  it("não corta mudanças após vinte campos", async () => {
    const state = { ...defaultState(), numeros: Array.from({ length: 25 }, () => 0) };
    previous.data = JSON.stringify(state); state.numeros.fill(1);
    await save(state);
    const call = insert.mock.calls.find(([table]) => table === "activity_logs");
    expect(call?.[1]).toHaveLength(25);
  });

  it.each(["retornado", "exceção"])("falha de log %s não faz o salvamento falhar", async (mode) => {
    const state = defaultState(); previous.data = JSON.stringify(state); state.cfdBalance = 25;
    if (mode === "exceção") insert.mockRejectedValue(new Error("unavailable"));
    else insert.mockResolvedValue({ error: { message: "unavailable" } });
    const response = await save(state);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalled();
  });

  it("não registra update quando o salvamento falha", async () => {
    const state = defaultState(); previous.data = JSON.stringify(state); state.cfdBalance = 25;
    upsert.mockResolvedValue({ error: { message: "unavailable" } });
    expect((await save(state)).status).toBe(500);
    expect(insert.mock.calls.filter(([table]) => table === "activity_logs")).toEqual([]);
  });

  it("salva o documento de múltiplas bancas sem alterar seu formato", async () => {
    const banca = novaBanca("Principal");
    const firstDay = banca.state.assets.nasdaq.days[0];
    if (!firstDay) throw new Error("Dia inicial ausente");
    firstDay.mnq = 7;
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