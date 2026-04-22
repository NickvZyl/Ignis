-- Passive location tracking: when mobile reports presence, it includes the
-- user's last-known coords. Server uses this to ground Igni's responses
-- (weather for your area, navigation handoffs, etc). Optional — users can
-- deny the permission and everything else still works.

alter table public.profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_updated_at timestamptz,
  add column if not exists location_city text;

-- Replace mark_user_active with a version that accepts optional location
-- fields. Keep it callable with no args for backward compatibility.
create or replace function public.mark_user_active(
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_location_city text default null
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
    latitude, longitude, location_updated_at, location_city
  )
  values (
    current_user_id, now(), now(), now(),
    p_latitude, p_longitude,
    case when p_latitude is not null then now() else null end,
    p_location_city
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
    location_city = coalesce(excluded.location_city, profiles.location_city);
end;
$$;
