# Destino de backup: Telegram (canal privado)

**Estado:** canal e bot informados pelo proprietario; permissao de administrador confirmada verbalmente. **Envio nao testado**, backup nao exportado nem agendado.

- Canal privado (chat_id): `-1003826563115`.
- A plataforma ja tem notificacoes Telegram em `src/lib/telegram.server.ts` via `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. **Nao reutilizar** `TELEGRAM_CHAT_ID` para o canal de backup, pois afeta os alertas existentes.
- Variaveis sugeridas, **apenas no cofre de segredos do servidor**: `BACKUP_TELEGRAM_BOT_TOKEN`, `BACKUP_TELEGRAM_CHAT_ID`.
- Nao gravar o token em GitHub, SQL, frontend, logs, metadados do backup ou mensagens de teste. O token anterior foi compartilhado em conversa: **revogar e substituir e recomendado** antes de habilitar qualquer envio.
- Canal privado nao torna os arquivos ponta-a-ponta criptografados. **Criptografar localmente antes do upload** usando ferramenta madura e autenticada (ex.: age com chave publica e chave privada mantida offline); nao enviar senha no Telegram.
- Exigir hash SHA-256 local do arquivo criptografado, checagem de tamanho/limite de upload, confirmacao da resposta da API e registro apenas de `message_id`, hash, nome neutro e instante, sem dados pessoais.
- Enviar exclusivamente arquivo cifrado. Nao usar endpoint publico de backup e nao enviar documentos `app_data` ou `auth.users` como mensagens.
- Backup funcional requer exportacao consistente do Postgres e exportacao dos **bytes** do Storage por canal administrativo seguro, destino transitorio protegido, teste de restauracao e copia redundante fora do Telegram.
- Este documento nao configura credenciais nem habilita automacao. A configuracao so sera considerada pronta apos **teste inocuo** no canal com arquivo ficticio cifrado e confirmacao de recebimento.

**Passos pendentes:** registrar os segredos em ambiente servidor, definir/guardar chave de cifra fora do Telegram, implementar a rotina administrativa com protecao e limites de execucao, validar a exportacao do Lovable Cloud, testar restauracao isolada e so entao agendar as copias.
