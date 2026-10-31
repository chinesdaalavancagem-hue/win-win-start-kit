# TopstepX -> VPS: Etapa 1 (somente observacao)

PR em rascunho: NAO PUBLICAR nem aplicar SQL sem revisao.

## Componentes
- Tela `/integracao`: chave **nova e exclusiva VPS**, renovavel/revogavel, validade 90 dias.
- `/api/public/topstep-vps/observacoes/`: POST da extensao e GET do monitor VPS.
- `topstep_vps_tokens`: hashes da chave VPS, separados de `integration_tokens`.
- `topstep_vps_observations`: eventos visuais, por usuario; RLS sem policies; backend service role.
- Extensao v1.25.9: modo LOCAL intacto ou VPS OBSERVACAO (sem ordens).
- `monitor_vps_somente_leitura.py`: consulta HTTPS e imprime apenas estados recentes. Nao importa MT5.

## Ativacao segura (NAO executada)
1. Revisar CI, schemas, autenticacao, limites, retencao e logs.
2. Aplicar `001_topstep_vps_observations.sql` em homologacao, validar ownership/RLS.
3. Fazer testes de POST/GET com usuarios diferentes e tokens expirados/revogados.
4. Somente apos homologacao, avaliar migração/publicacao; não fazer deploy automatico.
5. Gerar chave VPS pela tela Integracao depois de publicado, sem reutilizar chave Tradovate.
6. Configurar modo VPS observacao no Chrome com as posicoes zeradas e Python local parado.
7. Executar monitor read-only na VPS; verificar recebido/atrasos sem operar.

## Travas
- Nenhum codigo desta PR interage com `order_queue` ou `MetaTrader5`.
- Mensagens antigas (>15s) descartadas; event_id unico por usuario.
- Sem cookie, ID real da conta, ordens, ticket ou preco no payload.
- A extensao ignora status de conta nao-Practice e nao publica eventos arbitrarios.
- O monitor VPS descarta mensagens fora de sequencia ou velhas, sem backlog.
- F5/reconexao nao deve reproduzir evento antigo como ordem.
- **Silencio/perda de rede nunca significa que posicao foi fechada**.
- Proximas etapas (nao implementadas): identidade/autoridade, reconciliacao, latencia, alertas, MT5 DEMO remoto.
