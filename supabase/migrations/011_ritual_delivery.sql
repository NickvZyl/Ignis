-- Daily rituals: morning thought delivery (~8am local) and evening check-in
-- (~10pm local). Columns track last-delivery timestamps so the cron is
-- idempotent; timezone column lets us compute user-local time.

alter table public.profiles
  add column if not exists timezone text,
  add column if not exists last_morning_delivery_at timestamptz,
  add column if not exists last_evening_delivery_at timestamptz;

create or replace function public.mark_user_active(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_location_city text default null,
  p_timezone text default null
) returns void
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
  insert into public.profiles (
    id, last_active_at, last_seen_at, created_at,
    latitude, longitude, location_updated_at, location_city, timezone
  )
  values (
    current_user_id, now(), now(), now(),
    p_latitude, p_longitude,
    case when p_latitude is not null then now() else null end,
    p_location_city, p_timezone
  )
  on conflict (id) do update set
    last_active_at = now(),
    last_seen_at = now(),
    latitude = coalesce(excluded.latitude, profiles.latitude),
    longitude = coalesce(excluded.longitude, profiles.longitude),
    location_updated_at = case
      when excluded.latitude is not null then now()
      else profiles.location_updated_at
    end,
    location_city = coalesce(excluded.location_city, profiles.location_city),
    timezone = coalesce(excluded.timezone, profiles.timezone);
end;
$$;

create or replace function public.mark_ritual_delivered(
  target_user_id uuid,
  kind text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if kind = 'morning' then
    update public.profiles
    set last_morning_delivery_at = now()
    where id = target_user_id;
  elsif kind = 'evening' then
    update public.profiles
    set last_evening_delivery_at = now()
    where id = target_user_id;
  end if;
end;
$$;
