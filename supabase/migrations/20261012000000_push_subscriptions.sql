create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_user_endpoint_unique unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "Users can view their own push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);
create policy "Users can insert their own push subscriptions"
  on public.push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);
create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);

grant all on public.push_subscriptions to service_role;
grant select, insert, delete on public.push_subscriptions to authenticated;
