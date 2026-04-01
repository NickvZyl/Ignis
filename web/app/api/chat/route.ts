import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-sonnet-4-6';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabaseForUser(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

const HEADERS = {
  'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://ignis.app',
  'X-Title': 'Ignis',
};

const SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description:
      'Search the web for current information. Use when the user asks about recent events, facts you are unsure about, anything needing up-to-date information, or when they ask for recipes or cooking instructions — search for a good recipe.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
};

const TODO_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'todo_list',
      description: 'List all tasks on the kanban board. Use when the user asks about their tasks, to-do list, what they need to do, or what\'s on their board.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'todo_add',
      description: 'Add a new task to the kanban board. Use when the user asks to add, create, or put something on their to-do list or board.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Optional task description' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Task priority (default: medium)' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'], description: 'Which column (default: todo)' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'todo_update',
      description: 'Update an existing task. Use when the user wants to rename, change priority, or edit a task.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
          title: { type: 'string', description: 'New title' },
          description: { type: 'string', description: 'New description' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'todo_move',
      description: 'Move a task to a different column (todo/doing/done). Use when the user says they started, finished, or want to change a task\'s status.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'], description: 'New status column' },
        },
        required: ['id', 'status'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'todo_remove',
      description: 'Delete a task from the board. Use when the user wants to remove or delete a task.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
        },
        required: ['id'],
      },
    },
  },
];

const SCHEDULE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'schedule_view',
      description: 'View your current daily schedule. Use when someone asks about your routine, your day, what you\'re doing later, or when you need to check your schedule before making changes.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'schedule_update',
      description: 'Update your daily schedule. Use when someone asks you to change your routine, spend more/less time on something, or when you decide to adjust your day. Each change targets a 15-minute slot by time (HH:MM). You can change multiple slots at once.',
      parameters: {
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
    },
  },
];

const IDEA_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'idea_list',
      description: 'List all ideas and feature suggestions. Use when someone asks about ideas, what to build next, or the backlog.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'idea_add',
      description: 'Store a new idea or feature suggestion. Use when you or your person come up with something to build, improve, or try. Don\'t ask permission — if it sounds like an idea worth remembering, just store it.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title for the idea' },
          description: { type: 'string', description: 'Fuller description of what this idea involves' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How important/exciting this idea is (default: medium)' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'idea_update',
      description: 'Update an existing idea — change its status, priority, or description.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Idea ID (or prefix)' },
          status: { type: 'string', enum: ['proposed', 'approved', 'in_progress', 'done', 'rejected'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          description: { type: 'string', description: 'Updated description' },
        },
        required: ['id'],
      },
    },
  },
];

// ── Schedule helpers for server-side ──

