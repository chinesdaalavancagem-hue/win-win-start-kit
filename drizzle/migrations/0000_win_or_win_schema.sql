create type public.app_role as enum ('admin','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  cpf text not null default '',
  birth_date date,
  email text not null default '',
  approved boolean not null default false,
  rejected boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create or replace function public.is_approved(_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select approved from public.profiles where id = _user_id), false) $$;

create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "admin read profiles" on public.profiles for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin update profiles" on public.profiles for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data text not null default '',
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.app_data to authenticated;
grant all on public.app_data to service_role;
alter table public.app_data enable row level security;
create policy "own data select" on public.app_data for select to authenticated using (user_id = auth.uid() and public.is_approved(auth.uid()));
create policy "own data insert" on public.app_data for insert to authenticated with check (user_id = auth.uid() and public.is_approved(auth.uid()));
create policy "own data update" on public.app_data for update to authenticated using (user_id = auth.uid() and public.is_approved(auth.uid())) with check (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, full_name, phone, cpf, birth_date, email, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'phone',''),
    coalesce(new.raw_user_meta_data->>'cpf',''),
    nullif(new.raw_user_meta_data->>'birth_date','')::date,
    coalesce(new.email,''),
    first_user
  );
  if first_user then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, app_role) from public, anon;
revoke execute on function public.is_approved(uuid) from public, anon;