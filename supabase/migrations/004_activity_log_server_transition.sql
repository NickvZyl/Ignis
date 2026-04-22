-- Server-side activity logging. Previously only the client could write to
-- activity_log (schedule ticks from page.tsx, GOTO tags from chat-store).
-- When the browser was closed, Igni's "24/7 life" stopped logging anything,
-- leaving activity_recall with almost nothing to surface.
--
-- This RPC lets /api/life (cron) write transitions directly. Idempotent:
-- if the current open entry already matches scene+furniture, returns the
-- existing id without writing.
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

  if found then
    update public.activity_log
    set ended_at = now()
    where id = current_row.id;
  end if;

  insert into public.activity_log (user_id, scene, furniture, activity_label, emotion)
  values (target_user_id, p_scene, p_furniture, p_label, p_emotion)
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.log_server_activity_transition(uuid, text, text, text, text) to anon, authenticated, service_role;
