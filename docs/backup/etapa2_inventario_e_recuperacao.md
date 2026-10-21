# Win or Win Platform — Etapa 2: inventário e procedimento de backup

> **Situação em 2026-10-21:** inventário de produção concluído mediante consultas somente-leitura. O **backup integral dos dados NÃO foi executado**, pois ainda falta definir um destino privado e criptografado e validar uma forma segura de exportação da infraestrutura Lovable Cloud. Nenhum dado pessoal, saldo individual, token ou registro de operação foi exportado para este repositório.

## Origem e escopo

- Projeto Lovable Cloud: `e7afe98d-470f-42ee-a6a6-cbddcace342c`.
- Banco: PostgreSQL gerenciado via Supabase (confirmado por `get_database_status`).
- Fonte dos números abaixo: `SELECT count(*)` de cada tabela `public` e agregação de metadados de `storage.buckets`/`storage.objects`.
- Snapshot estrutural separado: [`docs/sql/schema_snapshot_reference.sql`](../sql/schema_snapshot_reference.sql).
- Consultas realizadas sem `INSERT`, `UPDATE`, `DELETE`, DDL, migrações ou deploy.
- Os totais são uma fotografia pontual, **não** uma transação consistente entre tabelas.

## Inventário de dados da produção

| Tabela | Linhas conferidas | Sensibilidade / uso |
|---|---:|---|
| `activity_logs` | 5.089 | Registros de atividade e auditoria |
| `ai_analysis_daily_usage` | 6 | Consumo de análises por usuário |
| `app_data` | 5 | Documentos financeiros e histórico de bancas |
| `audit_logs` | 7.562 | Auditoria e eventos de segurança |
| `integration_tokens` | 2 | **Segredos de integração — não versionar** |
| `master_number_sync` | 1 | Configurações e valores administrativos |
| `order_queue` | 291 | Fila e histórico de ordens |
| `profiles` | 5 | Perfis de usuários |
| `prop_firms` | 0 | Configurações de mesas |
| `push_subscriptions` | 1 | Credenciais e endpoints Web Push |
| `terms_acceptances` | 4 | Evidências de aceite |
| `trusted_device_settings` | 1 | Configurações de dispositivos |
| `trusted_devices` | 86 | Identificadores/credenciais de dispositivo |
| `user_roles` | 1 | Controle de acesso |

O banco `public` não é autossuficiente para recuperação: a autenticação e as relações com `auth.users` e os metadados do `storage` também dependem dos schemas gerenciados pelo Supabase.

**Storage:** bucket `downloads`, **privado**, 3 objetos e aproximadamente **73.615 bytes** segundo seus metadados. Os bytes dos arquivos **não foram copiados**.

## Requisitos para um backup restaurável

1. Obter acesso a um processo oficial de **exportação/backup de PostgreSQL** no Lovable Cloud/Supabase que produza uma cópia transacionalmente consistente. Não disparar comandos com efeitos colaterais na produção.
2. Definir um **destino externo privado e criptografado**, com chaves de recuperação fora do GitHub e proteção contra exclusão acidental. Nunca armazenar dados reais em `docs/`, em commits ou no frontend publicado.
3. Exportar os dados e a estrutura de `public`, as dependências indispensáveis de `auth` e os metadados de `storage` com uma ferramenta compatível com o provedor. A restauração de `auth` requer procedimento específico do provedor; não presumir que inserir diretamente em `auth.users` seja seguro.
4. Baixar os **3 objetos** de `downloads` por um meio autenticado, verificar contagem, caminhos, tamanhos e checksums. Os metadados do banco não substituem os bytes.
5. Preservar consistência entre `app_data`, `order_queue`, `profiles`, `user_roles`, `integration_tokens` e demais tabelas; idealmente gerar o conjunto em um ponto de recuperação comum, ou registrar tempos precisos e o intervalo de divergência.
6. Salvar manifesto contendo data UTC, ferramenta/versão, IDs do projeto, tabelas, totais, nomes/tamanhos/hash SHA-256 dos arquivos e método de criptografia — **sem segredos e sem dados pessoais**.
7. Testar recuperação em **ambiente isolado**, jamais sobre a produção. Verificar integridade referencial, políticas RLS, aceites, anexos, cálculos financeiros, autenticação, ordens e permissões. Nunca copiar tokens de produção ativos para um ambiente público; substituir/revogar credenciais sensíveis durante o teste.
8. Registrar o resultado do ensaio, limites de recuperação (RPO/RTO) e procedimento para futuras cópias periódicas.

## Como operar sem expor informações

- **Não** usar `Lovable.query_database` para transmitir linha a linha credenciais, dados de usuário, saldos ou histórico ao GitHub.
- **Não** criar endpoint de backup acessível pela aplicação; **não** publicar dumps em URLs, pastas `public/`, Storage público, commits, issues ou logs.
- **Não** substituir `docs/sql/schema_snapshot_reference.sql` por dados brutos de produção. Ele é apenas uma referência estrutural não executável.
- Usar acesso **restrito**, backup criptografado em repouso e em trânsito, retenção definida, verificação de restauração e revogação de acesso após o processo.
- Não fazer alterações na produção para facilitar extração sem necessidade e autorização separada.

## Checklist de aceitação da Etapa 2

- [x] Confirmado o banco de produção e o provedor.
- [x] Conferidas as 14 tabelas e suas contagens naquele instante.
- [x] Conferidos o bucket privado, a quantidade de arquivos e os metadados de tamanho.
- [x] Documentados riscos, ordem de verificação e limites do snapshot da Etapa 1.
- [ ] Definido destino privado e criptografado para o backup real.
- [ ] Exportação integral e consistente concluída por canal apropriado.
- [ ] Arquivos físicos do Storage recuperados e verificados.
- [ ] Integridade e hashes do backup confirmados.
- [ ] Teste de restauração isolada aprovado.

**Conclusão:** o inventário foi concluído; o **backup restaurável da Etapa 2 permanece pendente**. A autorização para inspeção não torna seguro publicar dados pessoais ou segredos no controle de versões.
