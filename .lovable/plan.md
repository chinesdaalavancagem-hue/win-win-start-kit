# Diagnóstico (somente leitura): "Par v4 recente e ordenado: NÃO CONFIRMADO"

Nada foi editado, publicado ou alterado no banco.

## Evidências no servidor (lidas no código)

Arquivo: `src/routes/api/public/topstep-vps/observacoes/index.ts`

- Chave: `Authorization: Bearer wowvps_...`, conferida por hash em `topstep_vps_tokens` (não revogada, não expirada) e usuário aprovado (`src/lib/vps-relay-auth.server.ts`). Falha → 401; erro interno → 500.
- POST rejeita observação com idade fora de -5 s a +15 s (409 `stale_observation`), pelo relógio do servidor.
- GET:
  - filtra `user_id` = dono da chave **wowvps** usada na VPS;
  - só registros com `received_at` nos últimos **120 s**;
  - `after=0`: as **30 mais recentes**, devolvidas em ordem crescente;
  - `after>0`: `id > after`, ordem crescente, **limite 30** (as mais antigas da janela, não as mais novas);
  - resposta: `{ ok, relay_version: 4, mode, events[], next_cursor, orders_enabled:false }`;
  - cada evento: `id, event_id, session_id, client_seq, kind, observed_at_ms, payload, received_at`. Os campos `bank_id`, `source_account_id`, ativo, `card_confirmed`, `card_lot`, `planned_contracts`, `net_contracts` ficam **dentro de `payload`**, não no nível do evento.

## Limitação

Não tenho o `diagnostico_v4.py` neste ambiente (não está nos arquivos enviados acessíveis agora). Não vou supor como ele lê a resposta. As hipóteses abaixo dependem dele e precisam ser confirmadas pelo teste.

## Hipóteses testáveis

1. **Chave de outro usuário** (autenticação): a VPS usa uma chave wowvps de conta diferente da que a extensão usa. Resposta 200 com `events: []`. Sinal: lista vazia enquanto o banco tem pares.
2. **Cursor atrasado** (cursor/polling): com `after>0` o servidor devolve as 30 mais antigas da janela. Se chegam mais de 30 eventos por ciclo, o diagnóstico vê sempre eventos velhos e nunca o par mais novo. Sinal: `events[0].id` bem menor que o maior id do banco.
3. **Campo procurado no lugar errado** (formato): se o script lê `bank_id`/`net_contracts` no topo do evento em vez de `payload`. Sinal: eventos presentes, mas campos "faltando".
4. **Relógio da VPS** (relógio): se a "idade" é calculada com o relógio do Windows contra `observed_at_ms`, alguns segundos de diferença derrubam a checagem. Sinal: idade negativa ou acima do limite.
5. **Endereço errado** (endpoint): sem a barra final, prévia em vez do site publicado, ou vice-versa. Sinal: 404/HTML/redirecionamento em vez de JSON.
6. **Versão/modo esperado** (retorno): script exige outro `relay_version` ou `mode`. Sinal: JSON correto mas rejeitado.

## Próximo passo único: teste somente leitura na VPS

Um script curto, rodado no CMD da VPS, que faz **apenas GET** com a mesma chave e endereço do executor e grava um arquivo sanitizado com:
- endereço usado (sem chave), código HTTP, tipo de conteúdo;
- `relay_version`, `mode`, `next_cursor`, quantidade de eventos;
- dos 4 últimos eventos: `id, kind, client_seq, session_id`, chaves presentes em `payload`, `bank_id`, `source_account_id`, ativo, `card_confirmed`, `net_contracts`, idade calculada com o relógio da VPS;
- hora UTC da VPS e o cabeçalho `Date` do servidor (diferença de relógio);
- os últimos 8 caracteres do hash SHA-256 da chave (nunca a chave), para comparar com a conta da extensão.

Duas chamadas: `after=0` e `after=<cursor que o diagnóstico usa>`. Junto, enviar o `diagnostico_v4.py` atual para eu comparar a regra exata.

## Preservado em qualquer correção futura

Lote do card, leitores originais e 3 confirmações, antirreentrada, parciais, fechamento do hedge após troca de banca, isolamento por conta/ativo, somente DEMO. Nenhuma trava de segurança é afrouxada; a correção só virá após a causa confirmada.

## Detalhe técnico (se a hipótese 2 se confirmar)

Correção mínima candidata, só após revisão: no GET com `after>0`, quando houver mais de 30 eventos, devolver as mais recentes (ou o diagnóstico usar `after=0`). Não aplicar antes do teste.
