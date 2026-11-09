import {describe,it,expect} from 'vitest';
import {carteiraVazia, valorCompraRegistrada, importarCompras, mesclarCarteiras, normalizarCarteira, resumoCarteira, type LancamentoCarteira} from '@/lib/platform/carteira';
import {novaBanca, parseBancas, extrairForex} from '@/lib/platform/bancas';
import {defaultState, MESAS_FUTUROS} from '@/lib/platform/engine';
import {mesclarBackup} from '@/lib/platform/importar-backup';
const entry=(tipo:LancamentoCarteira['tipo'],valor:number,extra:Partial<LancamentoCarteira>={}):LancamentoCarteira=>({id:crypto.randomUUID(),tipo,valor,data:'2026-11-09',local:'Lucid',destino:'',descricao:'',externo:true,quantidade:1,...extra});
describe('carteira pessoal',()=>{
 it('apura investimento e resultado sem confundir aportes com patrimônio',()=>{
  const c=carteiraVazia();c.lancamentos=[entry('deposito',1400),entry('saque',2000),entry('compra',700,{quantidade:10})];c.saldos=[{id:'f',nome:'Forex',valor:300,data:'2026-11-09'}];
  expect(resumoCarteira(c)).toMatchObject({investido:2100,recebido:2000,saldo:300,resultado:200,compras:700,mesas:{Lucid:{quantidade:10,valor:700}}});
 });
 it('não duplica transfers, payouts em carteira ou despesas pagas com saldo já aportado',()=>{
  const c=carteiraVazia();c.lancamentos=[entry('deposito',1400),entry('transferencia',1000),entry('compra',100,{externo:false}),entry('payout',500,{externo:false}),entry('despesa',20,{externo:false})];
  c.saldos=[{id:'a',nome:'Forex',valor:400,data:'2026-11-09'},{id:'b',nome:'Cripto',valor:1380,data:'2026-11-09'}];
  expect(resumoCarteira(c)).toMatchObject({investido:1400,recebido:0,resultado:380,payouts:500});
  c.lancamentos.push(entry('payout',200),entry('despesa',10));expect(resumoCarteira(c).resultado).toBe(570);
 });
 it('importa somente valores pagos reais, preserva edições e não duplica compras nem ciclos',()=>{
  const b={...novaBanca('Conta 1'),mesa:'lucid' as const,taxaCompra:70}; b.state.counts.reprovadas=18;
  let c=importarCompras(carteiraVazia(),[b,novaBanca('Sem preço')],MESAS_FUTUROS);
  expect(c.lancamentos).toHaveLength(1);expect(c.lancamentos[0]?.valor).toBe(70);
  c.lancamentos[0]!.valor=69;c=importarCompras(c,[{...b,taxaCompra:99}],MESAS_FUTUROS);
  expect(c.lancamentos).toHaveLength(1);expect(c.lancamentos[0]?.valor).toBe(69);
  expect(importarCompras(c,[],MESAS_FUTUROS)).toEqual(c);
 });
 it('mantém carteira após recarregar e mescla backups sem duplicar fluxos ou saldos',()=>{
  const doc=parseBancas(null);doc.carteira={...carteiraVazia(),lancamentos:[entry('deposito',1400)],saldos:[{id:'saldo',nome:'Forex',valor:500,data:'2026-11-09'}]};
  const reload=parseBancas(JSON.stringify(doc));expect(reload.carteira).toEqual(doc.carteira);
  const backup=structuredClone(reload);backup.carteira!.saldos[0]!.valor=1000;backup.carteira!.lancamentos.push(entry('saque',200));
  const once=mesclarBackup(reload,backup).doc;const twice=mesclarBackup(once,backup).doc;
  expect(twice.carteira!.lancamentos).toHaveLength(2);expect(twice.carteira!.saldos[0]!.valor).toBe(500);expect(twice.bancas).toEqual(reload.bancas);
 });
 it('valida dados antigos e evita valores não finitos ou negativos',()=>{
  expect(normalizarCarteira(null)).toEqual(carteiraVazia());
  const c=normalizarCarteira({lancamentos:[entry('deposito',Infinity),entry('saque',-1),entry('compra',70)],saldos:[{id:'a',nome:'Teste',valor:-10,data:'2026-11-09'}]});
  expect(c.lancamentos).toHaveLength(1);expect(c.saldos).toHaveLength(0);expect(resumoCarteira(c).rentabilidade).toBe(-100);
 });
 it('retira a mesa descontinuada sem converter posições nem perder seu arquivo ou Forex',()=>{
  const b=novaBanca('Legada');b.state.forexSaldoReal=400;
  const legacy={...b,mesa:'vest',state:{...b.state,vestStudy:{quantity:'10'}}};
  const doc=parseBancas(JSON.stringify({bancasVersion:1,bancas:[legacy],activeId:b.id,mesaAtiva:'vest',activeIdsMesa:{vest:b.id},forex:extrairForex(b.state)}));
  expect(doc.bancas).toHaveLength(1);expect(doc.bancas[0]!.id).not.toBe(b.id);expect(doc.bancas[0]!.state.log).toEqual([]);
  expect(doc.mesaAtiva).toBe('tradefive');expect(doc.forex!.forexSaldoReal).toBe(400);expect(doc.contasArquivadas).toEqual([legacy]);
  expect(parseBancas(JSON.stringify(doc)).contasArquivadas).toEqual([legacy]);expect(MESAS_FUTUROS).not.toHaveProperty('vest');
 });
});

it('recupera preço do histórico antigo sem alterar contas e ignora parâmetros de simulação',()=>{
 const b=novaBanca('Antiga');
 b.state.assets.ouro.params.taxa=999;
 expect(valorCompraRegistrada(b)).toBeNull();
 b.state.log=[{taxaCobrada:115.5},{taxaCobrada:0}] as typeof b.state.log;
 const before=JSON.stringify(b);
 const c=importarCompras(carteiraVazia(),[b],MESAS_FUTUROS);
 expect(c.lancamentos[0]!.valor).toBe(115.5);
 expect(JSON.stringify(b)).toBe(before);
 expect(importarCompras(c,[b],MESAS_FUTUROS).lancamentos).toHaveLength(1);
 b.taxaCompra=109;expect(valorCompraRegistrada(b)).toBe(109);
 delete b.taxaCompra;
 b.state.log.push({taxaCobrada:132} as typeof b.state.log[number]);
 expect(valorCompraRegistrada(b)).toBeNull();
});

it('separa saques recebidos de dinheiro realmente levado ao bolso',()=>{
 const c=carteiraVazia();
 c.lancamentos=[entry('deposito',1400),entry('saque_forex',2000,{externo:false}),entry('payout',500,{externo:false})];
 c.saldos=[{id:'cripto',nome:'Cripto',valor:2500,data:'2026-11-09'}];
 expect(resumoCarteira(c)).toMatchObject({saquesForex:2000,payouts:500,recebido:0,resultado:1100});
 c.lancamentos.push(entry('saque',600));c.saldos[0]!.valor=1900;
 expect(resumoCarteira(c)).toMatchObject({recebido:600,resultado:1100});
 expect(normalizarCarteira(JSON.parse(JSON.stringify(c)))).toEqual(c);
});
it('saque direto ao bolso entra uma vez no resultado e preserva significado dos registros antigos',()=>{
 const c=carteiraVazia();c.lancamentos=[entry('deposito',1400),entry('saque_forex',2000),entry('payout',500),entry('saque',100)];
 expect(resumoCarteira(c)).toMatchObject({saquesForex:2000,payouts:500,recebido:2600,resultado:1200});
});
