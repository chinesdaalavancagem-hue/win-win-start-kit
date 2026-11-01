# Etapa 3 — Contrato do executor VPS MT5 DEMO (sem ativacao automatica)

Em 01/11/2026, o relay em /api/public/topstep-vps/observacoes/ continua
**SOMENTE OBSERVACAO**; o campo `orders_enabled` permanece `false`.
Esta alteracao acrescenta ao schema um formato v3, sem executar ordens no
backend, sem mudar o contrato v1/v2 e sem efetuar deploy automatico.

## Motivacao

O v2 apresenta `bank_id` apenas no card e `practice_label` na posicao.
O label nao e identificador unico. Um executor deve recusar ordens sem
**source_account_id**, **bank_id**, simbolo e sessao coincidentes e recentes.

## Contrato v3 — exigencias para a futura extensao

Card v3: `kind: "card"`, `relay_version:3`, `bank_id`,
`source_account_id`, `session_id`, `client_seq`, `event_id` UUID,
`observed_at_ms`, `symbol` MGC/MNQ, `day`, `phase`,
`planned_contracts`, `card_lot`, `card_confirmed:true`.

Posicao v3: `kind:"position"`, `relay_version:3`,
`bank_id`, `source_account_id`, `practice_label` contendo Practice,
`net_contracts` (positivo/negativo/zero), `practice_visible:true`,
com metadados de sessao/seq/evento/data/simbolo equivalentes.

Os dois eventos devem ter a MESMA sessao, banca, conta de origem e ativo.
A posicao precisa ter sequencia posterior ao card e ser fresca.
**Silencio, desconexao, F5 e ausencia de snapshots NAO significam posicao zero.**
A fonte visual nao e confirmacao oficial de fill nem autoriza conta real.

## Executor Python

O codigo do executor e entregue em pacote separado para a VPS Windows com
MetaTrader5. Seu runtime chama `mt5.order_send` de verdade, somente apos:
1. um par v3 de card e posicao da conta/banca explicitamente vinculadas;
2. verificacao do login, servidor e `ACCOUNT_TRADE_MODE_DEMO` do terminal MT5;
3. interrupcao em envios incertos, duplicatas, dados vencidos, conta errada ou
   posicoes externas no mesmo simbolo;
4. confirmacao explicita no processo (`--arm-demo` e gate de ambiente).

O codificador da extensao v1.25.13 nao faz parte deste repositorio. Sem
adaptar a emissao para v3 (com ID confiavel da Practice), o executor permanece
bloqueado — nao deve ser forçado a consumir v2, nem usar snapshots antigos.

Nao usar em conta real. Nao instalar automaticamente nem publicar o relay
apenas para testar. Nenhuma migracao SQL necessaria: o JSON v3 continua cabendo
na coluna payload ja existente.
