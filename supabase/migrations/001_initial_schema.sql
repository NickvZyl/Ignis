-- Enable pgvector for memory embeddings
create extension if not exists vector with schema extensions;

-- Profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Emotional state (one row per user, updated in place)
create table public.emotional_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  valence real default 0.6,
  arousal real default 0.4,
  attachment real default 0.0,
  drift real default 0.0,
  active_emotion text default 'content',
  active_role text default 'companion',
  last_interaction_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.emotional_state enable row level security;

create policy "Users can view own emotional state"
  on public.emotional_state for select
  using (auth.uid() = user_id);

create policy "Users can update own emotional state"
  on public.emotional_state for update
  using (auth.uid() = user_id);

-- Conversations
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text,
  emotional_snapshot jsonb,
  created_at timestamptz default now(),
  ended_at timestamptz
);

alter table public.conversations enable row level security;

create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own conversations"
  on public.conversations for update
  using (auth.uid() = user_id);

-- Messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  emotional_signals jsonb,
  created_at timestamptz default now()
);

alter table public.messages enable row level security;

create policy "Users can view own messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

create policy "Users can insert own messages"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

create policy "Users can update own messages"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

-- Memories
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  memory_type text not null check (memory_type in ('fact', 'emotion', 'theme', 'preference', 'event')),
  importance real default 0.5,
  embedding vector(1536),
  created_at timestamptz default now()
);

alter table public.memories enable row level security;

create policy "Users can view own memories"
  on public.memories for select
  using (auth.uid() = user_id);

create policy "Users can insert own memories"
  on public.memories for insert
  with check (auth.uid() = user_id);

-- Create index for vector similarity search
create index memories_embedding_idx on public.memories
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Match memories RPC (cosine similarity search)
create or replace function public.match_memories(
  query_embedding vector(1536),
  match_user_id uuid,
  match_threshold float default 0.5,
  match_count int default 5
)
returns table (
  id uuid,
  user_id uuid,
  content text,
  memory_type text,
  importance real,
  created_at timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    m.id,
    m.user_id,
    m.content,
    m.memory_type,
    m.importance,
    m.created_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.memories m
  where m.user_id = match_user_id
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Auto-create profile and emotional state on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, last_seen_at)
  values (new.id, new.raw_user_meta_data->>'display_name', now());

  insert into public.emotional_state (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
