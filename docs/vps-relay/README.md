# TopstepX ↔ WinOrWin ↔ VPS — ETAPA 1 (SOMENTE OBSERVAÇÃO)

PR #33 em rascunho. Não fazer merge/publicação sem validar o canal em modo de observação.

## Estado confirmado em 30–31/10/2026

- Prévia do Lovable exibiu área **Conexão VPS — chave de observação**.
- A geração da chave foi confirmada pelo usuário e pelo banco: **1 chave VPS ativa**, separada da chave da Tradovate.
- As tabelas `topstep_vps_tokens` e `topstep_vps_observations` foram criadas **diretamente no banco Lovable Cloud**. RLS habilitado, permissões para usuários diretos bloqueadas, permissões do service role conferidas.
- A API publicada em `win-or-win.lovable.app` **não foi ativada/verificada**. Não apontar o primeiro teste para o domínio publicado.
- A branch e PR permanecem separadas de `main`, sem merge.
- Os arquivos ZIP externos da extensão e do monitor Python **não estão incorporados neste repositório**.

## Teste recomendado sem publicação

Foi preparado um pacote local **v1.25.10 TESTE PRÉVIA**, baseado na extensão v1.25.9:

- Opções da extensão: **Local** ou **VPS somente observação**, destino **Prévia** ou **Publicado**.
- Destino de teste: `https://id-preview--e7afe98d-470f-42ee-a6a6-cbddcace342c.lovable.app/api/public/topstep-vps/observacoes/`.
- Botão **Testar conexão HTTPS** faz GET autenticado e só confirma sucesso se `orders_enabled=false` e `mode=OBSERVACAO_SEM_ORDENS`.
- A extensão só publica leituras visuais confirmadas da TopstepX Practice e card da WinOrWin. Não publica preços, tickets, contas, tokens da TopstepX nem ordens.
- O monitor Windows consulta via HTTPS com a mesma chave, em modo *somente leitura*. Nunca importa `MetaTrader5`.
- Chave exclusiva com prefixo `wowvps_`; não compartilhar em chat/prints. Chrome storage local restrito aos contextos de confiança.
- No computador pessoal, desativar só a extensão TopstepX antiga e manter a Tradovate intacta. Parar Python local e zerar posições antes de trocar modo.

## Condições para uma fase futura com ordens MT5 DEMO

1. Validar autorização, isolamento por usuário, CORS, replay, eventos expirados e reconexão sob atraso com dados fictícios.
2. Planejar rotina de retenção curta para `topstep_vps_observations` (a fila atualmente não se limpa automaticamente).
3. Testar a comunicação entre Chrome e monitor no Windows com nenhuma ordem habilitada.
4. Confirmar reconciliação da posição *líquida*, lote integral do card e fechamento proporcional, sem inversões inesperadas.
5. Exigir bloqueio em divergência/perda de observação. **Ausência de eventos não é fechamento de posição.**
6. Testar somente com MT5 DEMO e TopstepX Practice, e só então avaliar eventual publicação do canal.

## Arquivos deste ramo

- `src/components/platform/VpsObservationKeyPanel.tsx`: geração/revogação.
- `src/lib/vps-relay.functions.ts`: chave exclusiva, hash e expiração.
- `src/lib/vps-relay-auth.server.ts`: autenticação da chave exclusiva.
- `src/routes/api/public/topstep-vps/observacoes/index.ts`: POST/GET apenas de observações.
- `docs/vps-relay/001_topstep_vps_observations.sql`: esquema DDL idempotente para referência (as duas tabelas já foram criadas no Lovable Cloud).

**Não criar uma segunda instância da integração Tradovate na TopstepX. Não publicar automaticamente.**
