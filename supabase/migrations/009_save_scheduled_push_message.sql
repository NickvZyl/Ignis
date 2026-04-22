-- Persist a scheduled push's body into the user's active conversation so they
-- see it in chat history, not just as a transient notification. Mirrors the
-- save_proactive_message pattern but also handles conversation creation if
-- the user has no active one.

create or replace function public.save_scheduled_push_message(
  target_user_id uuid,
  content text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  active_conversation_id uuid;
  new_message_id uuid;
begin
  select id into active_conversation_id
  from public.conversations
  where user_id = target_user_id and ended_at is null
  order by created_at desc
  limit 1;

  if active_conversation_id is null then
    insert into public.conversations (user_id)
    values (target_user_id)
    returning id into active_conversation_id;
  end if;

  insert into public.messages (conversation_id, role, content)
  values (active_conversation_id, 'assistant', content)
  returning id into new_message_id;

  return new_message_id;
end;
$$;
