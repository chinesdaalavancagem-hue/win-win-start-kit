-- ETAPA 1: canal TopstepX -> WinOrWin -> VPS (SOMENTE OBSERVACAO).
-- NAO EXECUTAR automaticamente. Revisar no ambiente de homologacao antes de aplicar.
create table if not exists public.topstep_vps_observations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  session_id text not null check (length(session_id) between 8 and 80),
  client_seq integer not null check (client_seq >= 0),
  kind text not null check (kind in ('position', 'card')),
  observed_at_ms bigint not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  constraint topstep_vps_observations_idempotency unique (user_id, event_id),
  constraint topstep_vps_observations_payload_size check (octet_length(payload::text) <= 2048)
);
create index if not exists topstep_vps_observations_user_id_idx
  on public.topstep_vps_observations (user_id, id desc);
alter table public.topstep_vps_observations enable row level security;
-- Nenhuma policy libera a tabela a clientes. Somente o backend com service role
-- valida a chave e consulta/grava registros do proprio usuario.
create index if not exists topstep_vps_observations_received_idx
  on public.topstep_vps_observations (user_id, received_at desc);
-- Retencao: configurar tarefa administrativa para excluir received_at < now() - interval '1 day'.

-- Chaves independentes das integration_tokens (que possuem outras permissoes).
create table if not exists public.topstep_vps_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table public.topstep_vps_tokens enable row level security;
-- Sem policies de cliente: somente funcoes autenticadas pelo servidor.

-- Protecao explicita: nenhum usuario, nem cliente anonimo, tem acesso direto.
revoke all on table public.topstep_vps_tokens, public.topstep_vps_observations
  from public, anon, authenticated;
grant select, insert, update, delete on table
  public.topstep_vps_tokens, public.topstep_vps_observations to service_role;
revoke all on sequence public.topstep_vps_observations_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.topstep_vps_observations_id_seq to service_role;
