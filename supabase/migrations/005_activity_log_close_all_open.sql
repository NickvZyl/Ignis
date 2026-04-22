-- Harden log_server_activity_transition + one-time orphan cleanup.
--
-- Client-side logTransition in activity-store.ts sometimes left rows open
-- (ended_at IS NULL) when the page reloaded mid-transition or when GOTO
-- and schedule-tick fired in an unlucky order. The table had multiple
-- "currently at X" rows for a single user, which made activity_recall
-- return confusing results and let the table grow unbounded.
create or replace function public.log_server_activity_transition(
  target_user_id uuid,
  p_scene text,
  p_furniture text,
  p_label text,
  p_emotion text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.activity_log;
  new_id uuid;
begin
  select * into current_row
  from public.activity_log
  where user_id = target_user_id and ended_at is null
  order by started_at desc
  limit 1;

  if found
    and current_row.scene is not distinct from p_scene
    and current_row.furniture is not distinct from p_furniture
  then
    return current_row.id;
  end if;

  -- Close ALL open entries for this user, not just the most recent.
  update public.activity_log
  set ended_at = now()
  where user_id = target_user_id and ended_at is null;

  insert into public.activity_log (user_id, scene, furniture, activity_label, emotion)
  values (target_user_id, p_scene, p_furniture, p_label, p_emotion)
  returning id into new_id;

  return new_id;
end;
$$;

-- One-time cleanup of existing orphans: for each user, keep at most the
-- single most-recent open row; close the rest.
update public.activity_log a
set ended_at = coalesce(a.ended_at, now())
where ended_at is null
  and exists (
    select 1 from public.activity_log b
    where b.user_id = a.user_id
      and b.ended_at is null
      and (b.started_at > a.started_at or (b.started_at = a.started_at and b.id > a.id))
  );
