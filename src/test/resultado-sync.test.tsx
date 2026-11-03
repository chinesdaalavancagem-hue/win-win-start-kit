import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Platform } from "@/components/platform/Platform";
import { defaultState, selecionarMesaGold } from "@/lib/platform/engine";

it("confirma resultado com vírgula e reenvia a edição após falha", async () => {
  const header = document.createElement("span");
  header.id = "wow-header-sync";
  document.body.appendChild(header);
  const s = defaultState();
  s.activeTab = "ouro";
  selecionarMesaGold(s.assets.ouro, "topstep");
  const save = vi.fn(async (_v: string) => true).mockResolvedValueOnce(false);
  render(<Platform load={async () => JSON.stringify(s)} save={save} isAdmin={false} mesaAtiva="topstep" officialAcceptedAt={null} />);
  const campo = (await screen.findAllByLabelText("Resultado líquido do dia ($)"))[0]!;
  campo.focus();
  fireEvent.change(campo, {target:{value:"1.092,96"}});
  fireEvent.keyDown(campo, {key:"Enter"});
  fireEvent.click(await screen.findByRole("button", {name:"Tentar salvar"}));
  await waitFor(() => expect(screen.getByText("salvo (nuvem)")).toBeTruthy());
  expect(save).toHaveBeenCalledTimes(2);
  for (const [payload] of save.mock.calls) expect(JSON.parse(payload).assets.ouro.attempt.resultadosMesaEod[0]).toBe(1092.96);
  header.remove();
});
