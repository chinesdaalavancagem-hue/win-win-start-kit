import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { defaultState } from "@/lib/platform/engine";
import { novaBanca } from "@/lib/platform/bancas";

vi.mock("@/components/platform/Platform", () => ({ Platform: () => <div>Platform mock</div> }));
vi.mock("@/components/platform/ComprarDesafioModal", () => ({ ComprarDesafioModal: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } }));

import { Bancas } from "@/components/platform/Bancas";

describe("seletor de ativo da banca", () => {
  it("salva o ativo na banca correta e remove a chave ao selecionar vazio", async () => {
    const a = { ...novaBanca("Nasdaq"), state: defaultState() };
    const b = { ...novaBanca("Ouro"), state: defaultState() };
    const initial = { bancasVersion: 1 as const, activeId: a.id, bancas: [a, b] };
    const save = vi.fn(async (_serialized: string) => true);
    await act(async () => { render(<Bancas load={async () => JSON.stringify(initial)} save={save} isAdmin />); });
    fireEvent.click(screen.getByRole("button", { name: /Gerenciar bancas/ }));
    const selector = screen.getByRole("combobox", { name: "Ativo para sincronização: Nasdaq" });
    fireEvent.change(selector, { target: { value: "nasdaq" } });
    await waitFor(() => expect(save).toHaveBeenCalled());
    let saved = JSON.parse(save.mock.calls.at(-1)![0] as string);
    expect(saved.bancas[0].ativo).toBe("nasdaq");
    expect(saved.bancas[1]).not.toHaveProperty("ativo");
    fireEvent.change(screen.getByRole("combobox", { name: "Ativo para sincronização: Nasdaq" }), { target: { value: "" } });
    await waitFor(() => {
      saved = JSON.parse(save.mock.calls.at(-1)![0] as string);
      expect(saved.bancas[0]).not.toHaveProperty("ativo");
    });
  });
});
