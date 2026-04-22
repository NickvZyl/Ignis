-- Push notification tokens for mobile clients.
--
-- One row per (user, token). Users can have multiple devices → multiple rows.
-- The backend (service role) reads all rows for a user_id to fan out a push.
-- Tokens rotate — we upsert on (user_id, token) and update last_seen_at.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  device_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);

alter table public.push_tokens enable row level security;

create policy "users read own push tokens"
  on public.push_tokens for select
  using (auth.uid() = user_id);

create policy "users insert own push tokens"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

create policy "users update own push tokens"
  on public.push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users delete own push tokens"
  on public.push_tokens for delete
  using (auth.uid() = user_id);
