export const TICKS_FUTUROS = { MGC: 0.1, GC: 0.1, MNQ: 0.25, NQ: 0.25 } as const;
export function precosFuturos(entrada: number, alvo: number, stop: number, tick: number, compra: boolean) {
  if (![entrada, alvo, stop, tick].every(Number.isFinite) || entrada <= 0 || tick <= 0 || alvo < 0 || stop < 0 || !Number.isInteger(alvo) || !Number.isInteger(stop)) return null;
  const unidades = entrada / tick;
  if (Math.abs(unidades - Math.round(unidades)) > 0.000001) return null;
  const sinal = compra ? 1 : -1;
  const resultado = { alvo: Number(((Math.round(unidades) + sinal * alvo) * tick).toFixed(8)), stop: Number(((Math.round(unidades) - sinal * stop) * tick).toFixed(8)) };
  return resultado.alvo > 0 && resultado.stop > 0 ? resultado : null;
}
