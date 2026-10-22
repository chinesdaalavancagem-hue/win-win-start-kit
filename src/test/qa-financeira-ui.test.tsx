import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Platform } from "@/components/platform/Platform";
import { defaultState, handleStop } from "@/lib/platform/engine";

describe("fluxos financeiros protegidos na interface", () => {
  const originalScroll = HTMLElement.prototype.scrollIntoView;
  beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
  afterEach(() => {
    cleanup();
    HTMLElement.prototype.scrollIntoView = originalScroll;
    vi.restoreAllMocks();
  });

  it("bloqueia o lançamento CFD se o valor digitado não for um número real válido", async () => {
    const save = vi.fn(async () => true);
    await act(async () => {
      render(<Platform load={async () => JSON.stringify(defaultState())} save={save} isAdmin={false} officialAcceptedAt={null} />);
    });
    await screen.findAllByText(/Matriz operacional/i);
    fireEvent.click(screen.getByRole("button", { name: /Profit \(bateu a meta\)/ }));
    const campo = screen.getByLabelText(/Valor real liquidado/);
    fireEvent.change(campo, { target: { value: "abc" } });
    expect(screen.getByRole("button", { name: "confirmar" })).toBeDisabled();
    fireEvent.keyDown(campo, { key: "Enter", code: "Enter" });
    expect(screen.getByText("Valor CFD inválido")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "confirmar" })).toBeDisabled();
  });

  it("não permite reconciliar saldo MT5 inválido nem registrar depósito incorreto", async () => {
    await act(async () => {
      render(<Platform load={async () => JSON.stringify(defaultState())} save={async () => true} isAdmin={false} officialAcceptedAt={null} />);
    });
    await screen.findAllByText(/Matriz operacional/i);
    fireEvent.click(screen.getByRole("button", { name: "Expandir menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Bônus e saques" }));
    const campoSaldo = screen.getByLabelText("Saldo real MetaTrader");
    const conferir = screen.getByRole("button", { name: "Conferir" });
    fireEvent.change(campoSaldo, { target: { value: "texto" } });
    expect(conferir).toBeDisabled();
    fireEvent.change(campoSaldo, { target: { value: "1.200,50" } });
    expect(conferir).toBeEnabled();
    const deposito = screen.getByPlaceholderText("Ex.: 1000");
    const aplicar = screen.getByRole("button", { name: "Aplicar depósito" });
    fireEvent.change(deposito, { target: { value: "Infinity" } });
    expect(aplicar).toBeDisabled();
    fireEvent.change(deposito, { target: { value: "50,50" } });
    expect(aplicar).toBeEnabled();
  });

  it("desabilita o atalho de desfazer se o registro antigo não permitir rollback seguro", async () => {
    const state = defaultState();
    handleStop(state, "ouro", 200);
    delete state.log[0]!.assinaturaForexApos;
    await act(async () => {
      render(<Platform load={async () => JSON.stringify(state)} save={async () => true} isAdmin={false} officialAcceptedAt={null} />);
    });
    await screen.findAllByText(/Matriz operacional/i);
    expect(screen.getByRole("button", { name: "Desfazer última operação" })).toBeDisabled();
  });
});
