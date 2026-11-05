/** Vest Capital: valores de referencia, conferir plano e preço no checkout oficial. */
export const VEST_ACCOUNT_SIZES = [5000, 10000, 25000, 50000] as const;
export type VestCapital = (typeof VEST_ACCOUNT_SIZES)[number];
export type VestDailyLimit = 0 | 3;
const feesWithoutDll: Record<VestCapital,number> = {5000:75,10000:150,25000:375,50000:745};
const feesWithDll: Record<VestCapital,number> = {5000:40,10000:80,25000:210,50000:415};
export const VEST_GC_TAKER_RATE = 0.000025;
export function vestPlan(capital:VestCapital=50000,dailyLimitPercent:VestDailyLimit=0) {
  return {capital,dailyLimitPercent,target:capital*.1,staticDrawdown:capital*.06,
    equityFloor:capital*.94,dailyLoss:capital*dailyLimitPercent/100,
    fee:(dailyLimitPercent===3?feesWithDll:feesWithoutDll)[capital],
    profitSplit:0.8,minDays:0,consistency:0};
}
/** Equivalencia de exposicao somente: 10 unidades GC-PERP ≈ 1 MGC CME. */
export function vestMgcEquivalent(units:number) {return Number.isFinite(units)&&units>=0?units/10:0;}
export function vestUsdPerPoint(units:number) {return Number.isFinite(units)&&units>=0?units:0;}
export function vestTakerFees(units:number,entry:number,exit:number) {
  return [units,entry,exit].every(Number.isFinite)&&units>=0&&entry>=0&&exit>=0?units*(entry+exit)*VEST_GC_TAKER_RATE:0;
}
