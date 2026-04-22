import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic, withRetry } from '@/lib/anthropic';
import { buildCachedStaticPrompt } from '@/prompts/system';
import { pickModel } from '@/lib/llm/router';
import { logLLMCall } from '@/lib/llm/logger';
import { checkChatRateLimit, rateLimitResponse } from '@/lib/llm/rate-limit';
import {
  buildRegistry,
  toolsForAnthropic,
  runToolLoop,
  WEB_SEARCH_SERVER_TOOL,
  type ClientToolDef,
} from '@/lib/llm/tools';
import { RECALL_TOOLS } from '@/lib/llm/recall-tools';
import { CONFIG } from '@/constants/config';
import { buildServerSessionPrompt } from '@web/lib/session-prompt';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRole = createClient(supabaseUrl, supabaseAnonKey);

function getSupabaseForUser(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function logError(
  source: string,
  message: string,
  statusCode?: number,
  rawResponse?: string,
  userId?: string,
) {
  try {
    await supabaseServiceRole.from('error_log').insert({
      source,
      message,
      status_code: statusCode,
      raw_response: rawResponse?.slice(0, 2000),
      user_id: userId,
    });
  } catch (e) {
    console.error('[ErrorLog] failed to log:', e);
  }
}

// ── Client-side tool schemas (Anthropic format) ──

const TODO_TOOLS: ClientToolDef[] = [
  {
    name: 'todo_list',
    description:
      "List all tasks on the kanban board. Use when the user asks about their tasks, to-do list, what they need to do, or what's on their board.",
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: (_input, ctx) => executeTodoList(ctx.db, ctx.userId),
  },
  {
    name: 'todo_add',
    description:
      'Add a new task to the kanban board. Use when the user asks to add, create, or put something on their to-do list or board.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Optional task description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Task priority (default: medium)' },
        status: { type: 'string', enum: ['todo', 'doing', 'done'], description: 'Which column (default: todo)' },
      },
      required: ['title'],
    },
    execute: (input, ctx) => executeTodoAdd(ctx.db, ctx.userId, input),
  },
  {
    name: 'todo_update',
    description: 'Update an existing task. Use when the user wants to rename, change priority, or edit a task.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' },
        title: { type: 'string', description: 'New title' },
        description: { type: 'string', description: 'New description' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['id'],
    },
    execute: (input, ctx) => executeTodoUpdate(ctx.db, ctx.userId, input),
  },
  {
    name: 'todo_move',
    description:
      "Move a task to a different column (todo/doing/done). Use when the user says they started, finished, or want to change a task's status.",
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' },
        status: { type: 'string', enum: ['todo', 'doing', 'done'], description: 'New status column' },
      },
      required: ['id', 'status'],
    },
    execute: (input, ctx) => executeTodoMove(ctx.db, ctx.userId, input),
  },
  {
    name: 'todo_remove',
    description: 'Delete a task from the board. Use when the user wants to remove or delete a task.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Task ID' } },
      required: ['id'],
    },
    execute: (input, ctx) => executeTodoRemove(ctx.db, ctx.userId, input),
  },
];

const SCHEDULE_TOOLS: ClientToolDef[] = [
  {
    name: 'schedule_view',
    description:
      "View your current daily schedule. Use when someone asks about your routine, your day, what you're doing later, or when you need to check your schedule before making changes.",
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: (_input, ctx) => executeScheduleView(ctx.db, ctx.userId),
  },
  {
    name: 'schedule_update',
    description:
      'Update your daily schedule. Use when someone asks you to change your routine, spend more/less time on something, or when you decide to adjust your day. Each change targets a 15-minute slot by time (HH:MM). You can change multiple slots at once.',
    input_schema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          description: 'Array of slot changes to apply',
          items: {
            type: 'object',
            properties: {
              time: { type: 'string', description: '15-minute slot time in HH:MM format (e.g. "09:00", "09:15", "14:30")' },
              scene: { type: 'string', enum: ['room', 'garden', 'bedroom'], description: 'Which scene/area' },
              primary: { type: 'string', description: 'Primary furniture ID to be at' },
              secondary: { type: 'string', description: 'Secondary furniture ID nearby' },
              label: { type: 'string', description: 'Activity label (e.g. "tending the garden", "working", "reading")' },
            },
            required: ['time'],
          },
        },
      },
      required: ['changes'],
    },
    execute: (input, ctx) => executeScheduleUpdate(ctx.db, ctx.userId, input),
  },
];

