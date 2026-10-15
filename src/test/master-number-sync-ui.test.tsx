import { cleanup, render, screen } from "@testing-library/react";
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

  it("mostra e remove o aviso usando o estado em memória, sem polling nem recarga", async () => {
    const masterSemAtivo = JSON.stringify({ bancasVersion: 1, activeId: "a", bancas: [{ id: "a", nome: "Principal" }] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      enabled: true, allowedFields: ["nasdaq.params.mnq"], updatedAt: null,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const view = render(<MasterNumberSync masterData={masterSemAtivo} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Selecione Nasdaq ou Ouro na sua banca ativa para publicar");

    const masterComOuro = JSON.stringify({ bancasVersion: 1, activeId: "a", bancas: [{ id: "a", nome: "Principal", ativo: "ouro" }] });
    view.rerender(<MasterNumberSync masterData={masterComOuro} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // The component receives a snapshot, not load(); it cannot change Plataforma.versionRef or query app_data.
  });
});
