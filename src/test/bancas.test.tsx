import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { novaBanca } from "@/lib/platform/bancas";

vi.mock("@/components/platform/Platform", () => ({ Platform: () => <div>Platform mock</div> }));
vi.mock("@/components/platform/ComprarDesafioModal", () => ({ ComprarDesafioModal: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } } }));

import { Bancas } from "@/components/platform/Bancas";

describe("gestão de bancas sem sincronização automática", () => {
  it("carrega e gerencia bancas sem exibir seletor de sincronização nem recarregar o documento", async () => {
    const a = { ...novaBanca("Nasdaq"), state: defaultState() };
    const b = { ...novaBanca("Ouro"), state: defaultState() };
    const initial = { bancasVersion: 1 as const, activeId: a.id, bancas: [a, b] };
    const load = vi.fn(async () => JSON.stringify(initial));
    const save = vi.fn(async (_serialized: string) => true);

    await act(async () => {
      render(<Bancas load={load} save={save} isAdmin />);
    });

    expect(await screen.findByRole("combobox", { name: "Banca ativa" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/Ativo para sincronização/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Minhas bancas/i }));
    expect(screen.getAllByText("Nasdaq").some((el) => el.tagName !== "OPTION")).toBe(true);
    expect(screen.getAllByText("Ouro").some((el) => el.tagName !== "OPTION")).toBe(true);
    expect(screen.queryByLabelText(/Ativo para sincronização/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Banca ativa" }), { target: { value: b.id } });
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(load).toHaveBeenCalledTimes(1);
  });
});
