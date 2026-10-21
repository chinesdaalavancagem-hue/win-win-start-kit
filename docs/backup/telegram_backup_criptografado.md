# Win or Win — backup cifrado para canal privado do Telegram

## Estado de implantação

A rotina `scripts/backup_telegram.py` foi versionada na branch `main`.
**Ela não está agendada, não foi executada e ainda não existe comprovação de
cópia completa nem teste de restauração.** O teste anterior com mensagem no
Telegram confirmou apenas o bot e o chat, **não a exportação**.

Essa rotina é um **comando administrativo externo**, não um endpoint web ou
função na aplicação. Rode apenas em uma máquina/runner privado sob seu controle.
Os Secrets do Lovable Cloud **não são automaticamente disponibilizados** nessa
máquina: configure-os somente no cofre do ambiente executor.

## Pré-requisitos

- Python 3.11+ instalado, `pg_dump` compatível com a versão do PostgreSQL e
  [age](https://age-encryption.org/) instalados na máquina executora.
- Acesso de leitura/backup ao PostgreSQL de produção e credenciais administrativas
  para download autenticado de arquivos do Storage (Supabase).
- Destino Telegram: canal privado **`-1003826563115`** com bot administrador.
- **Par de chaves age criado fora do Telegram.** Exemplo local:
  `age-keygen -o win-or-win-backup-key.txt`. Guarde esse arquivo **offline**,
  com acesso restrito e segunda cópia segura; NÃO o envie ao chat, Telegram,
  GitHub ou Lovable. O comando mostra a **chave pública** `age1...`.
- Nunca usar token já exposto em chat como credencial de longo prazo; recomenda-se
  a revogação no BotFather.

## Variáveis de ambiente (somente na máquina privada)

| Nome | Origem |
|---|---|
| `PGHOST`, `PGPORT` (opcional), `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Credenciais de conexão **direta/administrativa** de leitura do PostgreSQL do Lovable Cloud, a obter em painel autorizado |
| `SUPABASE_URL` | URL HTTPS do mesmo projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Credencial **sensível**, acesso administrativo ao Storage |
| `BACKUP_TELEGRAM_BOT_TOKEN` | Segredo já cadastrado no Lovable (não expor) |
| `BACKUP_TELEGRAM_CHAT_ID` | `-1003826563115` |
| `BACKUP_AGE_RECIPIENT` | **Chave pública** `age1...`, nunca a privada |

A rotina falha sem essas variáveis ou sem `pg_dump` e `age`. Nao adicione
secrets em `.env` versionado, em linha de comando, mensagens ou logs.

## Execução

No executor privado, com as variáveis carregadas no ambiente:

```bash
python3 scripts/backup_telegram.py --check
python3 scripts/backup_telegram.py --run
```

O modo `--check` **não toca na rede**, apenas checa pré-requisitos locais.
O modo `--run` efetua:

1. `pg_dump` dos schemas `public`, `auth`, `storage`, em formato custom;
   streaming diretamente para `age`, sem gravar dump em texto claro.
2. Listagem e download dos objetos do bucket privado `downloads`, criando
   arquivo TAR diretamente cifrado com `age`, sem cópia local em texto claro.
3. Hash SHA-256 e tamanhos dos **dois arquivos cifrados** em manifesto JSON
   sem dados financeiros.
4. Envio ao canal privado dos dois arquivos `.age` e do manifesto.
5. Exclusão dos artefatos temporários cifrados após sucesso ou erro.

**Limites e cautelas:** a Telegram Bot API normalmente limita `sendDocument`
a 50 MB por envio; a rotina usa teto conservador de 49 MiB e aborta quando
excedido. Os envios são arquivos separados, não uma operação atômica; confira
os **três documentos no mesmo lote** antes de considerar o backup recebido.
O manifesto não comprova que houve uma captura consistente entre SQL e Storage
se eles mudaram enquanto a exportação era executada.

## Verificação e restauração

1. Baixe os dois arquivos criptografados e o manifesto para máquina **isolada**
   e controlada, nunca para um site ou pasta pública.
2. Compare SHA-256 dos dois arquivos com o manifesto, e seus tamanhos.
3. Descriptografe com a **chave privada offline** (`age -d -i
   win-or-win-backup-key.txt -o arquivo.dump arquivo.dump.age`) somente em
   área protegida e temporária.
4. No PostgreSQL de TESTE isolado, compatível com Supabase, restaure a partir
   do custom dump usando `pg_restore` e revise owner, grants, dependências
   externas, extensões, autenticação e Storage. **Nunca restaurar na produção
   automaticamente.**
5. Confira autenticação, RLS, bancas, histórico, saldos, fila de ordens, logs,
   bytes e paths dos objetos. Faça testes de restauração e registre o resultado.
6. Descarte cópias descriptografadas e credenciais temporárias com segurança.
   Não reutilize tokens de produção no ambiente isolado.

## O que impede declarar etapa concluída hoje

- Ainda não foi cadastrada uma **chave pública age** nem guardada a correspondente
  chave privada de recuperação offline.
- O acesso de `pg_dump` e as credenciais administrativas do Storage **não foram
  disponibilizados em um executor privado**; Secrets no Lovable não tornam isso
  automático.
- O script não foi validado contra dados reais ou contra um restore isolado.
- Falta agendamento com auditoria, rotação, retenção e uma cópia redundante fora
  do Telegram.

**Não usar essa rotina para exportar dados sem chave e ambiente de execução
seguros.**
