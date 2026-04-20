# Anthropic Migration — Manual Steps

## 1. Install the SDK

```bash
cd web
npm install
```

(`@anthropic-ai/sdk@^0.68.0` was added to `web/package.json`.)

## 2. Add env vars

Put these in `web/.env.local` (or wherever you keep env):

```
# Required
ANTHROPIC_API_KEY=sk-ant-...   # from https://console.anthropic.com/settings/keys

# Optional — with sensible defaults
ANTHROPIC_MODEL=                           # if set, forces chat model (bypasses router). Default: sonnet floor, router bumps to opus on triggers.
ANTHROPIC_UTILITY_MODEL=claude-haiku-4-5   # model for extract/classify sub-tasks
LLM_WEB_SEARCH_ENABLED=true
LLM_CACHE_ENABLED=true
LLM_MAX_RETRIES=3
LLM_HISTORY_WINDOW_SIZE=10
LLM_RATE_LIMIT_MESSAGES_PER_HOUR=120
LLM_RATE_LIMIT_SEARCHES_PER_DAY=200
SUPABASE_SERVICE_ROLE_KEY=                 # optional, for rate-limit + logger writes. Falls back to anon key.
```

**Do NOT remove** `OPENROUTER_API_KEY` — it's still required for embeddings (Anthropic has no embedding endpoint). Only chat completions migrated.

## 3. Apply the Supabase migration

New table: `public.llm_call_logs`. Run:

```bash
supabase migration up
# or: supabase db push
```

from the repo root. The migration file is `supabase/migrations/002_add_llm_call_logs.sql`.

## 4. Verify with the test script

```bash
cd web
TEST_USER_ID=<your-user-uuid> npx tsx ../scripts/test-migration.ts
```

It runs two calls and checks:
- cache written on call 1 (`cache_creation_input_tokens > 0`)
- cache read on call 2 (`cache_read_input_tokens > 0`)
- two rows in `llm_call_logs`

A "CHECK" (instead of "PASS") on cache write most likely means the cached block is below your model's minimum prefix (4096 tokens for Opus, 2048 for Sonnet). Sonnet 4.6 is the default and should cache.

## What changed

- **Chat path** (`web/app/api/chat/route.ts`): fully rewritten. Native Anthropic SDK, extensible tool loop, server-side web search, prompt caching, logging, rate limiting.
- **System prompt** (`src/prompts/system.ts`): split into `buildCachedStaticPrompt()` (byte-stable, cached) and the dynamic part in `buildSystemPromptBlocks()`. Client sends dynamic only; server prepends cached.
- **Chat store** (`web/stores/chat-store.ts`): 5 call sites swapped from `buildSystemPrompt(...)` to `buildSystemPromptBlocks(...).dynamic`.
- **Non-chat routes** (`extract`, `dream`, `reflect`, `life`, `proactive`): swapped OpenRouter → Anthropic SDK + logger. Haiku for `extract`, Sonnet for the rest.
- **New modules** under `src/lib/` and `src/lib/llm/`: `anthropic.ts`, `pricing.ts`, `logger.ts`, `rate-limit.ts`, `context.ts`, `router.ts`, `tools.ts`.

## What did NOT change

- `web/stores/companion-store.ts` (`processMessage` + emotion pipeline)
- `src/lib/emotional-engine.ts`
- `src/prompts/templates.ts` (27 emotion directives, 7 roles, 5 phases, 4 absence templates — all preserved verbatim)
- UI components
- `web/app/api/embed/route.ts` (still OpenRouter — no Anthropic embedding endpoint)
- `web/app/api/search/route.ts` (unchanged — not an LLM route)

## Model routing

`pickModel()` in `src/lib/llm/router.ts` returns:
- `ANTHROPIC_MODEL` env if set
- Opus 4.7 when the incoming message hits triggers (`think through`, `weigh`, `should i`, etc.) OR drift > 0.7 and attachment > 0.5 OR web search needed
- Otherwise Sonnet 4.6

Switching models invalidates the cache — if the router flaps between Sonnet and Opus across turns in the same conversation, you'll pay cache-write costs more often. Set `ANTHROPIC_MODEL=claude-sonnet-4-6` to pin if you want predictable caching behavior.

## Observability

Query `llm_call_logs`:

```sql
select route, model, count(*), sum(cost_estimate_usd)::numeric(10,4) as cost_usd,
       avg(latency_ms)::int as avg_latency_ms,
       sum(cache_read_tokens) as cache_reads, sum(cache_creation_tokens) as cache_writes
from llm_call_logs
where created_at > now() - interval '1 day'
group by 1, 2 order by cost_usd desc;
```

Cache-hit ratio (higher is cheaper):

```sql
select model,
       sum(cache_read_tokens)::float /
         nullif(sum(cache_read_tokens + cache_creation_tokens + input_tokens), 0) as cache_hit_ratio
from llm_call_logs where created_at > now() - interval '1 hour' group by 1;
```

If this is near zero on the chat route, a silent invalidator is changing the cached block — check `buildCachedStaticPrompt()` for non-deterministic content.

## Rate limiting

Counters read from `llm_call_logs` directly — no separate table to keep in sync. On limit hit the chat route returns `429` with `Retry-After`. Adjust via `LLM_RATE_LIMIT_*` env vars.

## Frontend compatibility

The chat API still returns the same SSE shape the frontend expects:

```
data: {"choices":[{"delta":{"content":"..."}}]}\n\n
...
data: [DONE]\n\n
```

Internally the tool loop runs non-streaming, then the final text is chunked into word-sized SSE frames. If you need true token-by-token streaming later, the tool loop supports streaming per iteration — see `src/lib/llm/tools.ts` for the hook point.
