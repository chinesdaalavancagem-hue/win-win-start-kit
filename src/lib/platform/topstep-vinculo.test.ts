import { describe, expect, it } from "vitest";
import { contaTopstepOperacional, validarCatalogoTopstep } from "./topstep-vinculo";

const agora = 200000;
const conta = (id: string, nome: string, observadoEm = agora) => ({ id, nome, observadoEm });
const pronto = (contas: unknown[]) => ({ situacao: "PRONTO", contas });

describe("Sugestoes passivas de conta TopstepX", () => {
  it("aceita financiada Express e avaliacao 50KTC", () => {
    expect(contaTopstepOperacional("EXPRESS-V2-704418-60196276")).toBe(true);
    expect(contaTopstepOperacional("50KTC-SKU-V2-704418-16478539")).toBe(true);
  });
  it("nunca sugere a conta Practice", () => {
    const catalogo = validarCatalogoTopstep(pronto([
      conta("28987612", "PRAC-V2-704418-58132507"),
      conta("29076383", "EXPRESS-V2-704418-60196276"),
    ]), agora);
    expect(catalogo.contas.map((c) => c.id)).toEqual(["29076383"]);
  });
  it("rejeita identificacao vencida e tempo futuro", () => {
    expect(validarCatalogoTopstep(pronto([conta("29076383", "EXPRESS-V2-1", agora - 120001)]), agora).situacao).toBe("DESATUALIZADO");
    expect(validarCatalogoTopstep(pronto([conta("29076383", "EXPRESS-V2-1", agora + 5001)]), agora).situacao).toBe("DESATUALIZADO");
  });
  it("bloqueia duplicata de ID com nomes divergentes", () => {
    expect(validarCatalogoTopstep(pronto([
      conta("29076383", "EXPRESS-V2-1"), conta("29076383", "EXPRESS-V2-2"),
    ]), agora).situacao).toBe("AMBIGUO");
  });
  it("rejeita payload adulterado, chaves de conta inválidas e estados desconhecidos", () => {
    expect(validarCatalogoTopstep(pronto([conta("7612abc", "EXPRESS-V2-1")]), agora).situacao).toBe("DESATUALIZADO");
    expect(validarCatalogoTopstep(pronto([conta("29076383", "EXPRESS-<script>")]), agora).situacao).toBe("DESATUALIZADO");
    expect(validarCatalogoTopstep({ situacao: "HABILITAR_ORDENS", contas: [] }, agora).situacao).toBe("SEM_DADOS");
  });
});
