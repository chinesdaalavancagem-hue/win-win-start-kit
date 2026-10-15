import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { novaBanca } from "@/lib/platform/bancas";

const { getUser, upsert, insert, update, updateFilters, previous, writeFailure, syncConfig } = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: "test-user" } }, error: null })),
  upsert: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  updateFilters: [] as Array<[string, unknown]>,
  previous: { data: null as string | null, version: null as number | null },
  writeFailure: { value: false },
  syncConfig: { data: null as { enabled: boolean; allowed_fields: string[]; admin_user_id: string; published_values?: Record<string, number[]> } | null },
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("@/lib/terms.server", () => ({
  getTermsStatusForUser: async () => ({ accepted: true }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser },
    from: (table: string) => ({
      select: () => {
        const query = {
          eq: () => query,
          maybeSingle: async () => ({
            data: table === "profiles" ? { approved: true, rejected: false }
              : table === "user_roles" ? { role: "admin" }
              : table === "master_number_sync" ? syncConfig.data
              : previous.data === null ? null : { data: previous.data, version: previous.version ?? 1 },
            error: null,
          }),
        };
        return query;
      },
      upsert,
      update: (values: unknown) => {
        update(table, values);
        if (table !== "app_data") return { eq: () => ({ eq: async () => ({ error: null }) }) };
        let expected: number | null = null;
        const query = {
          eq: (column: string, value: unknown) => { updateFilters.push([column, value]); if (column === "version" && typeof value === "number") expected = value; return query; },
          select: () => query,
          maybeSingle: async () => {
            if (writeFailure.value) return { data: null, error: { message: "unavailable" } };
            if (previous.data === null || previous.version !== expected) return { data: null, error: null };
            previous.data = (values as { data: string }).data;
            previous.version = (values as { version: number }).version;
            return { data: { version: previous.version }, error: null };
          },
        };
        return query;
      },
      insert: (rows: unknown) => {
        const result = insert(table, rows);
        if (table === "app_data") {
          if (previous.data !== null) return Promise.resolve({ error: { message: "duplicate key" } });
          previous.data = (rows as { data: string }).data;
          previous.version = (rows as { version: number }).version;
        }
        return result;
      },
    }),
  },
}));

import { Route } from "@/routes/api/plataforma/dados";

const post = (Route as unknown as {
  server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } };
}).server.handlers.POST;

function save(state: unknown, expectedVersion?: number | null) {
  if (previous.data !== null && previous.version === null) previous.version = 1;
  const version = expectedVersion === undefined ? previous.version : expectedVersion;
  return post({ request: new Request("http://localhost/api/plataforma/dados", {
    method: "POST", headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify({ data: JSON.stringify(state), expectedVersion: version }),
  }) });
}

