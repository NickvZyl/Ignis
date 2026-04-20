-- Tie each LLM call row to the user message that triggered it (nullable — not
-- every call originates from a user message; cron routes have null message_id).
alter table public.llm_call_logs
  add column message_id uuid references public.messages(id) on delete set null;

create index llm_call_logs_message_id_idx
  on public.llm_call_logs (message_id);
