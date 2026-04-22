import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let _db: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_db) _db = createClient(supabaseUrl, supabaseServiceKey);
  return _db;
}

const MESSAGES_PER_HOUR = Number(process.env.LLM_RATE_LIMIT_MESSAGES_PER_HOUR ?? 120);
const SEARCHES_PER_DAY = Number(process.env.LLM_RATE_LIMIT_SEARCHES_PER_DAY ?? 200);

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; reason: string };

// Counts rows in llm_call_logs over a window. Uses the same table as the logger
// so there's one source of truth and nothing to keep in sync.
async function countSince(
  userId: string,
  sinceISO: string,
  filter?: { toolUsed?: string },
): Promise<number> {
  let q = db()
    .from('llm_call_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', sinceISO);
  if (filter?.toolUsed) {
    q = q.contains('tools_used', [filter.toolUsed]);
  }
  const { count, error } = await q;
  if (error) {
    // Fail open — don't lock users out because rate-limit lookup broke.
    console.error('[rate-limit] lookup failed, allowing:', error);
    return 0;
  }
  return count ?? 0;
}

export async function checkChatRateLimit(userId: string): Promise<RateLimitResult> {
  const sinceISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const count = await countSince(userId, sinceISO);
  if (count >= MESSAGES_PER_HOUR) {
    return {
      allowed: false,
      retryAfterSeconds: 60 * 60,
      reason: `Hourly message limit reached (${MESSAGES_PER_HOUR}/h)`,
    };
  }
  return { allowed: true };
}

export async function checkSearchRateLimit(userId: string): Promise<RateLimitResult> {
  const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const count = await countSince(userId, sinceISO, { toolUsed: 'web_search' });
  if (count >= SEARCHES_PER_DAY) {
    return {
      allowed: false,
      retryAfterSeconds: 24 * 60 * 60,
      reason: `Daily search limit reached (${SEARCHES_PER_DAY}/d)`,
    };
  }
  return { allowed: true };
}

export function rateLimitResponse(res: RateLimitResult): Response | null {
  if (res.allowed) return null;
  return new Response(JSON.stringify({ error: res.reason }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(res.retryAfterSeconds),
    },
  });
}
