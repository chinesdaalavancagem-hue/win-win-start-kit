import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MasterNumberSync } from "@/components/platform/MasterNumberSync";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })) } },
}));

describe("aviso de ativo da Master", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mostra o aviso sem ativo e o remove quando Nasdaq ou Ouro é selecionado", async () => {
    let masterData = JSON.stringify({ bancasVersion: 1, activeId: "a", bancas: [{ id: "a", nome: "Principal" }] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      enabled: true, allowedFields: ["nasdaq.params.mnq"], updatedAt: null,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const loadMasterData = vi.fn(async () => masterData);

    render(<MasterNumberSync loadMasterData={loadMasterData} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Selecione Nasdaq ou Ouro na sua banca ativa para publicar");

    masterData = JSON.stringify({ bancasVersion: 1, activeId: "a", bancas: [{ id: "a", nome: "Principal", ativo: "ouro" }] });
    await waitFor(() => expect(loadMasterData).toHaveBeenCalledTimes(2), { timeout: 4000 });
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument(), { timeout: 4000 });
  });
});
