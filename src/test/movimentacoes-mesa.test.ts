import { describe, expect, it } from "vitest";
import { defaultState, normalizeState } from "@/lib/platform/engine";
import { cicloAberto, resumoCiclo, storeVazio, type MovimentacaoMesa } from "@/lib/platform/movimentacoes-mesa";

const mov = (p: Partial<MovimentacaoMesa>): MovimentacaoMesa => ({ id: Math.random().toString(), data: "2026-11-20", ativo: "ouro", ciclo: 1, resultado: 0, criadoEm: 1, ...p });

describe("Movimentações da Mesa", () => {
  it("saldo = base + ganhos - perdas", () => {
    const st = storeVazio(); st.bases["ouro:1"] = 1000;
    st.lancamentos.push(mov({ resultado: 200 }), mov({ resultado: -50, data: "2026-11-21" }), mov({ resultado: 0 }));
    const r = resumoCiclo(st, "ouro", 1);
    expect([r.ganhos, r.perdas, r.liquido, r.saldo]).toEqual([200, -50, 150, 1150]);
    expect(r.linhas.at(-1)!.acumulado).toBe(1150);
  });
  it("separa Gold de Nasdaq e ciclo 1 de ciclo 2", () => {
    const st = storeVazio();
    st.lancamentos.push(mov({ resultado: 100 }), mov({ ativo: "nasdaq", resultado: 300 }), mov({ ciclo: 2, resultado: -40 }));
    expect(resumoCiclo(st, "ouro", 1).saldo).toBe(100);
    expect(resumoCiclo(st, "nasdaq", 1).saldo).toBe(300);
    expect(resumoCiclo(st, "ouro", 2).saldo).toBe(-40);
  });
  it("cada banca tem seu próprio estado", () => {
    const a = defaultState(), b = defaultState();
    a.movimentacoesMesa = storeVazio(); a.movimentacoesMesa.lancamentos.push(mov({ resultado: 500 }));
    expect(resumoCiclo(b.movimentacoesMesa, "ouro", 1).saldo).toBe(0);
  });
  it("ciclo aberto avança só com payout aprovado com saque > 0", () => {
    const s = defaultState();
    expect(cicloAberto(s, "ouro")).toBe(1);
    s.log.push({ id: 1, ts: 1, asset: "ouro", day: 0, tipo: "aprovada", delta: 0, saldoApos: 0, saque: 900 });
    s.log.push({ id: 2, ts: 2, asset: "nasdaq", day: 0, tipo: "aprovada", delta: 0, saldoApos: 0, saque: 0 });
    expect(cicloAberto(s, "ouro")).toBe(2);
    expect(cicloAberto(s, "nasdaq")).toBe(1);
  });
  it("não interfere nos cálculos operacionais e estados antigos continuam carregando", () => {
    const base = normalizeState(defaultState());
    const com = normalizeState({ ...structuredClone(base), movimentacoesMesa: { versao: 1, lancamentos: [mov({ resultado: 999 })], bases: { "ouro:1": 5 } } });
    const { movimentacoesMesa, ...resto } = com;
    expect(resto).toEqual(base);
    expect(movimentacoesMesa?.lancamentos).toHaveLength(1);
    expect(normalizeState(defaultState()).movimentacoesMesa).toBeUndefined();
    expect(normalizeState({ ...defaultState(), movimentacoesMesa: "lixo" }).movimentacoesMesa).toBeUndefined();
  });
});
