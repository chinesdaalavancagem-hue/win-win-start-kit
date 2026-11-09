import type { Banca } from './bancas';

export type TipoLancamento = 'deposito' | 'saque' | 'compra' | 'payout' | 'despesa' | 'transferencia';
export interface LancamentoCarteira {
  id: string; data: string; tipo: TipoLancamento; valor: number; descricao: string;
  local: string; destino: string; externo: boolean; quantidade: number; origemConta?: string;
}
export interface SaldoCarteira { id: string; nome: string; valor: number; data: string }
export interface Carteira { versao: 1; lancamentos: LancamentoCarteira[]; saldos: SaldoCarteira[]; conferida: boolean }
export const carteiraVazia = (): Carteira => ({ versao: 1, lancamentos: [], saldos: [], conferida: false });
export const TIPOS_CARTEIRA: Record<TipoLancamento, string> = {
  deposito: 'Aporte de dinheiro novo', saque: 'Retirada para uso pessoal', compra: 'Compra de contas',
  payout: 'Payout recebido', despesa: 'Outras despesas', transferencia: 'Transferência entre carteiras',
};
const centavos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const objeto = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
const texto = (v: unknown) => typeof v === 'string' ? v.slice(0, 200) : '';
const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const dataValida = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export function normalizarCarteira(raw: unknown): Carteira {
  const p = objeto(raw), result = carteiraVazia(), ids = new Set<string>();
  for (const rawEntry of Array.isArray(p.lancamentos) ? p.lancamentos : []) {
    const e = objeto(rawEntry), id = texto(e.id), tipo = texto(e.tipo) as TipoLancamento;
    if (!id || ids.has(id) || !Object.hasOwn(TIPOS_CARTEIRA, tipo) || !numero(e.valor) || !dataValida(e.data)) continue;
    ids.add(id);
    result.lancamentos.push({ id, tipo, data: e.data, valor: centavos(e.valor), descricao: texto(e.descricao), local: texto(e.local), destino: texto(e.destino), externo: e.externo !== false, quantidade: numero(e.quantidade) && Number.isInteger(e.quantidade) && e.quantidade > 0 ? e.quantidade : 1, ...(typeof e.origemConta === 'string' ? {origemConta: e.origemConta} : {}) });
  }
  ids.clear();
  for (const rawSaldo of Array.isArray(p.saldos) ? p.saldos : []) {
    const s = objeto(rawSaldo), id = texto(s.id);
    if (!id || ids.has(id) || !texto(s.nome) || !numero(s.valor) || !dataValida(s.data)) continue;
    ids.add(id); result.saldos.push({ id, nome: texto(s.nome), valor: centavos(s.valor), data: s.data });
  }
  result.conferida = p.conferida === true;
  return result;
}

/** Os saldos são retratos atuais, não a soma dos fluxos. Transferências internas nunca são receita. */
export function resumoCarteira(c: Carteira) {
  let aportes = 0, retiradas = 0, compras = 0, despesas = 0, payouts = 0, custosExternos = 0, payoutsExternos = 0;
  const mesas: Record<string, { quantidade: number; valor: number }> = Object.create(null);
  for (const e of c.lancamentos) {
    if (e.tipo === 'deposito') aportes += e.valor;
    if (e.tipo === 'saque') retiradas += e.valor;
    if (e.tipo === 'payout') { payouts += e.valor; if (e.externo) payoutsExternos += e.valor; }
    if (e.tipo === 'despesa') { despesas += e.valor; if (e.externo) custosExternos += e.valor; }
    if (e.tipo === 'compra') {
      compras += e.valor; if (e.externo) custosExternos += e.valor;
      const chave = e.local || 'Mesa não informada';
      const m = mesas[chave] ?? { quantidade: 0, valor: 0 };
      m.quantidade += e.quantidade; m.valor = centavos(m.valor + e.valor); mesas[chave] = m;
    }
  }
  const saldo = centavos(c.saldos.reduce((t, s) => t + s.valor, 0));
  const investido = centavos(aportes + custosExternos), recebido = centavos(retiradas + payoutsExternos);
  const resultado = centavos(saldo + recebido - investido);
  return { aportes: centavos(aportes), retiradas: centavos(retiradas), compras: centavos(compras), despesas: centavos(despesas), payouts: centavos(payouts), saldo, investido, recebido, resultado, rentabilidade: investido > 0 ? resultado / investido * 100 : null, mesas };
}

/** Backups antigos guardavam a compra no evento, sem taxaCompra no cadastro.
 * Não usa parâmetros de simulação nem escolhe entre taxas históricas conflitantes. */
export function valorCompraRegistrada(b: Banca): number | null {
  if (numero(b.taxaCompra)) return centavos(b.taxaCompra);
  const taxas = [...new Set(b.state.log.flatMap(e => numero(e.taxaCobrada) && e.taxaCobrada > 0 ? [centavos(e.taxaCobrada)] : []))];
  return taxas.length === 1 ? taxas[0]! : null;
}

/** Importação explícita, uma compra por ID, sem inferir compras pelo número de ciclos. */
export function importarCompras(c: Carteira, bancas: Banca[], nomes: Record<string, {nome: string}>): Carteira {
  const origens = new Set(c.lancamentos.flatMap(e => e.origemConta ? [e.origemConta] : []));
  const novas: LancamentoCarteira[] = [];
  for (const b of bancas) {
    const valor = valorCompraRegistrada(b);
    if (origens.has(b.id) || valor === null) continue;
    origens.add(b.id);
    novas.push({id: `compra-conta:${b.id}`, origemConta: b.id, data: new Date(b.criadaEm).toISOString().slice(0, 10), tipo: 'compra', valor, quantidade: 1, externo: true, local: nomes[b.mesa ?? 'tradefive']?.nome ?? 'Mesa personalizada', destino: '', descricao: b.nome});
  }
  return novas.length ? {...c, conferida: false, lancamentos: [...c.lancamentos, ...novas]} : c;
}

export function mesclarCarteiras(atual: Carteira, backup: Carteira): Carteira {
  const ids = new Set(atual.lancamentos.map(e => e.id));
  const origens = new Set(atual.lancamentos.flatMap(e => e.origemConta ? [e.origemConta] : []));
  const novos = backup.lancamentos.filter(e => !ids.has(e.id) && (!e.origemConta || !origens.has(e.origemConta)));
  // Nunca somar saldos de dois backups. O retrato atual prevalece para a mesma carteira.
  const saldos = [...atual.saldos, ...backup.saldos.filter(s => !atual.saldos.some(a => a.id === s.id || a.nome.toLowerCase() === s.nome.toLowerCase()))];
  return {...atual, lancamentos: [...atual.lancamentos, ...novos], saldos, conferida: false};
}
