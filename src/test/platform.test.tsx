import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Platform } from "@/components/platform/Platform";

describe("Platform nativa", () => {
  it("carrega, alterna menus, registra Stop e salva", async () => {
    const save = vi.fn(async () => true);
    await act(async () => { render(<Platform load={async () => null} save={save} />); });
    expect(await screen.findByText("Meta total prop firm")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Parâmetros" }));
    expect(screen.getByText(/Limite geral EOD/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Operações" }));
    const stop = screen.getByRole("button", { name: /Stop/ });
    fireEvent.click(stop); fireEvent.click(screen.getByRole("button", { name: /confirmar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    expect(screen.getAllByText(/conta reprovada/).length).toBeGreaterThan(0);
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(save).toHaveBeenCalled();
    const saved = JSON.parse((save.mock.calls.at(-1) as unknown as [string])[0]);
    expect(saved.counts.reprovadas).toBe(1);
  });
});