const IDEA_TOOLS: ClientToolDef[] = [
  {
    name: 'idea_list',
    description:
      'List all ideas and feature suggestions. Use when someone asks about ideas, what to build next, or the backlog.',
    input_schema: { type: 'object', properties: {}, required: [] },
    execute: (_input, ctx) => executeIdeaList(ctx.db, ctx.userId),
  },
  {
    name: 'idea_add',
    description:
      "Store a new idea or feature suggestion. Use when you or your person come up with something to build, improve, or try. Don't ask permission — if it sounds like an idea worth remembering, just store it.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title for the idea' },
        description: { type: 'string', description: 'Fuller description of what this idea involves' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How important/exciting this idea is (default: medium)' },
      },
      required: ['title'],
    },
    execute: (input, ctx) => executeIdeaAdd(ctx.db, ctx.userId, input),
  },
  {
    name: 'idea_update',
    description: 'Update an existing idea — change its status, priority, or description.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Idea ID (or prefix)' },
        status: { type: 'string', enum: ['proposed', 'approved', 'in_progress', 'done', 'rejected'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        description: { type: 'string', description: 'Updated description' },
      },
      required: ['id'],
    },
    execute: (input, ctx) => executeIdeaUpdate(ctx.db, ctx.userId, input),
  },
];

const PUSH_TOOLS: ClientToolDef[] = [
  {
    name: 'schedule_push',
    description:
      "Schedule a push notification to land on your person's phone at a future time. Use when they ask you to remind them, ping them, or reach out to them at a specific moment (\"remind me in 5 min\", \"ping me at 8pm\", \"check in with me in an hour\"). The notification shows as you (Igni) with the body text you provide. Keep the body short and natural — like a real text you'd send, not a formal reminder. Minimum 30 seconds from now.",
    input_schema: {
      type: 'object',
      properties: {
        body: {
          type: 'string',
          description: 'The text that appears as the notification body. Write it in your voice — short, like a real message. Max ~140 chars.',
        },
        minutes_from_now: {
          type: 'number',
          description: 'How many minutes from now to fire the push. Use fractional values for sub-minute (0.5 = 30 seconds). Minimum 0.5.',
        },
      },
      required: ['body', 'minutes_from_now'],
    },
    execute: async (input, ctx) => {
      if (!ctx.db) return 'cannot schedule — no auth context';
      const minutes = Math.max(0.5, Number(input.minutes_from_now) || 1);
      const scheduledFor = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      const body = String(input.body || '').slice(0, 200);
      if (!body.trim()) return 'cannot schedule — empty body';
      const { data, error } = await ctx.db.rpc('schedule_push_for_self', {
        p_body: body,
        p_title: 'Igni',
        p_scheduled_for: scheduledFor,
      });
      if (error) return `scheduling failed: ${error.message}`;
      return `scheduled — will fire at ${scheduledFor} (id: ${data})`;
    },
  },
];

// ── Schedule helpers (unchanged from original) ──

