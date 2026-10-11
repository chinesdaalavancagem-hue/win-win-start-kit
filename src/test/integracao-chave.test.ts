import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, insert } = vi.hoisted(() => ({ upsert: vi.fn(), insert: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ middleware: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => ({ upsert, insert: (row: unknown) => insert(table, row) }) },
}));
import { gerarChave } from "@/lib/integracao.functions";

const generate = gerarChave as unknown as (args: { context: {
  userId: string; supabase: { rpc: () => Promise<{ data: boolean }> };
} }) => Promise<{ token: string }>;
const call = () => generate({ context: { userId: "test-user", supabase: { rpc: async () => ({ data: true }) } } });

describe("atividade da chave EA no servidor", () => {
  beforeEach(() => {
    upsert.mockReset(); upsert.mockResolvedValue({ error: null });
    insert.mockReset(); insert.mockResolvedValue({ error: null });
  });

  it("registra create com tipo e somente quatro caracteres, nunca a chave ou seu hash", async () => {
    const result = await call();
    const row = { user_id: "test-user", action: "create", details: { tipo: "chave_ea", ultimos_4: result.token.slice(-4) } };
    expect(insert).toHaveBeenCalledWith("activity_logs", row);
    expect(row.details.ultimos_4).toHaveLength(4);
    expect(JSON.stringify(insert.mock.calls)).not.toContain(result.token);
    expect(JSON.stringify(insert.mock.calls)).not.toContain(upsert.mock.calls[0][0].token_hash);
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(insert.mock.invocationCallOrder[0]);
  });

  it.each(["retornado", "exceção"])("falha de log %s não impede retornar a chave", async (mode) => {
    if (mode === "exceção") insert.mockRejectedValue(new Error("unavailable"));
    else insert.mockResolvedValue({ error: { message: "unavailable" } });
    expect((await call()).token).toMatch(/^wow_/);
  });

  it("não registra criação se a chave não foi salva", async () => {
    upsert.mockResolvedValue({ error: { message: "unavailable" } });
    await expect(call()).rejects.toThrow("Não foi possível gerar a chave");
    expect(insert).not.toHaveBeenCalled();
  });
});