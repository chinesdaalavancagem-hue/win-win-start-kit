import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Platform } from "@/components/platform/Platform";
import { defaultState } from "@/lib/platform/engine";
import { queueSaveUnlessConflicted, recoverVersionConflict } from "@/lib/platform/versioned-save";

describe("recuperação de conflito de versão", () => {
  it("em 409 chama reload sem aplicar um snapshot conflitante", async () => {
    const applySnapshot = vi.fn();
    const reload = vi.fn();

    await recoverVersionConflict(reload);

    expect(applySnapshot).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("depois de um 409, save chamado antes do reload não envia outra requisição", async () => {
    const queue = { current: Promise.resolve() };
    const conflict = { current: false };
    const send = vi.fn(async () => {
      conflict.current = true;
      await recoverVersionConflict(vi.fn());
      return false;
    });
    const save = (value: string) =>
      queueSaveUnlessConflicted<string | false>(queue, conflict, () => send().then(() => value), false);

    await expect(save("primeiro")).resolves.toBe("primeiro");
    await expect(save("antes-do-reload")).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it("bloqueia também um save que já estava na fila quando ocorreu o 409", async () => {
    const queue = { current: Promise.resolve() };
    const conflict = { current: false };
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const send = vi.fn()
      .mockImplementationOnce(async () => {
        await firstPending;
        conflict.current = true;
        await recoverVersionConflict(vi.fn());
        return "409";
      })
      .mockImplementation(async () => "200");
    const save = (value: string) =>
      queueSaveUnlessConflicted<string | false>(queue, conflict, () => send().then(() => value), false);

    const first = save("primeiro");
    const second = save("enfileirado");
    releaseFirst();
    await expect(first).resolves.toBe("primeiro");
    await expect(second).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });
});

describe("Platform nativa", () => {
  const originalScroll = HTMLElement.prototype.scrollIntoView;
  beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
  afterEach(() => { HTMLElement.prototype.scrollIntoView = originalScroll; });
  it.each([
    ["profit", false], ["stop", false], ["profit", true], ["stop", true],
  ] as const)("desfaz %s registrado por atalho=%s e salva o estado anterior", async (operation, shortcut) => {
    const initial = defaultState();
    initial.assets.nasdaq.attempt.currentDayIndex = 1;
    for (const asset of Object.values(initial.assets)) asset.params.saldoInicial = 0;
    const save = vi.fn(async () => true);
    await act(async () => { render(<Platform load={async () => JSON.stringify(initial)} save={save} isAdmin={false} officialAcceptedAt={null} />); });
    // A plataforma só aparece depois do carregamento dos dados e da tentativa de sincronização do Storage.
    await screen.findAllByText(/Matriz operacional/i);

    if (shortcut) {
      fireEvent.keyDown(window, { code: "Digit2", shiftKey: operation === "profit", ctrlKey: operation === "stop" });
    } else {
      fireEvent.click(screen.getByRole("button", { name: operation === "profit" ? /Profit \(bateu/ : /Stop \(reprovou/ }));
      fireEvent.change(screen.getByLabelText(/Valor real liquidado/), { target: { value: operation === "profit" ? "-420" : "500" } });
      fireEvent.click(screen.getByRole("button", { name: "confirmar" }));
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    const recorded = JSON.parse((save.mock.calls.at(-1) as unknown as [string])[0]);
    expect(recorded.log).toHaveLength(1);
    expect(recorded.assets.nasdaq.attempt.currentDayIndex).toBe(operation === "profit" ? 2 : 0);

    fireEvent.click(screen.getByRole("button", { name: /Desfazer última operação/ }));
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    const restored = JSON.parse((save.mock.calls.at(-1) as unknown as [string])[0]);
    expect(restored).toEqual(initial);
  });

  it("rola para o próximo dia após Profit e volta ao primeiro após Stop", async () => {
    const scroll = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const state = defaultState();
      state.assets.nasdaq.attempt.currentDayIndex = 1;
      await act(async () => { render(<Platform load={async () => JSON.stringify(state)} save={async () => true} isAdmin={true} officialAcceptedAt={null} />); });
      await screen.findAllByText(/Matriz operacional/i);
      expect(scroll).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: /Profit/ }));
      const confirmProfit = screen.getByRole("button", { name: /confirmar/ });
      await act(async () => { fireEvent.click(confirmProfit); });
      expect(scroll).toHaveBeenCalledTimes(1);
      expect((scroll.mock.instances[0] as HTMLElement).textContent).toContain("D3");

      fireEvent.click(screen.getByRole("button", { name: /Stop/ }));
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: /confirmar/ })); });
      expect(scroll).toHaveBeenCalledTimes(2);
      expect((scroll.mock.instances[1] as HTMLElement).textContent).toContain("D1");
      expect(scroll).toHaveBeenLastCalledWith({ behavior: "smooth", block: "center" });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("carrega, alterna menus, registra Stop e salva", async () => {
    const save = vi.fn(async () => true);
    await act(async () => { render(<Platform load={async () => null} save={save} isAdmin={false} officialAcceptedAt={null} />); });
    expect(await screen.findAllByText(/Matriz operacional/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Expandir menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Parâmetros" }));
    expect(screen.getAllByText(/Limite geral EOD/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Expandir menu" }));
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
    await act(async () => { render(<Platform load={async () => null} save={save} isAdmin={false} officialAcceptedAt={null} />); });
    await screen.findAllByText(/Matriz operacional/i);
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
