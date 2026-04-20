import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey;

// Admin gating: comma-separated env var of allowed user ids. Empty = deny all.
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function userDb(accessToken: string) {
  // User-scoped client — RLS on messages lets the user read their own rows.
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function serviceDb() {
  // Elevated client for llm_call_logs queries that need to join across users
  // or bypass RLS. Falls back to anon if service role isn't configured (in
  // which case llm_call_logs SELECT works via the "read own" RLS policy, but
  // cross-user aggregation won't).
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function authorize(accessToken: string | null): Promise<string | null> {
  if (!accessToken) return null;
  const { data } = await userDb(accessToken).auth.getUser();
  const uid = data?.user?.id ?? null;
  if (!uid) return null;
  if (!ADMIN_USER_IDS.includes(uid)) return null;
  return uid;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const accessToken =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    url.searchParams.get('accessToken');

  const adminId = await authorize(accessToken);
  if (!adminId) return new Response('Forbidden', { status: 403 });

  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const messageId = url.searchParams.get('messageId');

  // User-scoped client for messages (RLS-gated). Service client for cross-user
  // aggregation on llm_call_logs.
  const db = userDb(accessToken!);
  const svc = serviceDb();

  // Per-message detail: all log rows tied to a single user message.
  if (messageId) {
    const { data, error } = await (db.from('llm_call_logs') as any)
      .select('id, route, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_estimate_usd, latency_ms, tools_used, error, created_at, message_id')
      .eq('message_id', messageId)
      .order('created_at', { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ calls: data ?? [] });
  }

  // List view: recent user messages with aggregated per-message cost/latency.
  // Only show messages that actually have log rows tied to them — otherwise
  // the pane is cluttered with pre-migration messages that predate logging.
  const { data, error } = await (db.from('messages') as any)
    .select(`
      id,
      content,
      role,
      created_at,
      conversation_id,
      llm_call_logs!inner(
        cost_estimate_usd,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_creation_tokens,
        latency_ms,
        model
      )
    `)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Collapse the per-message log rows into totals for the list view.
  const rows = (data ?? []).map((m: any) => {
    const calls = m.llm_call_logs ?? [];
    const totalCost = calls.reduce((s: number, c: any) => s + Number(c.cost_estimate_usd ?? 0), 0);
    const inputTokens = calls.reduce((s: number, c: any) => s + (c.input_tokens ?? 0), 0);
    const outputTokens = calls.reduce((s: number, c: any) => s + (c.output_tokens ?? 0), 0);
    const cacheRead = calls.reduce((s: number, c: any) => s + (c.cache_read_tokens ?? 0), 0);
    const cacheWrite = calls.reduce((s: number, c: any) => s + (c.cache_creation_tokens ?? 0), 0);
    const latency = calls.reduce((s: number, c: any) => s + (c.latency_ms ?? 0), 0);
    const cachedInput = cacheRead;
    const totalInput = inputTokens + cacheRead + cacheWrite;
    const cacheHitRatio = totalInput > 0 ? cachedInput / totalInput : 0;
    const model = calls[0]?.model ?? '—';
    return {
      id: m.id,
      content: m.content,
      createdAt: m.created_at,
      conversationId: m.conversation_id,
      callCount: calls.length,
      totalCost,
      inputTokens,
      outputTokens,
      cacheRead,
      cacheWrite,
      latencyMs: latency,
      cacheHitRatio,
      model,
    };
  });

  // Summary: today + 7d totals, cache hit, by route.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // Aggregations: use the service client so cron routes (user_id=null or other
  // users) are included in the totals.
  const [todayRes, weekRes, byRouteRes] = await Promise.all([
    (svc.from('llm_call_logs') as any)
      .select('cost_estimate_usd, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens')
      .gte('created_at', since24h),
    (svc.from('llm_call_logs') as any)
      .select('cost_estimate_usd')
      .gte('created_at', since7d),
    (svc.from('llm_call_logs') as any)
      .select('route, cost_estimate_usd, model')
      .gte('created_at', since24h),
  ]);

  const today = (todayRes.data ?? []).reduce(
    (acc: any, r: any) => {
      acc.cost += Number(r.cost_estimate_usd ?? 0);
      acc.input += r.input_tokens ?? 0;
      acc.output += r.output_tokens ?? 0;
      acc.cacheRead += r.cache_read_tokens ?? 0;
      acc.cacheWrite += r.cache_creation_tokens ?? 0;
      return acc;
    },
    { cost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );
  const week = (weekRes.data ?? []).reduce(
    (s: number, r: any) => s + Number(r.cost_estimate_usd ?? 0),
    0,
  );
  const totalTodayInput = today.input + today.cacheRead + today.cacheWrite;
  const todayCacheHitRatio = totalTodayInput > 0 ? today.cacheRead / totalTodayInput : 0;

  const byRoute: Record<string, { cost: number; calls: number; model: string }> = {};
  for (const r of byRouteRes.data ?? []) {
    const key = r.route;
    if (!byRoute[key]) byRoute[key] = { cost: 0, calls: 0, model: r.model };
    byRoute[key].cost += Number(r.cost_estimate_usd ?? 0);
    byRoute[key].calls += 1;
  }

  return Response.json({
    rows,
    summary: {
      today: {
        cost: today.cost,
        inputTokens: today.input,
        outputTokens: today.output,
        cacheReadTokens: today.cacheRead,
        cacheWriteTokens: today.cacheWrite,
        cacheHitRatio: todayCacheHitRatio,
      },
      week: { cost: week },
      byRoute,
    },
  });
}
