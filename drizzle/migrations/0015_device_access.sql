-- Controle de navegadores autorizados. Nenhum token em texto puro é armazenado.
create table if not exists public.device_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_type text not null check (device_type in ('desktop','mobile')),
  token_hash text not null unique,
  user_agent text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','revoked')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);
create index if not exists device_access_user_status on public.device_access (user_id, status);
create unique index if not exists device_access_one_approved_per_type
  on public.device_access(user_id, device_type) where status = 'approved';
alter table public.device_access enable row level security;
revoke all on public.device_access from anon, authenticated;

-- A transição é atômica: revoga o dispositivo anterior e aprova o novo.
create or replace function public.approve_device_access(p_device_id uuid, p_admin_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare v_user uuid; v_type text;
begin
  select user_id, device_type into v_user, v_type from public.device_access where id = p_device_id and status = 'pending' for update;
  if v_user is null then return false; end if;
  update public.device_access set status = 'revoked', decided_at = now(), decided_by = p_admin_id
    where user_id = v_user and device_type = v_type and status = 'approved';
  update public.device_access set status = 'approved', decided_at = now(), decided_by = p_admin_id where id = p_device_id;
  return true;
end $$;
revoke all on function public.approve_device_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_device_access(uuid, uuid) to service_role;