describe("validação do salvamento", () => {
  beforeEach(() => {
    vi.stubEnv("MASTER_USER_ID", "test-user");
    getUser.mockReset(); getUser.mockResolvedValue({ data: { user: { id: "test-user" } }, error: null });
    upsert.mockReset(); upsert.mockResolvedValue({ error: null }); writeFailure.value = false;
    insert.mockReset(); insert.mockResolvedValue({ error: null });
    update.mockReset(); updateFilters.length = 0;
    previous.data = null; previous.version = null;
    syncConfig.data = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("grava com a versão correta e incrementa a versão", async () => {
    const initial = defaultState(); previous.data = JSON.stringify(initial); previous.version = 4;
    const next = { ...initial, cfdBalance: 42 };
    const response = await save(next, 4);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: 5 });
    expect(previous.version).toBe(5);
    expect(previous.data).toBe(JSON.stringify(next));
    expect(update).toHaveBeenCalledWith("app_data", expect.objectContaining({ version: 5, data: JSON.stringify(next) }));
  });

  it("responde 409 sem sobrescrever quando a versão esperada está obsoleta", async () => {
    const stored = { ...defaultState(), cfdBalance: 11 }; previous.data = JSON.stringify(stored); previous.version = 8;
    const response = await save({ ...stored, cfdBalance: 99 }, 7);
    expect(response.status).toBe(409);
    expect(previous.data).toBe(JSON.stringify(stored));
    expect(previous.version).toBe(8);
  });

  it("expectedVersion null com linha existente responde 409 sem alterar o documento", async () => {
    const stored = { ...defaultState(), cfdBalance: 17 };
    previous.data = JSON.stringify(stored);
    previous.version = 1;

    const response = await save({ ...stored, cfdBalance: 99 }, null);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "version_conflict", version: 1 });
    expect(previous.data).toBe(JSON.stringify(stored));
    expect(previous.version).toBe(1);
    expect(insert.mock.calls.filter(([table]) => table === "app_data")).toEqual([]);
    expect(update.mock.calls.filter(([table]) => table === "app_data")).toEqual([]);
  });

  it.each([-1, 0, 1.5, "1", true, undefined])("rejeita expectedVersion inválido (%s) antes de gravar", async (expectedVersion) => {
    const body: Record<string, unknown> = { data: JSON.stringify(defaultState()) };
    if (expectedVersion !== undefined) body.expectedVersion = expectedVersion;
    const response = await post({ request: new Request("http://localhost/api/plataforma/dados", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    }) });
    expect(response.status).toBe(400);
    expect(insert.mock.calls.filter(([table]) => table === "app_data")).toEqual([]);
    expect(update.mock.calls.filter(([table]) => table === "app_data")).toEqual([]);
  });

  it("aceita apenas uma de duas gravações concorrentes com a mesma versão", async () => {
    const stored = defaultState(); previous.data = JSON.stringify(stored); previous.version = 3;
    const one = { ...stored, cfdBalance: 101 }; const two = { ...stored, cfdBalance: 202 };
    const responses = await Promise.all([save(one, 3), save(two, 3)]);
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(previous.version).toBe(4);
    expect([JSON.stringify(one), JSON.stringify(two)]).toContain(previous.data);
  });

  it("preserva campos já publicados durante publicação automática de outro ativo", async () => {
    const banca = novaBanca("Master");
    banca.ativo = "nasdaq";
    const masterDoc = { bancasVersion: 1, activeId: banca.id, bancas: [banca] };
    syncConfig.data = {
      enabled: true, allowed_fields: ["nasdaq.params.mnq", "ouro.params.mnq"],
      admin_user_id: "test-user", published_values: { "nasdaq.params.mnq": [11] },
    };
    const response = await save(masterDoc);
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith("master_number_sync", expect.objectContaining({
      published_values: expect.objectContaining({ "nasdaq.params.mnq": [11] }),
    }));
  });

  it("não altera a publicação automática quando a Master não tem ativo", async () => {
    const banca = novaBanca("Master");
    const masterDoc = { bancasVersion: 1, activeId: banca.id, bancas: [banca] };
    syncConfig.data = {
      enabled: true, allowed_fields: ["nasdaq.params.mnq"],
      admin_user_id: "test-user", published_values: { "nasdaq.params.mnq": [11] },
    };
    const response = await save(masterDoc);
    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalledWith("master_number_sync", expect.anything());
  });

  it("não publica com configuração antiga pertencente a outro administrador", async () => {
    syncConfig.data = { enabled: true, allowed_fields: ["nasdaq.params.mnq"], admin_user_id: "other-admin" };

    const response = await save(defaultState());

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith("app_data", expect.objectContaining({ data: JSON.stringify(defaultState()), version: 1 }));
    expect(update).not.toHaveBeenCalled();
  });

  it("não publica quando MASTER_USER_ID não está configurado", async () => {
    vi.stubEnv("MASTER_USER_ID", "");
    syncConfig.data = { enabled: true, allowed_fields: ["nasdaq.params.mnq"], admin_user_id: "test-user" };

    const response = await save(defaultState());

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith("app_data", expect.objectContaining({ data: JSON.stringify(defaultState()), version: 1 }));
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
    expect(await response.json()).toEqual({ ok: true, version: 2 });
    expect(update).toHaveBeenCalledWith("app_data", expect.objectContaining({ version: 2 }));
  });

  it("não registra update quando o salvamento falha", async () => {
    const state = defaultState(); previous.data = JSON.stringify(state); state.cfdBalance = 25;
    writeFailure.value = true;
    expect((await save(state)).status).toBe(500);
    expect(insert.mock.calls.filter(([table]) => table === "activity_logs")).toEqual([]);
  });

  it("salva o documento de múltiplas bancas sem alterar seu formato", async () => {
    const banca = novaBanca("Principal");
    const doc = { bancasVersion: 1, activeId: banca.id, bancas: [banca, novaBanca("Segunda")] };
    previous.data = JSON.stringify(doc);
    previous.version = 1;
    const firstDay = banca.state.assets.nasdaq.days[0];
    if (!firstDay) throw new Error("Dia inicial ausente");
    firstDay.mnq = 7;
    expect((await save(doc, 1)).status).toBe(200);
    expect(update).toHaveBeenCalledWith("app_data", expect.objectContaining({ version: 2, data: JSON.stringify(doc) }));
    expect(updateFilters).toContainEqual(["user_id", "test-user"]);
    expect(updateFilters).toContainEqual(["version", 1]);
  });

  it("continua salvando o estado legado", async () => {
    const state = defaultState();
    expect((await save(state)).status).toBe(200);
    expect(insert).toHaveBeenCalledWith("app_data", expect.objectContaining({ data: JSON.stringify(state), version: 1 }));
  });

  it("rejeita ativo inválido no servidor antes de gravar", async () => {
    const banca = novaBanca("Principal");
    const doc = { bancasVersion: 1, activeId: banca.id, bancas: [{ ...banca, ativo: "GOLD" }] };
    const response = await save(doc);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_asset" });
    expect(insert.mock.calls.filter(([table]) => table === "app_data")).toEqual([]);
    expect(update.mock.calls.filter(([table]) => table === "app_data")).toEqual([]);
  });

  it("aceita Nasdaq e Ouro como ativos explícitos de bancas", async () => {
    const a = novaBanca("Nasdaq"); const b = novaBanca("Ouro");
    const doc = { bancasVersion: 1, activeId: a.id, bancas: [{ ...a, ativo: "nasdaq" }, { ...b, ativo: "ouro" }] };
    expect((await save(doc)).status).toBe(200);
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
    expect(insert.mock.calls.filter(([table]) => table === "app_data")).toEqual([]);
    expect(update.mock.calls.filter(([table]) => table === "app_data")).toEqual([]);
  });
});