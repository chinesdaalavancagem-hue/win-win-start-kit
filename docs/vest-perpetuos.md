# Vest: estudo de dimensionamento e simulador

Verificação: 05/11/2026. Acesso: menu esquerdo → Vest · Perpétuos.

## Especificações e fontes

- [Contratos](https://docs.vestmarkets.com/platform/perpetual-contract-specifications): perpétuos lineares com liquidação em USDC. Mid price é usado no P&L aberto; mark price, na liquidação. Cotação pode divergir do index e do CFD. O GC segue futuro com rolagem interna, não necessariamente a cotação spot GOLD do broker.
- [Unidades e margem](https://docs.vestmarkets.com/trading/cross-margin-and-leverage): 2 unidades NQ têm a exposição bruta de 1 MNQ; 1 unidade representa 1 USDC por ponto. Limites regulares documentados NQ 50x / GC 25x. Margem inicial estimada = quantidade × index ÷ alavancagem. Alterar alavancagem sem alterar quantidade não altera P&L.
- [CME Micro Gold](https://www.cmegroup.com/education/lessons/micro-gold-and-micro-silver-futures-product-overview): 1 MGC representa 10 onças. Inferência de equivalência bruta com o contrato linear GC da Vest: 10 unidades GC por MGC. Não equivale a igualdade de preços, regras ou execução.
- [Taxas e horários](https://docs.vestmarkets.com/trading/markets): índices e commodities têm maker 0% e taker 0,0025% por execução. Ouro/índices bloqueiam negociação entre sexta 17h e domingo 18h de Nova York. API de negociação indisponível nas contas do programa.
- [Funding](https://docs.vestmarkets.com/trading/funding-mechanism): liquidação horária, sobre nocional ao index. Taxa positiva: long paga; negativa: short paga. A taxa muda. Juro-base zero nos futuros CME não significa funding zero.
- [TLL](https://docs.vestmarkets.com/trading/temporary-leverage-limits-tll): sexta 16h de Nova York até reabertura, NQ 5x e GC 3x; posições podem ser reduzidas/fechadas conforme exposição e saldo. Simulador compara a margem reduzida, não reproduz o motor TLL.
- [Limites](https://docs.vestmarkets.com/vest-capital/loss-limits): piso geral fixo. DLL opcional conforme contrato, com piso diário calculado do saldo no reset de 20h de Nova York, excluindo P&L aberto, incluindo colateral reservado, e ajustado pelas transferências. Ultrapassar para baixo qualquer piso encerra a conta; igualdade não é breach.
- [Planos](https://docs.vestmarkets.com/vest-capital/account-tiers): avaliação 5K/10K/25K documenta 6% fixo. Instant 500 documenta 2%; 5K/10K/25K, 4%. O anúncio de 50K não basta para extrapolar regras. Capital, DLL e percentual de drawdown são preenchidos do contrato pelo usuário.
- [Saques](https://docs.vestmarkets.com/vest-capital/claiming-profit): claim transfere para a Primary; saque para carteira é outra etapa. P&L do simulador não significa payout aprovado nem inclui divisão do lucro, taxa de compra ou saque.

## Matemática implementada

Para uma única posição, `s=+1` compra, `s=-1` venda, quantidade `q`, entrada `p`, saída `x`:

- Bruto Vest: `s*q*(x-p)`.
- Taxas: `q*p*taxaEntrada + q*x*taxaSaida`, taxas em fração.
- Funding debitado: `s*q*index*taxaHoraria*numeroLiquidacoes`. Valor negativo é crédito. Hipótese explícita de taxa/index/quantidade constantes.
- Líquido: bruto − taxas − funding − outros custos.
- Piso geral: `capitalInicial*(1-drawdown)`.
- Piso diário: `saldoReset*(1-DLL)+transferenciasLiquidas`.
- Folga: `max(0,equityAntes-max(pisos))`.
- Preço no piso: resolver o líquido igual a `-folga`, incluindo a taxa de saída variável com o preço. Ticks adversos usam o primeiro incremento além do piso, não o arredondamento para o mais próximo. Não é preço de liquidação nem garante execução.
- MT5 inverso: `-s*lotes*USDporPontoPorLote*(saidaMT5-entradaMT5)-custosMT5`.
- Soma: `liquidoVest*cotacaoUSDCUSD + liquidoMT5`. Não presume paridade USDC/USD nem movimento idêntico entre mercados.

## Limitações explícitas

Não foi possível confirmar tick e passo de quantidade atuais por metadata pública: o endpoint documentado `/v2/exchangeInfo` em `serverprod.vest.exchange` respondeu erro 1016. Não se reutiliza o tick CME como se fosse uma confirmação Vest. O usuário informa ambos; sem tick, resultados ficam em pontos, sem número inventado de ticks. Incrementos incompatíveis são rejeitados, sem arredondar a ordem para cima.

Especificações MT5 dependem do broker e conta: USD por ponto por lote, lote mínimo/máximo e passo são obrigatórios para a comparação. Modelo apenas linear em conta USD. Cotações são inseridas manualmente, não há preço ao vivo, ordens, autorização de hedge ou integração Python/Chrome para Vest.

O piso modela uma conta sem outras posições, antes da nova operação. A comparação da equity final não verifica perdas intermediárias. Margem de manutenção, mark price, deslizamento real e TLL exigem conferência na própria Vest.

## Persistência e testes

`State.vestStudy` é opcional e normalizado ao carregar backups. Cenário por conta, editado via salvamento já existente, sem alterar logs, resultado realizado ou saldo Forex. Não há migração SQL.

Testes verificam custos nas duas pontas, sinais de funding, mudança de alavancagem sem mudança de P&L, grids, DLL e transferências, cruzamento estrito do piso, USDC/USD, cotações independentes e volume MT5. Testes React verificam entrada em português, navegação pelo histórico, preservação dos saldos e envio do estudo ao salvamento.
