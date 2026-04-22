-- Phase A push enhancements:
-- 1. presence tracking (profiles.last_active_at) — server skips a push if the
--    user was foregrounding the app very recently (they'd see it in-chat
--    anyway).
-- 2. scheduled_pushes table — Igni can queue a push for a future time via a
--    tool; a minutely cron processes due rows and sends them.

alter table public.profiles
  add column if not exists last_active_at timestamptz;

create table if not exists public.scheduled_pushes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  title text,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_pushes_due_idx
  on public.scheduled_pushes(scheduled_for)
  where sent_at is null;

alter table public.scheduled_pushes enable row level security;

-- Users can see their own scheduled pushes (for transparency / debugging).
create policy "users read own scheduled pushes"
  on public.scheduled_pushes for select
  using (auth.uid() = user_id);

-- RPCs for backend cron that bypass RLS (anon client pattern).

-- Claim and return pushes that are due. Marks them with a placeholder sent_at
-- immediately to prevent double-sends; the caller fills in the real sent_at
-- and error after actually sending.
create or replace function public.claim_due_scheduled_pushes(batch_size int default 20)
returns table (
  id uuid,
  user_id uuid,
  body text,
  title text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select p.id
    from public.scheduled_pushes p
    where p.sent_at is null
      and p.scheduled_for <= now()
    order by p.scheduled_for
    limit batch_size
    for update skip locked
  ),
  claimed as (
    update public.scheduled_pushes p
    set sent_at = now()  -- provisional; process_scheduled will overwrite on failure
    from due
    where p.id = due.id
    returning p.id, p.user_id, p.body, p.title
  )
  select claimed.id, claimed.user_id, claimed.body, claimed.title from claimed;
end;
$$;

create or replace function public.mark_scheduled_push_failed(
  target_id uuid,
  err text
) returns void
language sql
security definer
set search_path = public
as $$
  update public.scheduled_pushes
  set sent_at = null, error = err
  where id = target_id;
$$;

-- Schedule a push (used by the chat tool via user's JWT — RLS enforces
-- auth.uid() = user_id at insert time via an explicit check).
create or replace function public.schedule_push_for_self(
  p_body text,
  p_title text,
  p_scheduled_for timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.scheduled_pushes (user_id, body, title, scheduled_for)
  values (current_user_id, p_body, p_title, p_scheduled_for)
  returning id into new_id;
  return new_id;
end;
$$;

-- Update profile.last_active_at (mobile calls this when foregrounded).
create or replace function public.mark_user_active()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    return;
  end if;
  insert into public.profiles (id, last_active_at, last_seen_at, created_at)
  values (current_user_id, now(), now(), now())
  on conflict (id)
  do update set last_active_at = now(), last_seen_at = now();
end;
$$;
