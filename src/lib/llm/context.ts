import { createClient } from '@supabase/supabase-js';
import { getEmbedding } from '@/lib/openrouter';
import { getAbsenceContext } from '@/prompts/templates';
import type { EmotionalState, Memory } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function serviceDb() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const HISTORY_WINDOW_SIZE = Number(process.env.LLM_HISTORY_WINDOW_SIZE ?? 10);
const MEMORY_MATCH_COUNT = 5;
const MEMORY_MATCH_THRESHOLD = 0.5;

export type AbsenceKey = 'none' | 'short' | 'medium' | 'long' | 'very_long';

export interface LLMContext {
  userId: string;
  state: EmotionalState;
  memories: Memory[];
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  timeSinceLastMs: number;
  absenceKey: AbsenceKey;
}

export interface BuildContextInput {
  userId: string;
  incomingMessage: string;
  // Optional pre-fetched context (client-driven flow passes these).
  providedState?: EmotionalState;
  providedMemories?: Memory[];
  providedHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

function pickAbsenceKey(timeSinceLastMs: number): AbsenceKey {
  const hours = timeSinceLastMs / (1000 * 60 * 60);
  if (hours < 2) return 'none';
  if (hours < 6) return 'short';
  if (hours < 24) return 'medium';
  if (hours < 48) return 'long';
  return 'very_long';
}

// Server-side pre-flight: assembles the user-scoped context block. Accepts
// pre-fetched pieces from the client (which already has them in its store) to
// avoid duplicate queries, and fetches anything missing from Supabase.
export async function buildContext(input: BuildContextInput): Promise<LLMContext> {
  const db = serviceDb();

  // Emotional state
  let state = input.providedState;
  if (!state) {
    const { data, error } = await db
      .from('emotional_state')
      .select('*')
      .eq('user_id', input.userId)
      .single();
    if (error || !data) {
      throw new Error(`[context] could not load emotional_state for user ${input.userId}: ${error?.message}`);
    }
    state = data as unknown as EmotionalState;
  }

  // Recent conversation history
  let history = input.providedHistory;
  if (!history) {
    const { data } = await db
      .from('messages')
      .select('role, content, created_at')
      .eq('user_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_WINDOW_SIZE);
    history = (data ?? [])
      .reverse()
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content as string }));
  }

  // Memories via pgvector similarity
  let memories = input.providedMemories;
  if (!memories) {
    try {
      const embedding = await getEmbedding(input.incomingMessage);
      const { data } = await db.rpc('match_memories', {
        query_embedding: embedding,
        match_user_id: input.userId,
        match_threshold: MEMORY_MATCH_THRESHOLD,
        match_count: MEMORY_MATCH_COUNT,
      });
      memories = (data ?? []) as Memory[];
    } catch (e) {
      console.error('[context] memory retrieval failed, continuing with empty:', e);
      memories = [];
    }
  }

  const timeSinceLastMs = Date.now() - new Date(state.last_interaction_at).getTime();

  return {
    userId: input.userId,
    state,
    memories,
    history,
    timeSinceLastMs,
    absenceKey: pickAbsenceKey(timeSinceLastMs),
  };
}

// Renders a compact dynamic-context block the route can append to the dynamic
// system prompt. Use this when the client hasn't already built the dynamic
// prompt via buildSystemPromptBlocks.
export function renderContextBlock(ctx: LLMContext): string {
  const parts: string[] = [];
  const { state, memories, absenceKey } = ctx;

  const hoursSince = ctx.timeSinceLastMs / (1000 * 60 * 60);
  parts.push(
    `Current state: valence ${state.valence.toFixed(2)}, arousal ${state.arousal.toFixed(2)}, drift ${state.drift.toFixed(2)}, attachment ${state.attachment.toFixed(2)}.`,
  );
  parts.push(`Active emotion: ${state.active_emotion}. Active role: ${state.active_role ?? 'none'}.`);

  if (absenceKey !== 'none') {
    const framing = getAbsenceContext(hoursSince, state.drift, state.attachment);
    if (framing) parts.push(framing);
  }

  if (memories.length > 0) {
    parts.push(
      `Relevant memories:\n${memories.map((m, i) => `${i + 1}. ${m.content}`).join('\n')}`,
    );
  }

  return parts.join('\n\n');
}
