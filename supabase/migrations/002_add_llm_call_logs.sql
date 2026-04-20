-- Per-call LLM observability + per-user rate limiting source of truth.
create table public.llm_call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  route text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_creation_tokens int not null default 0,
  cost_estimate_usd numeric(10, 6) not null default 0,
  latency_ms int not null default 0,
  tools_used jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

-- Rate limiter queries by (user_id, created_at) window.
create index llm_call_logs_user_created_idx
  on public.llm_call_logs (user_id, created_at desc);

-- Aggregate / ops queries.
create index llm_call_logs_created_idx
  on public.llm_call_logs (created_at desc);

alter table public.llm_call_logs enable row level security;

-- Any authenticated or anon request can insert (the logger is fire-and-forget from
-- server routes; the row is tagged with user_id for ownership). Rows are capped
-- in practice by the rate limiter reading its own recent history.
create policy "Anyone authenticated can insert llm_call_logs"
  on public.llm_call_logs for insert with check (true);

-- Only the row's owner can read their own call logs (rate limiter runs under
-- the user's access token and reads via RLS).
create policy "Users can read own llm_call_logs"
  on public.llm_call_logs for select using (auth.uid() = user_id);
