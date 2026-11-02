# Win or Win — Robô VPS novo (v2.0.0, MT5 DEMO)

Pacote independente, escrito do zero. Não usa código da v1.25.x. Não altera o site, a extensão Chrome nem o banco.

## Fluxo
```text
TopstepX -> extensão Chrome (3 confirmações, sem mudanças) -> relay Win or Win (GET v4)
        -> este robô na VPS -> MT5 (somente conta DEMO)
```

## Instalação no Windows da VPS
1. Instale Python 3.10+ (64 bits) com "Add to PATH".
2. Copie esta pasta para a VPS (ex.: `C:\WinOrWin_VPS_Novo`).
3. Copie `env.example` para `.env` e ajuste `MT5_TERMINAL` e `MAPA_SIMBOLOS`. A chave `WOW_VPS_TOKEN` pode ficar vazia e ser digitada na hora.
4. No MT5: entre na conta **DEMO** e ligue **Algo Trading**.
5. Dê dois cliques em `DIAGNOSTICO_DEMO.cmd`. O resultado fica em `dados\diagnostico_ultimo.txt` (sem a chave).
6. Com o diagnóstico aprovado, dê dois cliques em `INICIAR_TESTE_DEMO.cmd`. O robô começa em **SOMENTE LEITURA**; só envia ordens depois de você digitar `SIM-DEMO`.

## O que o diagnóstico informa
HTTP/HTTPS, chave recusada (401), 0 eventos nos últimos 120 s, ids e ordem, cursor, formato (`relay_version`, `mode`, `orders_enabled`), diferença de relógio pelo cabeçalho `Date`, contas/ativos/bancas/sessões vistas, motivo de cada evento descartado, pares card→position e suas idades, conta MT5 DEMO, Algo Trading, símbolos e posições abertas. A chave aparece só como os 8 últimos dígitos do SHA-256.

## Regras de operação
- TopstepX BUY → MT5 SELL; TopstepX SELL → MT5 BUY.
- Entrada (net 0 → ≠0) abre o **lote integral do card** (ex.: 0,34 com 1 contrato).
- Aumentos não multiplicam. Parciais reduzem proporcionalmente ao pico de contratos, sempre arredondando para baixo.
- Inversão: fecha, confirma zerado no MT5 e só então abre o lado oposto.
- `net = 0` da **mesma conta TopstepX + ativo** fecha o hedge, mesmo se você trocou de banca. `net = 0` de outra conta não fecha nada.
- Nova entrada é bloqueada se já existe posição no símbolo MT5 ou outra conta ativa nele. Fechamento nunca é bloqueado por isso.
- Fechou manualmente no MT5? Nada reabre até a TopstepX voltar a zero.
- Heartbeat, replay, evento antigo/futuro, símbolo sem mapa, net inválido, MT5 sem leitura: sem ação.
- Posição já aberta na TopstepX quando o robô inicia: não entra (espera zerar).
- Falha de abertura não é repetida. Falha de redução é repetida até o volume correto (só reduz).
- Se a conta de origem deixar de ser lida por 15 s com hedge aberto: alerta `ALERTA_CONTA_ORIGEM_NAO_MONITORADA` (a extensão não lê contas ocultas; volte para a conta na TopstepX).
- Conta MT5 que não seja DEMO é bloqueada sempre, conferida antes de cada ordem.
- Relógio com diferença acima de 5 s ou chave recusada: volta para SOMENTE LEITURA.

## Arquivos
- `winorwin_vps/config.py` — configuração (.env), sem segredos no código
- `winorwin_vps/relay.py` — GET HTTPS do relay, validação de formato, relógio
- `winorwin_vps/validacao.py` — normalização dos eventos e pares
- `winorwin_vps/motor.py` — decisões de entrada/parcial/inversão/fechamento
- `winorwin_vps/estado.py` — estado persistente com gravação atômica e idempotência
- `winorwin_vps/mt5_adapter.py` — MetaTrader5 com trava DEMO
- `winorwin_vps/executor.py` — laço de leitura, cursor e reconciliação
- `winorwin_vps/diagnostico.py`, `diagnostico_v4.py` — diagnóstico somente leitura
- `iniciar_executor.py`, `INICIAR_TESTE_DEMO.cmd`, `DIAGNOSTICO_DEMO.cmd`
- `tests/test_robo.py` — testes offline (MT5 e relay simulados)
- `empacotar.py`, `EMPACOTAR.cmd` — gera `dist\WinOrWin_VPS_Novo.zip` sem `.env`, `dados` e `.venv`

## Testes
`python tests\test_robo.py`

## Limites
Os testes usam MT5 simulado. A conexão real com o MT5 e o comportamento da corretora (preenchimento, lote mínimo) só são comprovados no seu Windows em conta DEMO.
