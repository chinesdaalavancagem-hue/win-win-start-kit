import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Platform } from "@/components/platform/Platform";
import { defaultState } from "@/lib/platform/engine";

describe("Platform nativa", () => {
  it("rola para o próximo dia após Profit e volta ao primeiro após Stop", async () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const state = defaultState();
      state.assets.nasdaq.attempt.currentDayIndex = 1;
      await act(async () => { render(<Platform load={async () => JSON.stringify(state)} save={async () => true} />); });
      expect(scroll).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: /Profit/ }));
      const confirmProfit = screen.queryByRole("button", { name: /confirmar/ });
      if (confirmProfit) fireEvent.click(confirmProfit);
      expect(scroll).toHaveBeenCalledTimes(1);
      expect((scroll.mock.instances[0] as HTMLElement).textContent).toContain("D3");

      fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
      fireEvent.click(screen.getByRole("button", { name: /confirmar/ }));
      expect(scroll).toHaveBeenCalledTimes(2);
      expect((scroll.mock.instances[1] as HTMLElement).textContent).toContain("D1");
      expect(scroll).toHaveBeenLastCalledWith({ behavior: "smooth", block: "center" });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

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

  it("salva o valor real liquidado no Stop com o spread", async () => {
    const save = vi.fn(async () => true);
    await act(async () => { render(<Platform load={async () => null} save={save} />); });
    await screen.findByText("Meta total prop firm");
    fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
    fireEvent.change(screen.getByLabelText(/Valor real liquidado/), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar/ }));
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    const saved = JSON.parse((save.mock.calls.at(-1) as unknown as [string])[0]);
    const e = saved.log.at(-1);
    expect(e.cfdReal).toBe(500);
    expect(e.spread).toBeCloseTo(500 - e.cfdTeorico);
    expect(saved.cfdBalance).toBe(500 - saved.assets.nasdaq.params.taxa);
  });
});
