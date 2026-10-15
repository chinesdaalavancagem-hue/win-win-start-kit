# Win-or-Win

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://win-win-start-kit.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e7afe98d-470f-42ee-a6a6-cbddcace342c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```


## Sincronização numérica Master

A identidade da conta Master é definida explicitamente no servidor pela variável de ambiente `MASTER_USER_ID`. O valor deve ser o UUID da conta de usuário autorizada no Supabase (Authentication → Users), e essa mesma conta precisa ter a role `admin`.

- Configure `MASTER_USER_ID` no ambiente **server-side** onde já ficam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
- Não use prefixo `VITE_` nem exponha esse identificador por variáveis de ambiente do cliente.
- Depois de definir a variável, faça novo deploy/reinício do servidor.
- Se a variável não estiver configurada, a API de sincronização falha de forma segura e não permite que o primeiro administrador que chegar se torne Master.
- Se houver uma configuração antiga na tabela `master_number_sync` cujo `admin_user_id` seja diferente do UUID configurado, a API interrompe a sincronização; a configuração deve ser revisada explicitamente no banco antes de liberar o recurso.

A Master publica somente os campos numéricos selecionados. Na conta comum, os valores são aplicados apenas à banca atualmente ativa. Depósitos, saques, saldos, taxas pessoais, gastos, totais, ciclos, logs e históricos não são publicados nem sobrescritos pela rotina de merge.

Para validar localmente, execute `npm test` e `npm run build`. A migração `drizzle/migrations/0013_master_number_sync.sql` precisa ser revisada e aplicada separadamente antes de habilitar o recurso em um ambiente real.
