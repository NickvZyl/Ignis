import { createClient } from '@supabase/supabase-js';
import { estimateCostUsd } from './pricing';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let _db: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_db) _db = createClient(supabaseUrl, supabaseServiceKey);
  return _db;
}

export interface LLMCallLog {
  userId: string | null;
  route: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs: number;
  toolsUsed: string[];
  error?: string;
  // Ties this call to the user message that triggered it — populated by the
  // chat route; null for cron / non-user-initiated calls.
  messageId?: string | null;
}

export async function logLLMCall(entry: LLMCallLog): Promise<void> {
  const cost = estimateCostUsd(entry.model, {
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    cache_read_input_tokens: entry.cacheReadTokens,
    cache_creation_input_tokens: entry.cacheCreationTokens,
  });

  try {
    // `llm_call_logs` isn't in the generated types yet — cast the client row.
    const { error } = await (db().from('llm_call_logs') as any).insert({
      user_id: entry.userId,
      route: entry.route,
      model: entry.model,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      cache_read_tokens: entry.cacheReadTokens,
      cache_creation_tokens: entry.cacheCreationTokens,
      cost_estimate_usd: cost,
      latency_ms: entry.latencyMs,
      tools_used: entry.toolsUsed,
      error: entry.error ?? null,
      message_id: entry.messageId ?? null,
    });
    if (error) {
      // Logging must never take down a request. Surface to stderr and move on.
      console.error('[llm-logger] insert failed:', error);
    }
  } catch (e) {
    console.error('[llm-logger] exception:', e);
  }
}