function slotToTime(slot: number): string {
  const h = Math.floor(slot / 4);
  const m = (slot % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToSlot(time: string): number {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  return h * 4 + Math.floor(m / 15);
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
    while (j < slots.length &&
      slots[j].scene === block.scene &&
      slots[j].primary === block.primary &&
      slots[j].label === block.label) {
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
  const { data, error } = await db
    .from('schedules')
    .select('slots')
    .eq('user_id', userId)
    .single();

  if (error || !data?.slots) return 'Could not load schedule. It may not be set up yet.';

  const slots = data.slots as SlotBlock[];
  return `Your current schedule (15-minute slots, collapsed):\n${collapseSchedule(slots)}\n\nValid furniture IDs by scene:\n- room: desk, bookshelf, couch, tv, fireplace, clock_table, kitchen, fridge, plant, tall_plant, succulent, floor_lamp, wall_sconce, front_door, window\n- garden: farm_patch, chicken_coop, cow_pen, sheep_pen, garden_gate\n- bedroom: bed, nightstand, wardrobe, bedroom_door, bedroom_window, hallway_door`;
}

async function executeScheduleUpdate(db: any, userId: string, args: any): Promise<string> {
  const { changes } = args;
  if (!Array.isArray(changes) || changes.length === 0) return 'No changes provided.';

  // Load current schedule
  const { data, error } = await db
    .from('schedules')
    .select('slots')
    .eq('user_id', userId)
    .single();

  if (error || !data?.slots) return 'Could not load schedule to update.';

  const slots = data.slots as SlotBlock[];
  const PROTECTED = [...Array(24).keys(), 92, 93, 94, 95]; // sleep: 00:00-05:45, 23:00-23:45
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

  // Save back
  const { error: saveError } = await db
    .from('schedules')
    .update({ slots, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (saveError) return `Failed to save schedule: ${saveError.message}`;

  let result = `Updated ${applied.length} slot(s):\n${applied.join('\n')}`;
  if (skipped.length > 0) result += `\nSkipped: ${skipped.join(', ')}`;
  return result;
}

// ── Idea tool execution ──

async function executeIdeaList(db: any, userId: string): Promise<string> {
  const { data, error } = await db
    .from('ideas')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

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
    .from('ideas')
    .insert({ user_id: userId, title, description, priority, source: 'igni' })
    .select()
    .single();

  if (error) return `Failed to store idea: ${error.message}`;
  return `Stored idea: "${data.title}" (${data.priority} priority, ID: ${data.id.slice(0, 8)})`;
}

async function executeIdeaUpdate(db: any, userId: string, args: any): Promise<string> {
  const { id, ...fields } = args;

  // Try exact match first, then prefix
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

async function executeIdeaTool(db: any, name: string, args: any, userId: string): Promise<string> {
  switch (name) {
    case 'idea_list': return executeIdeaList(db, userId);
    case 'idea_add': return executeIdeaAdd(db, userId, args);
    case 'idea_update': return executeIdeaUpdate(db, userId, args);
    default: return `Unknown idea tool: ${name}`;
  }
}

async function openrouterFetch(body: any, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });

    if (response.ok || response.status < 500 || i === retries) {
      return response;
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error('Exhausted retries');
}

// ── Todo tool execution ──

async function executeTodoList(db: any, userId: string): Promise<string> {
  const { data, error } = await db
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true });

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

  // Calculate position
  const { data: existing } = await db
    .from('todos')
    .select('position')
    .eq('user_id', userId)
    .eq('status', status)
    .order('position', { ascending: false })
    .limit(1);

  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { data, error } = await db
    .from('todos')
    .insert({ user_id: userId, title, description, priority, status, position })
    .select()
    .single();

  if (error) return `Failed to add task: ${error.message}`;
  return `Added task "${data.title}" to ${status} column (ID: ${data.id.slice(0, 8)}, priority: ${data.priority}).`;
}

async function executeTodoUpdate(db: any, userId: string, args: any): Promise<string> {
  const { id, ...fields } = args;
  const fullId = await resolveTaskId(db, userId, id);
  if (!fullId) return `Could not find a task matching "${id}".`;

  const updateFields: any = {};
  if (fields.title) updateFields.title = fields.title;
  if (fields.description !== undefined) updateFields.description = fields.description;
  if (fields.priority) updateFields.priority = fields.priority;

  const { error } = await db
    .from('todos')
    .update(updateFields)
    .eq('id', fullId)
    .eq('user_id', userId);

  if (error) return `Failed to update task: ${error.message}`;
  return `Updated task ${id.slice(0, 8)}.`;
}

async function executeTodoMove(db: any, userId: string, args: any): Promise<string> {
  const { id, status } = args;
  const fullId = await resolveTaskId(db, userId, id);
  if (!fullId) return `Could not find a task matching "${id}".`;

  // Get new position
  const { data: existing } = await db
    .from('todos')
    .select('position')
    .eq('user_id', userId)
    .eq('status', status)
    .order('position', { ascending: false })
    .limit(1);

  const position = existing && existing.length > 0 ? existing[0].position + 1 : 0;

  const { error } = await db
    .from('todos')
    .update({ status, position })
    .eq('id', fullId)
    .eq('user_id', userId);

  if (error) return `Failed to move task: ${error.message}`;
  return `Moved task to ${status} column.`;
}

async function executeTodoRemove(db: any, userId: string, args: any): Promise<string> {
  const { id } = args;
  const fullId = await resolveTaskId(db, userId, id);
  if (!fullId) return `Could not find a task matching "${id}".`;

  const { error } = await db
    .from('todos')
    .delete()
    .eq('id', fullId)
    .eq('user_id', userId);

  if (error) return `Failed to remove task: ${error.message}`;
  return `Removed the task.`;
}

// Resolve a short ID prefix or full UUID to the full task ID
async function resolveTaskId(db: any, userId: string, id: string): Promise<string | null> {
  // Try exact match first
  const { data: exact } = await db
    .from('todos')
    .select('id')
    .eq('user_id', userId)
    .eq('id', id)
    .limit(1);

  if (exact && exact.length > 0) return exact[0].id;

  // Try prefix match
  const { data: all } = await db
    .from('todos')
    .select('id')
    .eq('user_id', userId);

  if (all) {
    const match = all.find((t: { id: string }) => t.id.startsWith(id));
    if (match) return match.id;
  }

  return null;
}

async function executeTodoTool(db: any, name: string, args: any, userId: string): Promise<string> {
  switch (name) {
    case 'todo_list': return executeTodoList(db, userId);
    case 'todo_add': return executeTodoAdd(db, userId, args);
    case 'todo_update': return executeTodoUpdate(db, userId, args);
    case 'todo_move': return executeTodoMove(db, userId, args);
    case 'todo_remove': return executeTodoRemove(db, userId, args);
    default: return `Unknown todo tool: ${name}`;
  }
}

async function executeSearch(query: string): Promise<string> {
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        model: 'perplexity/sonar',
        messages: [{ role: 'user', content: query }],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      return `Search failed (${response.status}). Answer based on your existing knowledge.`;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    let result = content;
    if (citations.length > 0) {
      result += '\n\nSources:\n' + citations.map((url: string, i: number) => `[${i + 1}] ${url}`).join('\n');
    }

    return result || `Search for "${query}" returned no results. Answer based on your knowledge.`;
  } catch {
    return `Search failed. Answer based on your existing knowledge.`;
  }
}

export async function POST(req: NextRequest) {
  const { messages, stream = true, userId, accessToken } = await req.json();

  // Create user-scoped Supabase client for todo operations
  const db = accessToken ? getSupabaseForUser(accessToken) : null;

  const allTools = [SEARCH_TOOL, ...TODO_TOOLS, ...SCHEDULE_TOOLS, ...IDEA_TOOLS];

  // Multi-turn tool loop: keep calling until the model stops requesting tools (max 5 rounds)
  const runningMessages = [...messages];
  const allToolResults: string[] = []; // track todo results for the final follow-up

  for (let round = 0; round < 5; round++) {
    const response = await openrouterFetch({
      model: MODEL, messages: runningMessages, temperature: 0.85, max_tokens: 1024,
      tools: allTools,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Chat API] round', round, 'failed:', response.status, error);
      return new Response(error, { status: response.status });
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const toolCalls = choice?.message?.tool_calls || [];

    if (toolCalls.length === 0) {
      // No more tool calls — model produced a final text response
      // If we did todo tools in previous rounds, the model may have empty content
      // because of the OpenRouter/Claude issue. In that case, build a response.
      const content = choice?.message?.content || '';

      if (!content && allToolResults.length > 0) {
        // Model returned empty after tool rounds — generate a follow-up
        console.log('[Chat API] Empty content after tool rounds, generating follow-up');
        const followUpMessages = [
          ...messages,
          {
            role: 'assistant' as const,
            content: '(used tools)',
          },
          {
            role: 'user' as const,
            content: `[SYSTEM — not from the user] The tool actions completed:\n${allToolResults.join('\n')}\nConfirm what you did briefly and naturally.`,
          },
        ];

        const finalResponse = await openrouterFetch({
          model: MODEL, messages: followUpMessages, temperature: 0.85, max_tokens: 1024, stream: stream,
        });
        if (!finalResponse.ok) {
          const error = await finalResponse.text();
          return new Response(error, { status: finalResponse.status });
        }
        if (stream) {
          return new Response(finalResponse.body, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          });
        }
        return new Response(finalResponse.body, { headers: { 'Content-Type': 'application/json' } });
      }

      // Normal text response
      if (stream) {
        const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(sseData, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        });
      }
      return Response.json(data);
    }

    // Execute all tool calls in this round
    console.log('[Chat API] Round', round, 'tool calls:', toolCalls.map((tc: any) => tc.function.name).join(', '));
    runningMessages.push(choice.message);

    for (const tc of toolCalls) {
      const args = JSON.parse(tc.function.arguments || '{}');
      let result: string;

      if (tc.function.name === 'web_search') {
        result = await executeSearch(args.query);
      } else if (tc.function.name.startsWith('todo_') && db && userId) {
        result = await executeTodoTool(db, tc.function.name, args, userId);
        allToolResults.push(result);
      } else if (tc.function.name === 'schedule_view' && db && userId) {
        result = await executeScheduleView(db, userId);
        allToolResults.push(result);
      } else if (tc.function.name === 'schedule_update' && db && userId) {
        result = await executeScheduleUpdate(db, userId, args);
        allToolResults.push(result);
      } else if (tc.function.name.startsWith('idea_') && db && userId) {
        result = await executeIdeaTool(db, tc.function.name, args, userId);
        allToolResults.push(result);
      } else {
        result = `Unknown tool: ${tc.function.name}`;
      }

      console.log('[Chat API]', tc.function.name, '→', result.slice(0, 150));
      runningMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
    // Loop continues — model gets tool results and can call more tools or respond
  }

  // Safety: if we exhausted rounds, return what we have
  return new Response('Too many tool rounds', { status: 500 });
}
