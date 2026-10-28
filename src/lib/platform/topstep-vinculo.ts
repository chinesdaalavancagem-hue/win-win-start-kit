/** Sugestoes de identificacao TopstepX. Nunca autorizam ordens ou reconciliacao. */
export interface ContaTopstepDetectada {
  id: string;
  nome: string;
  observadoEm: number;
}

export type SituacaoCatalogoTopstep =
  | "PRONTO" | "SEM_DADOS" | "AMBIGUO" | "DESATUALIZADO" | "EXTENSAO_INDISPONIVEL";

export interface CatalogoTopstep {
  situacao: SituacaoCatalogoTopstep;
  contas: ContaTopstepDetectada[];
}

const CONTA_ID = /^[1-9][0-9]{0,19}$/;
const CONTA_NOME = /^[A-Za-z0-9][A-Za-z0-9_. -]{1,99}$/;

/** Practice não é uma banca operacional e não pode ser sugerida. */
export function contaTopstepOperacional(nome: string): boolean {
  return /^(?:EXPRESS-|(?:50|100|150)KTC-)/i.test(nome);
}

export function validarCatalogoTopstep(payload: unknown, agora = Date.now()): CatalogoTopstep {
  if (!payload || typeof payload !== "object") return { situacao: "SEM_DADOS", contas: [] };
  const p = payload as Record<string, unknown>;
  if (p.situacao === "AMBIGUO") return { situacao: "AMBIGUO", contas: [] };
  if (p.situacao === "DESATUALIZADO") return { situacao: "DESATUALIZADO", contas: [] };
  if (p.situacao !== "PRONTO" || !Array.isArray(p.contas) || p.contas.length > 10) {
    return { situacao: "SEM_DADOS", contas: [] };
  }
  const contas: ContaTopstepDetectada[] = [];
  const ids = new Set<string>();
  const nomes = new Set<string>();
  for (const raw of p.contas) {
    if (!raw || typeof raw !== "object") return { situacao: "AMBIGUO", contas: [] };
    const c = raw as Record<string, unknown>;
    if (typeof c.id !== "string" || !CONTA_ID.test(c.id) ||
        typeof c.nome !== "string" || !CONTA_NOME.test(c.nome) ||
        typeof c.observadoEm !== "number" || !Number.isSafeInteger(c.observadoEm) ||
        c.observadoEm > agora + 5000 || agora - c.observadoEm > 120000) {
      return { situacao: "DESATUALIZADO", contas: [] };
    }
    if (!contaTopstepOperacional(c.nome)) continue;
    if (ids.has(c.id) || nomes.has(c.nome)) return { situacao: "AMBIGUO", contas: [] };
    ids.add(c.id);
    nomes.add(c.nome);
    contas.push({ id: c.id, nome: c.nome, observadoEm: c.observadoEm });
  }
  return { situacao: contas.length ? "PRONTO" : "SEM_DADOS", contas };
}
