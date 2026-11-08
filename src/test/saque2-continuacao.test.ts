import {describe,it,expect} from 'vitest';
import {defaultState, simularSaque2, computeAssetCalcs, normalizeState, calcCaixaCiclo, projetarPrimeiroPayout} from '../lib/platform/engine';
function setup() {
  const s=defaultState();
  const a=s.assets.ouro;
  a.mesaFuturos='lucid'; a.params.mll=1000; a.params.taxa=70;
  a.params.saqueAprovada=900; a.params.saqueDebitadoMesa=1000;
  a.days=[625,625,2000,200,200,200,200].map(meta=>({mnq:10,lotes:.21,meta}));
  s.assets.saque2.days=Array.from({length:5},()=>({mnq:2,lotes:.03,meta:200}));
  return s;
}
describe('Saque 2 continua a projeção do ciclo 1',()=>{
  it('herda o lucro financiado, desconta o saque bruto e cresce por dia',()=>{
    const s=setup(), antes=structuredClone(s), r=simularSaque2(s);
    expect(r.lucroMesa).toBe(2800);
    expect(r.retirada).toBe(1400); expect(r.primeiro.saque).toBe(1260); expect(r.limites).toEqual([1300,1500,1700,1900,2100]);
    expect(s).toEqual(antes);
    expect(computeAssetCalcs(s.assets.ouro,'ouro')[3]!.limiteDoCard).toBe(1900);
  });
  it('recalcula após mudar resultado do D1, meta, saque e ativo',()=>{
    const s=setup(); s.assets.ouro.attempt.resultadosMesaEod={'2':1800};
    expect(simularSaque2(s).limites[0]).toBe(1200);
    s.assets.ouro.days[3]!.meta=300;
    expect(simularSaque2(s).limites[0]).toBe(1250);
    s.assets.ouro.params.saqueDebitadoMesa=1200;
    expect(simularSaque2(s).limites[0]).toBe(1250);
    s.assets.saque2.params.ativoReal='nasdaq';
    s.assets.nasdaq=structuredClone(s.assets.ouro);
    s.assets.nasdaq.params.saqueDebitadoMesa=1000;
    s.assets.nasdaq.days.unshift({mnq:10,lotes:.21,meta:0});
    s.assets.nasdaq.attempt.resultadosMesaEod={'3':1800};
    expect(simularSaque2(s).limites[0]).toBe(1250);
  });
  it('carrega dinheiro e bônus sem conceder bônus de novo ou duplicar capital',()=>{
    const s=setup();s.assets.ouro.bonus.bonusCap=100;
    const r=simularSaque2(s,100), primeiro=r.primeiro, segundo=r.segundo;
    expect(segundo.dias[0]!.proprioAntes).toBeCloseTo(primeiro.proprioRecuperavel);
    expect(segundo.dias[0]!.bonusAntes).toBeCloseTo(primeiro.bonusRestante);
    expect(primeiro.bonusTotal+segundo.bonusTotal).toBeLessThanOrEqual(100.00001);
    expect(segundo.resultadoFinal).toBeCloseTo(segundo.saque-segundo.taxa-segundo.perdaPropriaTotal);
    expect(r.resultadoAcumulado).toBeCloseTo(primeiro.saque+segundo.saque-primeiro.taxa-segundo.taxa-primeiro.perdaPropriaTotal-segundo.perdaPropriaTotal);
  });
  it('preserva limites manuais e não soma avaliação ao lucro financiado',()=>{
    const s=setup();s.assets.saque2.days[0]!.mll=500;
    s.assets.ouro.days[0]!.meta=20000;
    expect(simularSaque2(s).calcs[0]!.limiteDoCard).toBe(500);
    expect(simularSaque2(s).lucroMesa).toBe(2800);
  });
  it('piso não desce ao perder; prejuízo grande deixa folga zero',()=>{
    const s=setup();s.assets.ouro.attempt.resultadosMesaEod={'3':-500};
    expect(simularSaque2(s).limites[0]).toBe(950);
    s.assets.ouro.attempt.resultadosMesaEod={'2':-3000};
    expect(simularSaque2(s).limites[0]).toBe(0);
  });
  it('ignora valores manuais antigos na projeção e separa bruto de líquido',()=>{
    const s=setup();const a=simularSaque2(s);
    s.assets.ouro.params.saqueAprovada=800;const b=simularSaque2(s);
    expect(b.limites).toEqual(a.limites);
    expect(b.resultadoAcumulado).toBeCloseTo(a.resultadoAcumulado);
    expect(b.retirada).toBe(1400); expect(b.primeiro.saque).toBe(1260);
  });
  it('aceita backups sem novo campo e não altera o caixa do ciclo 1',()=>{
    const s=setup();delete s.assets.ouro.params.saqueDebitadoMesa;
    const n=normalizeState(JSON.parse(JSON.stringify(s)));
    expect(simularSaque2(n).retirada).toBe(1400);
    expect(simularSaque2(n).primeiro).toEqual(calcCaixaCiclo(n.assets.ouro,'ouro',100));
  });
  it('abate o primeiro payout das perdas próprias e da taxa, sem cobrar o bônus perdido',()=>{
    const s=setup(); const base=simularSaque2(s,100).primeiro;
    expect(base.perdaBonusTotal).toBeGreaterThan(0);
    const recebimento=projetarPrimeiroPayout(s.assets.ouro,'ouro').liquido;
    for (const sobra of [-100,0,100]) {
      s.assets.ouro.params.taxa=recebimento-base.perdaPropriaTotal-sobra;
      const r=simularSaque2(s,100), d1=r.calcs[0]!;
      expect(r.primeiro.resultadoFinal).toBeCloseTo(sobra);
      expect(d1.dividaHoje).toBeCloseTo(Math.max(0,-sobra));
      expect(d1.liquidoSeReprovar).toBeCloseTo(d1.reprova-Math.max(0,-sobra));
    }
  });
  it('percentual de bônus recalcula o custo próprio herdado',()=>{
    const s=setup(); const sem=simularSaque2(s,0), com=simularSaque2(s,100);
    expect(com.calcs[0]!.liquidoSeReprovar-sem.calcs[0]!.liquidoSeReprovar)
      .toBeCloseTo(sem.primeiro.perdaPropriaTotal-com.primeiro.perdaPropriaTotal);
  });

  it('Meta geral e ciclo 2 usam exatamente os mesmos cinco dias e percentuais',()=>{
    const s=setup();
    expect(projetarPrimeiroPayout(s.assets.ouro,'ouro')).toEqual({lucro:2800,bruto:1400,liquido:1260});
    s.assets.ouro.days[2]!.meta=2200;
    const p=projetarPrimeiroPayout(s.assets.ouro,'ouro'), r=simularSaque2(s);
    expect(p).toEqual({lucro:3000,bruto:1500,liquido:1350});
    expect(r.retirada).toBe(p.bruto);expect(r.primeiro.saque).toBe(p.liquido);
    expect(r.calcs[0]!.dividaHoje).toBeCloseTo(Math.max(0,r.primeiro.taxa+r.primeiro.perdaPropriaTotal-1350));
  });

  it('Lucid respeita teto de US$ 2.000 no primeiro saque e carrega a sobra ao segundo ciclo',()=>{
    const s=setup();
    s.assets.ouro.days[2]!.meta=4200; // 625+625+4200+200+200 = 5.850
    const payout=projetarPrimeiroPayout(s.assets.ouro,'ouro');
    expect(payout).toEqual({lucro:5000,bruto:2000,liquido:1800});
    const r=simularSaque2(s);
    expect(r.retirada).toBe(2000);
    expect(r.limites).toEqual([2900,3100,3300,3500,3700]);
    expect(r.lucroSegundoCiclo).toBe(1000);
    expect(r.baseSaque2).toBe(4000);
    expect(r.saque2Bruto).toBe(2000);
    expect(r.saque2Liquido).toBe(1800);
    expect(r.segundo.saque).toBe(1800);
  });

  it('Lucid calcula 50% quando abaixo do teto no segundo pedido',()=>{
    const s=setup(), r=simularSaque2(s);
    expect(r.lucroMesa).toBe(2800);
    expect(r.retirada).toBe(1400);
    expect(r.baseSaque2).toBe(2400);
    expect(r.saque2Bruto).toBe(1200);
    expect(r.saque2Liquido).toBe(1080);
    expect(r.segundo.saque).toBe(1080);
  });

  it('teto da Lucid não afeta o payout de outra mesa',()=>{
    const s=setup();
    s.assets.ouro.days[2]!.meta=4200;
    s.assets.ouro.mesaFuturos='mff';
    expect(projetarPrimeiroPayout(s.assets.ouro,'ouro')).toEqual({lucro:5000,bruto:2500,liquido:2250});
  });

  it('não transporta os US$ 500 de lucro do saque 1 como crédito no saque 2',()=>{
    const s=setup();
    s.assets.ouro.params.taxa=0;
    s.assets.ouro.days.forEach(d=>{d.lotes=0;});
    const entrada=simularSaque2(s).primeiro;
    const saque=projetarPrimeiroPayout(s.assets.ouro,'ouro').liquido;
    s.assets.ouro.params.taxa=saque-500;
    const r=simularSaque2(s);
    expect(r.primeiro.resultadoFinal).toBeCloseTo(500);
    expect(r.calcs[0]!.dividaHoje).toBeCloseTo(0);
    expect(r.calcs[0]!.liquidoSeReprovar).toBeCloseTo(r.calcs[0]!.reprova);
  });

  it('transporta somente o déficit do primeiro saque para o ciclo 2',()=>{
    const s=setup();
    s.assets.ouro.days.forEach(d=>{d.lotes=0;});
    const saque=projetarPrimeiroPayout(s.assets.ouro,'ouro').liquido;
    s.assets.ouro.params.taxa=saque+300;
    const r=simularSaque2(s);
    expect(r.primeiro.resultadoFinal).toBeCloseTo(-300);
    expect(r.calcs[0]!.dividaHoje).toBeCloseTo(300);
  });

});
