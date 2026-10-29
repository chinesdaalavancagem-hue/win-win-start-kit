/** Regras de planejamento cadastradas pelo usuário, sem alterar mesas de fábrica. */
export interface MesaPersonalizada {
  id: `custom_${string}`;
  nome: string;
  avaliacao: number;
  payout: number;
  consistencia: number;
  consistenciaFinanciada: number;
  target: number;
  lossLimit: number;
  metaFinanciada: number;
  saque: number;
}
export function idMesaPersonalizada(value: unknown): value is MesaPersonalizada['id'] {
  return typeof value === 'string' && /^custom_[a-z0-9-]{8,64}$/.test(value);
}
export function validarMesaPersonalizada(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Informe as regras da mesa.';
  const m = value as MesaPersonalizada;
  if (!idMesaPersonalizada(m.id)) return 'Identificador de mesa inválido.';
  if (typeof m.nome !== 'string' || !m.nome.trim() || m.nome.trim().length > 60) return 'Informe um nome de até 60 caracteres.';
  for (const n of [m.avaliacao, m.payout]) if (!Number.isInteger(n) || n < 1 || n > 30) return 'Cada fase deve ter entre 1 e 30 dias.';
  for (const n of [m.consistencia, m.consistenciaFinanciada]) if (!Number.isFinite(n) || n < 0 || n > 100) return 'Consistência deve estar entre 0 e 100%. Use 0 para sem regra.';
  for (const n of [m.target, m.lossLimit, m.metaFinanciada]) if (!Number.isFinite(n) || n <= 0 || n > 1000000) return 'Target, loss limit e meta financiada devem ser maiores que zero e até US$ 1.000.000.';
  if (!Number.isFinite(m.saque) || m.saque < 0 || m.saque > 1000000) return 'Saque previsto inválido.';
  const metas = metasAvaliacao(m);
  if (metas.some(n => n <= 0)) return 'O target deve permitir uma meta positiva por dia.';
  const percentual = Math.max(...metas) / metas.reduce((a, b) => a + b, 0) * 100;
  if (m.consistencia > 0 && percentual > m.consistencia + 1e-8) return `Aumente os dias de avaliação: a maior meta representaria ${percentual.toFixed(2)}%, acima de ${m.consistencia}%.`;
  if (m.consistenciaFinanciada > 0 && 100 / m.payout > m.consistenciaFinanciada + 1e-8) return 'Aumente os dias financiados para respeitar a consistência informada.';
  return null;
}
export function metasAvaliacao(m: Pick<MesaPersonalizada, 'target' | 'avaliacao'>): number[] {
  const cents = Math.round(m.target * 100);
  const base = Math.floor(cents / m.avaliacao);
  return Array.from({length: m.avaliacao}, (_, i) => (base + (i < cents % m.avaliacao ? 1 : 0)) / 100);
}
export function normalizarMesasPersonalizadas(raw: unknown): MesaPersonalizada[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  return raw.filter((m): m is MesaPersonalizada => !validarMesaPersonalizada(m)).filter(m => {
    if (ids.has(m.id)) return false;
    ids.add(m.id); return true;
  }).map(m => ({id:m.id, nome:m.nome.trim(), avaliacao:m.avaliacao, payout:m.payout,
    consistencia:m.consistencia, consistenciaFinanciada:m.consistenciaFinanciada,
    target:m.target, lossLimit:m.lossLimit, metaFinanciada:m.metaFinanciada, saque:m.saque}));
}
