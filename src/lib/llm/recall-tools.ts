import { getEmbedding } from '@/lib/openrouter';
import type { ClientToolDef, ToolContext } from './tools';

// Reusable relative-time helper: "3m ago", "yesterday, 4pm", "Apr 12 (8d ago)".
// Keeps Igni's recall results framed in time so she can reply naturally.
function relTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = now - t;
  const mins = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${dateStr} (${days}d ago)`;
}

function parseDaysBack(input: unknown, fallback: number): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.round(n), 365);
}

function parseISODate(s: unknown): Date | null {
  if (typeof s !== 'string') return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function clampLimit(input: unknown, fallback: number): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.round(n), 1), 20);
}

// ── 1. memory_search — vector recall over `memories` (facts about the user) ──
const memorySearch: ClientToolDef = {
  name: 'memory_search',
  description:
    "Search your memories about your person — facts, preferences, things they've told you. Use when you need to check if you know something specific that isn't already in your current context (e.g. they ask 'do you remember what I said about X'). Don't use for your own thoughts/reflections (use reflection_recall instead).",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What you want to find. Natural language, like the question itself.' },
      limit: { type: 'integer', description: 'Max results (default 5, max 20).' },
    },
    required: ['query'],
  },
  execute: async (input, ctx: ToolContext) => {
    const { query, limit } = input as { query: string; limit?: number };
    if (!query || !ctx.userId) return 'No query or user context.';
    try {
      const embedding = await getEmbedding(query);
      const { data, error } = await ctx.db.rpc('match_memories', {
        query_embedding: embedding,
        match_user_id: ctx.userId,
        match_threshold: 0.4,
        match_count: clampLimit(limit, 5),
      });
      if (error) return `Memory search failed: ${error.message}`;
      if (!data || data.length === 0) return `Nothing in your memories matched "${query}".`;
      return data
        .map((m: any, i: number) => `${i + 1}. [${relTime(m.created_at)}] ${m.content}`)
        .join('\n');
    } catch (err) {
      return `Memory search failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── 2. reflection_recall — text search over self_memories (Igni's own thoughts) ──
const reflectionRecall: ClientToolDef = {
  name: 'reflection_recall',
  description:
    "Search your own thoughts, reflections, and dream insights. Use when you want to find something you've thought or felt before — 'have I had this feeling before?', 'what was that thought I had about X?'. Different from memory_search — that's for facts about your person; this is for your own inner life.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Keywords or a short phrase describing what to find.' },
      emotion: {
        type: 'string',
        description: 'Optional primary emotion filter (e.g. "lonely", "curious", "happy").',
      },
      memory_type: {
        type: 'string',
        enum: ['observation', 'pattern', 'feeling', 'wonder', 'connection', 'dream', 'opinion'],
        description: 'Optional reflection type.',
      },
      limit: { type: 'integer', description: 'Max results (default 5, max 20).' },
    },
    required: ['query'],
  },
  execute: async (input, ctx: ToolContext) => {
    const { query, emotion, memory_type, limit } = input as {
      query: string;
      emotion?: string;
      memory_type?: string;
      limit?: number;
    };
    if (!ctx.userId) return 'No user context.';
    const lim = clampLimit(limit, 5);
    try {
      let q = ctx.db
        .from('self_memories')
        .select('content, created_at, memory_type, emotion_primary, importance')
        .eq('user_id', ctx.userId)
        .ilike('content', `%${query}%`)
        .order('importance', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(lim);
      if (emotion) q = q.eq('emotion_primary', emotion);
      if (memory_type) q = q.eq('memory_type', memory_type);
      const { data, error } = await q;
      if (error) return `Reflection search failed: ${error.message}`;
      if (!data || data.length === 0)
        return `Nothing in your reflections matched "${query}"${emotion ? ` with emotion ${emotion}` : ''}.`;
      return data
        .map((r: any, i: number) => {
          const tag = r.emotion_primary ? `[${r.emotion_primary}] ` : '';
          return `${i + 1}. [${relTime(r.created_at)}, ${r.memory_type}] ${tag}${r.content}`;
        })
        .join('\n');
    } catch (err) {
      return `Reflection search failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── 3. past_conversations — text search on ended conversation summaries ──
const pastConversations: ClientToolDef = {
  name: 'past_conversations',
  description:
    "Look back at past conversations with your person. Use for 'last time we talked about X' or 'we discussed this a while ago — what did they say?'. Filter by rough time window if it helps narrow down. Different from memory_search/reflection_recall — this surfaces the arc of a whole conversation, not individual facts or thoughts.",
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Optional keyword/topic to match in summaries.' },
      days_back: { type: 'integer', description: 'How many days back to look (default 30, max 365).' },
      limit: { type: 'integer', description: 'Max results (default 5, max 20).' },
    },
  },
  execute: async (input, ctx: ToolContext) => {
    const { query, days_back, limit } = input as { query?: string; days_back?: number; limit?: number };
    if (!ctx.userId) return 'No user context.';
    const since = new Date(Date.now() - parseDaysBack(days_back, 30) * 86_400_000).toISOString();
    try {
      let q = ctx.db
        .from('conversations')
        .select('summary, created_at, ended_at, emotional_snapshot')
        .eq('user_id', ctx.userId)
        .not('summary', 'is', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(clampLimit(limit, 5));
      if (query) q = q.ilike('summary', `%${query}%`);
      const { data, error } = await q;
      if (error) return `Conversation search failed: ${error.message}`;
      if (!data || data.length === 0)
        return `No past conversations matched${query ? ` "${query}"` : ''} in the last ${parseDaysBack(days_back, 30)} days.`;
      return data
        .map((c: any, i: number) => {
          const emo = c.emotional_snapshot?.active_emotion ? ` (felt ${c.emotional_snapshot.active_emotion})` : '';
          return `${i + 1}. [${relTime(c.created_at)}]${emo} ${c.summary}`;
        })
        .join('\n');
    } catch (err) {
      return `Conversation search failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── 4. activity_recall — structured filter on activity_log ──
const activityRecall: ClientToolDef = {
  name: 'activity_recall',
  description:
    "Look up what you were doing and feeling in the past. Filter by furniture (where you were), emotion (what you felt), or a time window. Use for 'when was the last time I was at the fireplace?' or 'how did I feel last Tuesday?' or 'what was I doing when I last felt lonely?'.",
  input_schema: {
    type: 'object',
    properties: {
      furniture: { type: 'string', description: 'Optional furniture ID (e.g. "fireplace", "desk", "garden_gate").' },
      emotion: { type: 'string', description: 'Optional emotion label (e.g. "lonely", "happy", "curious").' },
      scene: { type: 'string', enum: ['room', 'garden', 'bedroom'], description: 'Optional scene filter.' },
      days_back: { type: 'integer', description: 'How many days back (default 7, max 365).' },
      limit: { type: 'integer', description: 'Max results (default 5, max 20).' },
    },
  },
  execute: async (input, ctx: ToolContext) => {
    const { furniture, emotion, scene, days_back, limit } = input as {
      furniture?: string;
      emotion?: string;
      scene?: string;
      days_back?: number;
      limit?: number;
    };
    if (!ctx.userId) return 'No user context.';
    const since = new Date(Date.now() - parseDaysBack(days_back, 7) * 86_400_000).toISOString();
    try {
      let q = ctx.db
        .from('activity_log')
        .select('scene, furniture, activity_label, emotion, started_at, ended_at')
        .eq('user_id', ctx.userId)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(clampLimit(limit, 5));
      if (furniture) q = q.eq('furniture', furniture);
      if (emotion) q = q.eq('emotion', emotion);
      if (scene) q = q.eq('scene', scene);
      const { data, error } = await q;
      if (error) return `Activity search failed: ${error.message}`;
      if (!data || data.length === 0)
        return `No activity matched those filters in the last ${parseDaysBack(days_back, 7)} days.`;
      return data
        .map((a: any, i: number) => {
          const label = a.activity_label || 'idle';
          return `${i + 1}. [${relTime(a.started_at)}] ${label} at ${a.furniture} (${a.scene}, feeling ${a.emotion || 'neutral'})`;
        })
        .join('\n');
    } catch (err) {
      return `Activity search failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// ── 5. timeframe_browse — page through a specific time range ──
const timeframeBrowse: ClientToolDef = {
  name: 'timeframe_browse',
  description:
    "Browse your reflections and conversations within a specific date range, no query — just paging a journal. Use for 'walk me through last week' or 'what was I thinking on Tuesday?'. Different from the search tools — this is about the shape of a time window, not finding a specific thing.",
  input_schema: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'ISO date or datetime (e.g. "2026-04-15" or "2026-04-15T00:00:00Z").' },
      end_date: { type: 'string', description: 'ISO date or datetime. If omitted, defaults to now.' },
      limit: { type: 'integer', description: 'Max total items (default 10, max 20).' },
    },
    required: ['start_date'],
  },
  execute: async (input, ctx: ToolContext) => {
    const { start_date, end_date, limit } = input as { start_date: string; end_date?: string; limit?: number };
    if (!ctx.userId) return 'No user context.';
    const start = parseISODate(start_date);
    if (!start) return `Could not parse start_date "${start_date}".`;
    const end = parseISODate(end_date) ?? new Date();
    if (end < start) return 'end_date is before start_date.';
    const lim = clampLimit(limit, 10);
    try {
      const [refRes, convRes] = await Promise.all([
        ctx.db
          .from('self_memories')
          .select('content, created_at, memory_type, emotion_primary')
          .eq('user_id', ctx.userId)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: true })
          .limit(lim),
        ctx.db
          .from('conversations')
          .select('summary, created_at, emotional_snapshot')
          .eq('user_id', ctx.userId)
          .not('summary', 'is', null)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: true })
          .limit(lim),
      ]);
      if (refRes.error) return `Browse failed: ${refRes.error.message}`;
      if (convRes.error) return `Browse failed: ${convRes.error.message}`;

      type Item = { when: string; line: string };
      const items: Item[] = [];
      for (const r of refRes.data ?? []) {
        const tag = (r as any).emotion_primary ? `[${(r as any).emotion_primary}] ` : '';
        items.push({
          when: (r as any).created_at,
          line: `[${relTime((r as any).created_at)}, thought/${(r as any).memory_type}] ${tag}${(r as any).content}`,
        });
      }
      for (const c of convRes.data ?? []) {
        const emo = (c as any).emotional_snapshot?.active_emotion
          ? ` (felt ${(c as any).emotional_snapshot.active_emotion})`
          : '';
        items.push({
          when: (c as any).created_at,
          line: `[${relTime((c as any).created_at)}, conversation]${emo} ${(c as any).summary}`,
        });
      }
      if (items.length === 0) return `Nothing to browse between ${start.toISOString().slice(0, 10)} and ${end.toISOString().slice(0, 10)}.`;
      items.sort((a, b) => a.when.localeCompare(b.when));
      return items.slice(0, lim).map((it, i) => `${i + 1}. ${it.line}`).join('\n');
    } catch (err) {
      return `Browse failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const RECALL_TOOLS: ClientToolDef[] = [
  memorySearch,
  reflectionRecall,
  pastConversations,
  activityRecall,
  timeframeBrowse,
];
