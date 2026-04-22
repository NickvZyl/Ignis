-- RPC for backend cron endpoints to read push tokens bypassing RLS.
-- Backend calls this with the anon key — SECURITY DEFINER lets it see all
-- rows for the target user. Matches the pattern used by gather_proactive_context.

create or replace function public.get_push_tokens(target_user_id uuid)
returns table (
  token text,
  platform text
)
language sql
security definer
set search_path = public
as $$
  select token, platform
  from public.push_tokens
  where user_id = target_user_id
  order by last_seen_at desc;
$$;
