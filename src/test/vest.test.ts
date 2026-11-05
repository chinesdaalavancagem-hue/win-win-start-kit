import { describe, it, expect } from 'vitest';
import { calculateVest, newVestDraft, normalizeVestDraft, vestNumber, type VestDraft } from '@/lib/platform/vest';
import { defaultState, normalizeState } from '@/lib/platform/engine';
const scenario = (patch: Partial<VestDraft> = {}): VestDraft => ({ ...newVestDraft(), quantity:'2', entry:'20000', exit:'20100', index:'20000', leverage:'50', tick:'0.25', quantityStep:'0.0001', ...patch });

describe('Vest linear contracts, costs and independent broker prices', () => {
 it('converts two NQ units to one MNQ and charges both notionals', () => {
  const r=calculateVest(scenario()); expect(r.errors).toEqual([]);
  expect(r.trade).toMatchObject({gross:200,fees:2.005,notional:40000,margin:800,microEquivalent:1,tickValue:0.5,ticks:400});
  expect(r.trade!.net).toBeCloseTo(197.995);
 });
 it('changes margin but not P&L when leverage changes', () => {
  const a=calculateVest(scenario()).trade!; const b=calculateVest(scenario({leverage:'10'})).trade!;
  expect(b.net).toBe(a.net); expect(b.margin).toBe(4000);
 });
 it('models gold units, not a CME GC contract multiplier', () => {
  const r=calculateVest(scenario({market:'GC-PERP',quantity:'10',entry:'4000',exit:'4010',index:'4000',leverage:'25',tick:'0.1'}));
  expect(r.trade).toMatchObject({gross:100,microEquivalent:1,tickValue:1,margin:1600});
 });
 it('applies positive/negative funding with opposite signs for longs and shorts', () => {
  for(const side of ['buy','sell'] as const) for(const rate of [0.01,-0.01]) {
   const r=calculateVest(scenario({side,fundingHours:'2',fundingPctHour:String(rate)}));
   expect(r.trade!.fundingCost).toBeCloseTo((side==='buy'?1:-1)*40000*rate/100*2);
  }
 });
 it('does not treat empty, malformed, or nonfinite input as zero', () => {
  for(const entry of ['', 'abc', 'Infinity','-1','0','12foo']) expect(calculateVest(scenario({entry})).trade).toBeNull();
  expect(calculateVest(scenario({fundingHours:'1',fundingPctHour:''})).trade).toBeNull();
  expect(calculateVest(scenario({fundingHours:'0.5',fundingPctHour:'0'})).trade).toBeNull();
 });
 it('accepts Portuguese decimals and never turns a small decimal step into 1', () => {
  expect(vestNumber('0.001')).toBe(0.001); expect(vestNumber('0,001')).toBe(0.001);
  expect(vestNumber('20.000,25')).toBe(20000.25); expect(vestNumber('20,000.25')).toBeNull();
  expect(vestNumber('1.234.567')).toBeNull();
 });
 it('requires known grids for ticks and validates provided increments without rounding orders up', () => {
  expect(calculateVest(scenario({tick:'',quantityStep:''})).trade!.ticks).toBeNull();
  expect(calculateVest(scenario({quantity:'0.00015'})).trade).toBeNull();
  expect(calculateVest(scenario({entry:'20000.1'})).trade).toBeNull();
  expect(calculateVest(scenario({leverage:'51'})).trade).toBeNull();
 });
 it('calculates fixed drawdown and a transfer-adjusted DLL; equality is not breach', () => {
  const s=scenario({quantity:'10',entry:'100',exit:'100',index:'100',leverage:'10',entryFeePct:'0',exitFeePct:'0',capital:'25000',drawdownPct:'6',equity:'23500',dllPct:'4',resetBalance:'25000',transfers:'-500'});
  const r=calculateVest(s); expect(r.risk).toMatchObject({floor:23500,dailyFloor:23500,effectiveFloor:23500,room:0,after:23500,breached:false,atFloor:true});
  expect(calculateVest({...s,exit:'99.75'}).risk!.breached).toBe(true);
  expect(calculateVest({...s,equity:'28000'}).risk!.floor).toBe(23500);
 });
 it('solves the price reaching the loss floor including price-dependent exit fees', () => {
  for(const side of ['buy','sell'] as const) {
   const s=scenario({side,capital:'10000',drawdownPct:'6',equity:'10000',fundingHours:'1',fundingPctHour:'0.01'});
   const r=calculateVest(s); expect(r.risk!.room).toBe(600);
   const boundary=calculateVest({...s,exit:String(r.risk!.thresholdPrice),tick:''});
   expect(boundary.risk!.after).toBeCloseTo(9400,7);
   const steps=r.risk!.adverseTicks!;
   const nextPrice=20000+(side==='buy'?-1:1)*steps*0.25;
   expect(calculateVest({...s,exit:String(nextPrice)}).risk!.breached).toBe(true);
   expect(calculateVest({...s,exit:String(nextPrice+(side==='buy'?1:-1)*0.25)}).risk!.breached).toBe(false);
  }
 });
 it('allows independent MT5 movement and USDC conversion, validates broker sizes', () => {
  const s=scenario({brokerEntry:'19950',brokerExit:'20030',brokerLots:'2',brokerPointValue:'1',brokerStep:'0.01',brokerMin:'0.01',brokerMax:'100',brokerCosts:'3',usdcUsd:'0.99'});
  const r=calculateVest(s); expect(r.broker!.net).toBe(-163);
  expect(r.broker!.combined).toBeCloseTo(197.995*0.99-163);
  expect(r.broker).toMatchObject({priceDifferenceEntry:50,priceDifferenceExit:70});
  expect(calculateVest({...s,brokerLots:'0.025'}).broker).toBeNull();
  expect(calculateVest({...s,brokerLots:'101'}).broker).toBeNull();
  expect(calculateVest({...s,usdcUsd:''}).broker).toBeNull();
 });
 it('preserves legacy state and normalizes the optional independent scenario', () => {
  const legacy=defaultState(); expect(normalizeState(structuredClone(legacy))).toEqual(legacy);
  const s=normalizeState({...legacy,vestStudy:{...scenario(),injected:'no',market:'invalid',side:'oops'}});
  expect(s.vestStudy!.market).toBe('NQ-PERP'); expect(s.vestStudy!.side).toBe('buy');
  expect(s.vestStudy).not.toHaveProperty('injected'); expect(s.log).toEqual([]);
  expect(normalizeVestDraft(null)).toEqual(newVestDraft());
  expect(normalizeState(JSON.parse(JSON.stringify({...legacy,vestStudy:scenario()}))).vestStudy).toEqual(scenario());
 });
});