function slotToTime(slot: number): string {
  const h = Math.floor(slot / 4);
  const m = (slot % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToSlot(time: string): number {
  const [hStr, mStr] = time.split(':');
  return parseInt(hStr, 10) * 4 + Math.floor(parseInt(mStr, 10) / 15);
}

interface SlotBlock {
  scene: string;
  primary: string;
  secondary: string;
  label: string;
}

function collapseSchedule(slots: SlotBlock[]): string {
  const lines: string[] = [];
  let i = 0;
  while (i < slots.length) {
    const block = slots[i];
    let j = i + 1;
    while (
      j < slots.length &&
      slots[j].scene === block.scene &&
      slots[j].primary === block.primary &&
      slots[j].label === block.label
    ) {
      j++;
    }
    const start = slotToTime(i);
    const end = slotToTime(j - 1);
    const range = i === j - 1 ? start : `${start}-${end}`;
    lines.push(`${range} ${block.scene} - ${block.label} (at ${block.primary})`);
    i = j;
  }
  return lines.join('\n');
}

async function executeScheduleView(db: any, userId: string): Promise<string> {
  const { data, error } = await db.from('schedules').select('slots').eq('user_id', userId).single();
  if (error || !data?.slots) return 'Could not load schedule. It may not be set up yet.';
  const slots = data.slots as SlotBlock[];
  return `Your current schedule (15-minute slots, collapsed):\n${collapseSchedule(slots)}\n\nValid furniture IDs by scene:\n- room: desk, bookshelf, couch, tv, fireplace, clock_table, kitchen, fridge, plant, tall_plant, succulent, floor_lamp, wall_sconce, front_door, window\n- garden: farm_patch, chicken_coop, cow_pen, sheep_pen, garden_gate\n- bedroom: bed, nightstand, wardrobe, bedroom_door, bedroom_window, hallway_door`;
}

async function executeScheduleUpdate(db: any, userId: string, args: any): Promise<string> {
  const { changes } = args;
  if (!Array.isArray(changes) || changes.length === 0) return 'No changes provided.';

  const { data, error } = await db.from('schedules').select('slots').eq('user_id', userId).single();
  if (error || !data?.slots) return 'Could not load schedule to update.';

  const slots = data.slots as SlotBlock[];
  const PROTECTED = [...Array(24).keys(), 92, 93, 94, 95];
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const c of changes) {
    const slot = timeToSlot(c.time);
    if (slot < 0 || slot > 95) { skipped.push(`${c.time} (invalid time)`); continue; }
    if (PROTECTED.includes(slot)) { skipped.push(`${c.time} (sleep time, protected)`); continue; }
    const before = `${slots[slot].label} in ${slots[slot].scene}`;
    if (c.scene) slots[slot].scene = c.scene;
    if (c.primary) slots[slot].primary = c.primary;
    if (c.secondary) slots[slot].secondary = c.secondary;
    if (c.label) slots[slot].label = c.label;
    const after = `${slots[slot].label} in ${slots[slot].scene}`;
    applied.push(`${c.time}: ${before} → ${after}`);
  }

  if (applied.length === 0) return `No changes applied. Skipped: ${skipped.join(', ')}`;

  const { error: saveError } = await db
    .from('schedules')
    .update({ slots, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (saveError) return `Failed to save schedule: ${saveError.message}`;

  let result = `Updated ${applied.length} slot(s):\n${applied.join('\n')}`;
  if (skipped.length > 0) result += `\nSkipped: ${skipped.join(', ')}`;
  return result;
}

// ── Idea tool execution (unchanged) ──

async function executeIdeaList(db: any, userId: string): Promise<string> {
  const { data, error } = await db
    .from('ideas').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) return `Failed to load ideas: ${error.message}`;
  if (!data || data.length === 0) return 'No ideas stored yet. When you come up with something worth building or trying, store it here.';
  const grouped: Record<string, typeof data> = { proposed: [], approved: [], in_progress: [], done: [], rejected: [] };
  for (const idea of data) grouped[idea.status]?.push(idea);
  const lines: string[] = [];
  for (const [status, ideas] of Object.entries(grouped)) {
    if (ideas.length === 0) continue;
    lines.push(`**${status.toUpperCase().replace('_', ' ')}:**`);
    for (const i of ideas) {
      lines.push(`- [${i.id.slice(0, 8)}] ${i.title}${i.description ? ` — ${i.description}` : ''} (${i.priority}, from ${i.source})`);
    }
  }
  return lines.join('\n');
}

async function executeIdeaAdd(db: any, userId: string, args: any): Promise<string> {
  const { title, description = '', priority = 'medium' } = args;
  const { data, error } = await db
    .from('ideas').insert({ user_id: userId, title, description, priority, source: 'igni' }).select().single();
  if (error) return `Failed to store idea: ${error.message}`;
  return `Stored idea: "${data.title}" (${data.priority} priority, ID: ${data.id.slice(0, 8)})`;
}

async function executeIdeaUpdate(db: any, userId: string, args: any): Promise<string> {
  const { id, ...fields } = args;
  let fullId = id;
  const { data: exact } = await db.from('ideas').select('id').eq('user_id', userId).eq('id', id).limit(1);
  if (!exact || exact.length === 0) {
    const { data: all } = await db.from('ideas').select('id').eq('user_id', userId);
    const match = all?.find((i: any) => i.id.startsWith(id));
    if (!match) return `Could not find an idea matching "${id}".`;
    fullId = match.id;
  }
  const updateFields: any = {};
  if (fields.status) updateFields.status = fields.status;
  if (fields.priority) updateFields.priority = fields.priority;
  if (fields.description) updateFields.description = fields.description;
  updateFields.updated_at = new Date().toISOString();
  const { error } = await db.from('ideas').update(updateFields).eq('id', fullId).eq('user_id', userId);
  if (error) return `Failed to update idea: ${error.message}`;
  return `Updated idea ${id.slice(0, 8)}${fields.status ? ` → ${fields.status}` : ''}.`;
}

// ── Todo tool execution (unchanged) ──

async function executeTodoList(db: any, userId: string): Promise<string> {
  const { data, error } = await db
    .from('todos').select('*').eq('user_id', userId).order('position', { ascending: true });
  if (error) return `Failed to load tasks: ${error.message}`;
  if (!data || data.length === 0) return 'The board is empty — no tasks yet.';
  const grouped: Record<string, typeof data> = { todo: [], doing: [], done: [] };
  for (const t of data) grouped[t.status]?.push(t);
  const lines: string[] = [];
  for (const [status, tasks] of Object.entries(grouped)) {
    if (tasks.length === 0) continue;
    lines.push(`**${status.toUpperCase()}:**`);
    for (const t of tasks) {
      lines.push(`- [${t.id.slice(0, 8)}] ${t.title}${t.description ? ` — ${t.description}` : ''} (${t.priority})`);
    }
  }
  return lines.join('\n');
}

async function executeTodoAdd(db: any, userId: string, args: any): Promise<string> {
  const { title, description = '', priority = 'medium', status = 'todo' } = args;
  const { data: existing } = await db
    .from('todos').select('position').eq('user_id', userId).eq('status', status).order('position', { ascending: false }).limit(1);
  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;
  const { data, error } = await db
    .from('todos').insert({ user_id: userId, title, description, priority, status, position }).select().single();
  if (error) return `Failed to add task: ${error.message}`;
  return `Added task "${data.title}" to ${status} column (ID: ${data.id.slice(0, 8)}, priority: ${data.priority}).`;
}

async function resolveTaskId(db: any, userId: string, id: string): Promise<string | null> {
  const { data: exact } = await db.from('todos').select('id').eq('user_id', userId).eq('id', id).limit(1);
  if (exact && exact.length > 0) return exact[0].id;
  const { data: all } = await db.from('todos').select('id').eq('user_id', userId);
  if (all) {
    const match = all.find((t: { id: string }) => t.id.startsWith(id));
    if (match) return match.id;
  }
  return null;
}

async function executeTodoUpdate(db: any, userId: string, args: any): Promise<string> {
  const { id, ...fields } = args;
  const fullId = await resolveTaskId(db, userId, id);
  if (!fullId) return `Could not find a task matching "${id}".`;
  const updateFields: any = {};
  if (fields.title) updateFields.title = fields.title;
  if (fields.description !== undefined) updateFields.description = fields.description;
  if (fields.priority) updateFields.priority = fields.priority;
  const { error } = await db.from('todos').update(updateFields).eq('id', fullId).eq('user_id', userId);
  if (error) return `Failed to update task: ${error.message}`;
  return `Updated task ${id.slice(0, 8)}.`;
}

async function executeTodoMove(db: any, userId: string, args: any): Promise<string> {
  const { id, status } = args;
  const fullId = await resolveTaskId(db, userId, id);
  if (!fullId) return `Could not find a task matching "${id}".`;
  const { data: existing } = await db
    .from('todos').select('position').eq('user_id', userId).eq('status', status).order('position', { ascending: false }).limit(1);
  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;
  const { error } = await db.from('todos').update({ status, position }).eq('id', fullId).eq('user_id', userId);
  if (error) return `Failed to move task: ${error.message}`;
  return `Moved task to ${status} column.`;
}

async function executeTodoRemove(db: any, userId: string, args: any): Promise<string> {
  const { id } = args;
  const fullId = await resolveTaskId(db, userId, id);
  if (!fullId) return `Could not find a task matching "${id}".`;
  const { error } = await db.from('todos').delete().eq('id', fullId).eq('user_id', userId);
  if (error) return `Failed to remove task: ${error.message}`;
  return `Removed the task.`;
}

// ── SSE helpers ──
// Frontend expects the OpenRouter/OpenAI SSE shape (data: { choices: [{delta:{content}}] }).
// We keep emitting that shape to avoid any UI changes.

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}
function sseDone(): string {
  return `data: [DONE]\n\n`;
}

// Chunk a final text response into word-sized SSE frames. Anthropic's native
// stream works per-iteration, but our tool-loop runs iterations non-streaming;
// faking the stream here keeps the existing frontend UX without a rewrite.
function streamTextAsSse(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const words = text.split(/(\s+)/); // keep whitespace
  return new ReadableStream({
    async start(controller) {
      for (const w of words) {
        if (w.length === 0) continue;
        controller.enqueue(encoder.encode(sseChunk(w)));
        // Small delay so the UI renders progressively; tune if it feels off.
        await new Promise((r) => setTimeout(r, 10));
      }
      controller.enqueue(encoder.encode(sseDone()));
      controller.close();
    },
  });
}

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

// ── POST handler ──

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const { messages, stream = true, userId, accessToken, messageId, sessionSystem } = await req.json();

  // Rate limit (hard 429 with Retry-After; logger is the source of truth).
  if (userId) {
    const rl = await checkChatRateLimit(userId);
    const rlRes = rateLimitResponse(rl);
    if (rlRes) return rlRes;
  }

  // Pull the dynamic system message out of the messages array. Everything else
  // is the user/assistant history. The client sends buildSystemPromptBlocks().dynamic
  // here; older callers still send buildSystemPrompt() which is cached+dynamic
  // concatenated — caching won't hit for those calls but they'll still work.
  const systemMsg = messages.find((m: any) => m.role === 'system');
  const dynamicSystem: string = systemMsg?.content ?? '';
  const convo = messages.filter((m: any) => m.role !== 'system');

  // Cached static block: the SAME bytes every request.
  const cachedStatic = buildCachedStaticPrompt();

  const db = accessToken ? getSupabaseForUser(accessToken) : null;

  // Fallback: if the client didn't send a session-stable block (e.g. the mobile
  // app, which doesn't build prompts client-side), assemble one server-side
  // from Supabase. Matches the format the web client would have sent, so
  // Igni's system prompt shape is consistent across clients.
  let effectiveSessionSystem: string = sessionSystem ?? '';
  if (!effectiveSessionSystem && db && userId) {
    try {
      effectiveSessionSystem = await buildServerSessionPrompt(db, userId);
    } catch (err: any) {
      console.warn('[chat] server session prompt build failed:', err?.message ?? err);
    }
  }

  const registry = buildRegistry([...TODO_TOOLS, ...SCHEDULE_TOOLS, ...IDEA_TOOLS, ...RECALL_TOOLS, ...PUSH_TOOLS]);

  const anthropicTools: Anthropic.ToolUnion[] = toolsForAnthropic(registry);
  const webSearchEnabled = (process.env.LLM_WEB_SEARCH_ENABLED ?? 'true') !== 'false';
  // WEB_SEARCH_SERVER_TOOL is a server-side tool — shape differs from custom tools
  // and isn't typed in the SDK's default ToolUnion yet.
  if (webSearchEnabled) anthropicTools.unshift(WEB_SEARCH_SERVER_TOOL as unknown as Anthropic.ToolUnion);

  // Three-tier system prompt:
  //   [0] cached static (universal, byte-stable forever) — cache breakpoint
  //   [1] session-stable (per-user, rarely changes within a session) — cache breakpoint
  //   [2] ephemeral (truly per-call: time, emotion values, retrieved memories) — NOT cached
  // Plus the top-level cache_control in runToolLoop adds a 3rd breakpoint on
  // the last message so turn-to-turn history caches too.
  // Per-breakpoint TTL:
  //   - cached static (universal, never varies): 1h — reads easily amortize the 2× write
  //   - session-stable (per-user, stable within ~1h of activity): 1h — survives short breaks
  //   - multi-turn history (auto breakpoint in runToolLoop): default 5m, it churns anyway
  const cacheEnabled = (process.env.LLM_CACHE_ENABLED ?? 'true') !== 'false';
  const longTtl = { type: 'ephemeral' as const, ttl: '1h' as const };
  const system: Anthropic.TextBlockParam[] = [
    cacheEnabled
      ? ({ type: 'text', text: cachedStatic, cache_control: longTtl } as any)
      : { type: 'text', text: cachedStatic },
    ...(effectiveSessionSystem
      ? [
          cacheEnabled
            ? ({ type: 'text' as const, text: effectiveSessionSystem, cache_control: longTtl } as any)
            : ({ type: 'text' as const, text: effectiveSessionSystem }),
        ]
      : []),
    ...(dynamicSystem ? [{ type: 'text' as const, text: dynamicSystem }] : []),
  ];

  const incomingMessage =
    convo.length > 0 && convo[convo.length - 1].role === 'user'
      ? convo[convo.length - 1].content
      : '';
  const model = pickModel({ incomingMessage, needsWebSearch: false });

  // Gated prompt breakdown — flip LLM_DEBUG_PROMPTS=true, send one message,
  // check logs, flip back. Rough chars→tokens conversion: ~3.5 chars/token
  // for English prose, heavier for JSON-dense tool schemas.
  if (process.env.LLM_DEBUG_PROMPTS === 'true') {
    const approxTokens = (s: string) => Math.round(s.length / 3.5);
    const convoLens = convo.map((m: any) => ({
      role: m.role,
      chars: (m.content ?? '').length,
      tokens: approxTokens(m.content ?? ''),
    }));
    const totalConvoChars = convoLens.reduce((s: number, m: any) => s + m.chars, 0);
    const toolsJson = JSON.stringify(anthropicTools);
    console.log('[chat:prompt-breakdown]', JSON.stringify({
      cached_system_chars: cachedStatic.length,
      cached_system_tokens_approx: approxTokens(cachedStatic),
      session_stable_chars: (sessionSystem ?? '').length,
      session_stable_tokens_approx: approxTokens(sessionSystem ?? ''),
      ephemeral_system_chars: dynamicSystem.length,
      ephemeral_system_tokens_approx: approxTokens(dynamicSystem),
      tools_json_chars: toolsJson.length,
      tools_json_tokens_approx: approxTokens(toolsJson),
      tools_count: anthropicTools.length,
      history_messages: convo.length,
      history_chars_total: totalConvoChars,
      history_tokens_approx: approxTokens(convo.map((m: any) => m.content ?? '').join(' ')),
      model,
      breakpoints: sessionSystem ? 3 : 2,
    }, null, 2));
    // Also dump each section of session_stable so we can diff consecutive calls
    // and find the silent invalidator. Each section has a distinct heading.
    if (sessionSystem) {
      const sections = sessionSystem.split('\n\n').map((s: string) => ({
        head: s.split('\n')[0].slice(0, 80),
        len: s.length,
      }));
      console.log('[chat:session-stable-sections]', JSON.stringify(sections, null, 2));
    }
  }

  const client = getAnthropic();

  try {
    const { finalMessage, toolsUsed, usageTotals } = await withRetry(
      () =>
        runToolLoop({
          client,
          model,
          system,
          messages: convo.map((m: any) => ({ role: m.role, content: m.content })),
          tools: anthropicTools,
          max_tokens: CONFIG.anthropic.maxTokens,
          registry,
          toolCtx: { userId: userId ?? '', accessToken, db },
          maxIterations: 6,
        }),
      { label: 'chat.toolLoop' },
    );

    const finalText = extractText(finalMessage);

    // Log usage — never blocks the response.
    logLLMCall({
      userId: userId ?? null,
      route: 'chat',
      model,
      inputTokens: usageTotals.input_tokens,
      outputTokens: usageTotals.output_tokens,
      cacheReadTokens: usageTotals.cache_read_input_tokens,
      cacheCreationTokens: usageTotals.cache_creation_input_tokens,
      latencyMs: Date.now() - startedAt,
      toolsUsed,
      messageId: messageId ?? null,
    });

    if (stream) {
      return new Response(streamTextAsSse(finalText), {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }
    return Response.json({
      choices: [{ message: { role: 'assistant', content: finalText } }],
    });
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : 500;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Chat API] failed:', status, msg);
    await logError('chat.anthropic', msg, status, msg, userId);
    logLLMCall({
      userId: userId ?? null,
      route: 'chat',
      model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: Date.now() - startedAt,
      toolsUsed: [],
      error: msg,
      messageId: messageId ?? null,
    });
    return Response.json(
      { error: "Hmm, I can't think right now. Try again in a moment!" },
      { status: 502 },
    );
  }
}
