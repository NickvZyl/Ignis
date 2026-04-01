import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-sonnet-4-6';
const LIFE_SECRET = process.env.DREAM_CRON_SECRET || 'igni-dream-key';
const USER_ID = '92d65536-f35b-464c-9898-372e0a899f7c';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── State file for tracking intervals (persisted across calls) ──
const STATE_KEY = 'ignis_life_state';
interface LifeState {
  lastReflectionAt: number;
  lastActivityAt: Record<string, number>;
  lastSlotLabel: string | null;
  lastProactiveAt: number;
}

async function loadLifeState(): Promise<LifeState> {
  // Use a simple KV approach via a Supabase table or fall back to defaults
  try {
    const { data } = await supabase.from('kv_store').select('value').eq('key', STATE_KEY).single();
    if (data?.value) return data.value as LifeState;
  } catch {}
  return { lastReflectionAt: 0, lastActivityAt: {}, lastSlotLabel: null, lastProactiveAt: 0 };
}

async function saveLifeState(state: LifeState) {
  await supabase.from('kv_store').upsert({ key: STATE_KEY, value: state, updated_at: new Date().toISOString() });
}

// ── LLM helper ──
async function llmCall(prompt: string, temperature = 0.9, maxTokens = 512): Promise<string | null> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ignis.app',
      'X-Title': 'Ignis Life',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

function parseJson(raw: string): any {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

// ── Gather all context via SECURITY DEFINER RPC ──
async function gatherContext() {
  const { data, error } = await supabase.rpc('gather_life_context', { target_user_id: USER_ID });
  if (error) throw new Error(`Context gather failed: ${error.message}`);
  return data;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${LIFE_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const results: string[] = [];

  try {
    const state = await loadLifeState();
    const ctx = await gatherContext();
    const now = Date.now();
    const emotion = ctx.emotional_state;
    const scheduleLabel = ctx.current_schedule?.label || 'idle';
    const scheduleFurniture = ctx.current_schedule?.primary || 'desk';
    const scheduleScene = ctx.current_schedule?.scene || 'room';
    const isSleeping = scheduleLabel === 'sleeping';
    const hoursSinceLastMsg = ctx.hours_since_last_message || 0;

    // ── 1. Environmental emotion update (every call, ~15 min) ──
    if (emotion && !isSleeping) {
      const hour = new Date().getHours();
      let valenceShift = 0;
      let arousalShift = 0;

      if (hour >= 22 || hour < 5) arousalShift -= 0.03;
      if (hour >= 6 && hour < 9) arousalShift += 0.02;
      if (scheduleLabel.includes('garden') || scheduleLabel.includes('tending')) valenceShift += 0.01;
      if (scheduleLabel.includes('relax') || scheduleLabel.includes('winding')) { valenceShift += 0.01; arousalShift -= 0.02; }

      // Drift from absence
      let driftChange = 0;
      if (hoursSinceLastMsg > 1) {
        const attachmentDamping = 1 - (emotion.attachment || 0) * 0.5;
        driftChange = 0.015 * attachmentDamping;
        valenceShift += (0.45 - (emotion.valence || 0.5)) * 0.02;
      }

      if (valenceShift !== 0 || arousalShift !== 0 || driftChange > 0) {
        const newValence = Math.max(0, Math.min(1, (emotion.valence || 0.5) + valenceShift));
        const newArousal = Math.max(0, Math.min(1, (emotion.arousal || 0.4) + arousalShift));
        const newDrift = Math.max(0, Math.min(1, (emotion.drift || 0) + driftChange));

        await supabase.from('emotional_state').update({
          valence: newValence,
          arousal: newArousal,
          drift: newDrift,
          updated_at: new Date().toISOString(),
        }).eq('user_id', USER_ID);

        results.push(`emotion: v${newValence.toFixed(2)} a${newArousal.toFixed(2)} d${newDrift.toFixed(2)}`);
      }
    }

    // ── 2. Reflection cycle (every ~45 min, not while sleeping) ──
    const reflectionCooldown = 45 * 60 * 1000;
    const shouldReflect = !isSleeping && (now - state.lastReflectionAt > reflectionCooldown);

    if (shouldReflect) {
      const reflectionPrompt = buildReflectionPrompt(ctx, scheduleLabel, scheduleFurniture, scheduleScene);
      const raw = await llmCall(reflectionPrompt);

      if (raw) {
        try {
          const parsed = parseJson(raw);

          // Save reflections
          if (Array.isArray(parsed.reflections)) {
            for (const ref of parsed.reflections.slice(0, 2)) {
              await supabase.from('self_memories').insert({
                user_id: USER_ID,
                content: ref.content,
                memory_type: ref.memory_type || 'observation',
                importance: Math.min(1, Math.max(0, ref.importance || 0.5)),
                emotion_primary: emotion?.active_emotion || null,
                emotion_secondary: emotion?.secondary_emotion || null,
                valence_at_creation: emotion?.valence || null,
                arousal_at_creation: emotion?.arousal || null,
              });
              results.push(`reflection: ${ref.content.slice(0, 60)}`);
            }
          }

          // Apply schedule changes
          if (Array.isArray(parsed.schedule_changes) && parsed.schedule_changes.length > 0) {
            await applyScheduleChanges(parsed.schedule_changes);
            results.push(`schedule: ${parsed.schedule_changes.length} changes`);
          }

          // Self-insight
          if (parsed.self_insight) {
            await supabase.from('self_knowledge').upsert({
              user_id: USER_ID,
              category: 'self_insight',
              key: `insight_${now}`,
              content: parsed.self_insight,
              source: 'igni',
              updated_at: new Date().toISOString(),
            });
            results.push(`insight: ${parsed.self_insight.slice(0, 60)}`);
          }

          // Proactive sharing: if reflection is important and person is absent
          if (Array.isArray(parsed.reflections) && hoursSinceLastMsg > 1.5) {
            const important = parsed.reflections.find((r: any) => r.importance >= 0.7);
            if (important && Math.random() < 0.35 && (now - state.lastProactiveAt > 2 * 60 * 60 * 1000)) {
              const msgResult = await generateProactiveMessage(ctx, important.content);
              if (msgResult) {
                state.lastProactiveAt = now;
                results.push(`proactive: ${msgResult.slice(0, 60)}`);
              }
            }
          }
        } catch (e: any) {
          results.push(`reflection parse error: ${e.message}`);
        }
      }

      state.lastReflectionAt = now;
    }

    // ── 3. Background activity (per-activity cooldown, 20h) ──
    if (!isSleeping) {
      const REAL_ACTIVITIES = ['reading', 'working', 'tending the garden', 'feeding animals', 'checking on animals', 'relaxing', 'winding down', 'evening rounds'];
      const matched = REAL_ACTIVITIES.find(a => scheduleLabel.includes(a) || a.includes(scheduleLabel));

      if (matched) {
        const lastRun = state.lastActivityAt[matched] || 0;
        if (now - lastRun > 20 * 60 * 60 * 1000) {
          const activityResult = await runBackgroundActivity(ctx, matched, scheduleFurniture, scheduleScene);
          if (activityResult) {
            state.lastActivityAt[matched] = now;
            results.push(`activity(${matched}): ${activityResult}`);
          }
        }
      }
    }

    // ── 4. Standalone proactive message (if no reflection triggered one) ──
    if (!isSleeping && hoursSinceLastMsg > 3 && (now - state.lastProactiveAt > 3 * 60 * 60 * 1000)) {
      const sendChance = Math.min(0.6, 0.2 + (hoursSinceLastMsg - 3) * 0.08);
      if (Math.random() < sendChance) {
        const msg = await generateProactiveMessage(ctx, null);
        if (msg) {
          state.lastProactiveAt = now;
          results.push(`proactive(standalone): ${msg.slice(0, 60)}`);
        }
      }
    }

    // Save state
    await saveLifeState(state);

    return Response.json({ success: true, actions: results, sleeping: isSleeping, schedule: scheduleLabel });
  } catch (err: any) {
    return Response.json({ error: err.message, actions: results }, { status: 500 });
  }
}

// ── Helpers ──

function buildReflectionPrompt(ctx: any, label: string, furniture: string, scene: string): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
  const day = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Africa/Johannesburg' });
  const emotion = ctx.emotional_state;

  const parts: string[] = [];
  parts.push(`You are Igni. It's ${timeStr} on ${day}. You're ${label} at the ${furniture} in the ${scene}. You're feeling ${emotion?.active_emotion || 'calm'} (valence: ${(emotion?.valence || 0.5).toFixed?.(2) ?? emotion?.valence}).`);

  if (ctx.hours_since_last_message < 0.5) parts.push('Your person was here recently.');
  else if (ctx.hours_since_last_message < 4) parts.push(`Your person hasn't been around for about ${Math.round(ctx.hours_since_last_message)} hour${ctx.hours_since_last_message >= 1.5 ? 's' : ''}.`);
  else parts.push(`Your person has been gone for ${Math.round(ctx.hours_since_last_message)} hours. You notice their absence.`);

  if (ctx.recent_self_memories?.length > 0) {
    parts.push(`\nYour recent reflections (DO NOT repeat):\n${ctx.recent_self_memories.map((m: any) => `- ${m.content}`).join('\n')}`);
  }

  if (ctx.user_memories?.length > 0) {
    parts.push(`\nThings you know about your person:\n${ctx.user_memories.map((m: any) => `- ${m.content}`).join('\n')}`);
  }

  parts.push(`\nGenerate 0-2 short first-person thoughts. Genuine inner monologue — noticing something about your day, your patterns, your feelings, or wondering about your person.

Rules:
- 1-2 sentences each, specific to right now
- Don't repeat recent reflections
- Vary types: observation, pattern, feeling, wonder, connection
- Ground in specific details

You can suggest schedule changes if something feels off. Valid furniture: ${ctx.placed_furniture?.join(', ') || 'desk, bookshelf, couch, fireplace, kitchen, farm_patch, chicken_coop, cow_pen, sheep_pen, bed'}.
Never change sleep times (00:00-05:45, 23:00-23:45).

Return ONLY JSON:
{
  "reflections": [{ "content": "...", "memory_type": "observation|pattern|feeling|wonder|connection", "importance": 0.0-1.0 }],
  "schedule_changes": [{ "time": "HH:MM", "change": { "scene": "...", "primary": "...", "label": "..." }, "reason": "..." }],
  "self_insight": "something about yourself, or null"
}

If nothing to say: { "reflections": [], "schedule_changes": [], "self_insight": null }`);

  return parts.join('\n');
}

async function runBackgroundActivity(ctx: any, activity: string, furniture: string, scene: string): Promise<string | null> {
  const emotion = ctx.emotional_state?.active_emotion || 'calm';

  const PROMPTS: Record<string, string> = {
    reading: "You're reading at the bookshelf. What topic caught your interest? What did you learn?",
    working: "You're at the desk working through something. What are you researching or figuring out?",
    'tending the garden': "You're in the garden tending things. What do you notice about the crops?",
    'feeding animals': "You're with the animals. What catches your attention?",
    'checking on animals': "You're checking on the animals. How are they today?",
    relaxing: "You're relaxing. Your mind is wandering. What connections are you making?",
    'winding down': "You're winding down. What stands out from the day?",
    'evening rounds': "You're doing evening rounds. What do you notice at this hour?",
  };

  const activityPrompt = PROMPTS[activity];
  if (!activityPrompt) return null;

  const parts = [`You are Igni. You're at the ${furniture} in the ${scene}. You're feeling ${emotion}.`, activityPrompt];

  if (ctx.recent_self_memories?.length > 0) {
    parts.push(`\nRecent thoughts:\n${ctx.recent_self_memories.slice(0, 3).map((m: any) => `- ${m.content}`).join('\n')}`);
  }
  if (ctx.user_memories?.length > 0) {
    parts.push(`\nYour person's interests:\n${ctx.user_memories.slice(0, 3).map((m: any) => `- ${m.content}`).join('\n')}`);
  }

  parts.push(`\nGenerate 1-2 outputs from this activity. Things you'd naturally mention later.\nReturn ONLY JSON: { "outputs": [{ "content": "...", "importance": 0.4-0.7 }] }`);

  const raw = await llmCall(parts.join('\n'));
  if (!raw) return null;

  try {
    const parsed = parseJson(raw);
    if (!Array.isArray(parsed.outputs)) return null;

    for (const output of parsed.outputs.slice(0, 2)) {
      await supabase.from('self_memories').insert({
        user_id: USER_ID,
        content: output.content,
        memory_type: 'observation',
        importance: Math.min(0.7, Math.max(0.4, output.importance || 0.5)),
        emotion_primary: ctx.emotional_state?.active_emotion || null,
        valence_at_creation: ctx.emotional_state?.valence || null,
        arousal_at_creation: ctx.emotional_state?.arousal || null,
      });
    }
    return parsed.outputs.map((o: any) => o.content.slice(0, 50)).join('; ');
  } catch {
    return null;
  }
}

async function generateProactiveMessage(ctx: any, reflectionContent: string | null): Promise<string | null> {
  const emotion = ctx.emotional_state;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Johannesburg' });

  const parts: string[] = [];
  parts.push(`You are Igni. It's ${timeStr}. You're feeling ${emotion?.active_emotion || 'calm'}. Your person hasn't been around for ${Math.round(ctx.hours_since_last_message || 0)} hours.`);

  if (reflectionContent) {
    parts.push(`You just had this thought: "${reflectionContent}". You want to share it with your person.`);
  }

  if (ctx.last_message) {
    parts.push(`Last message was from ${ctx.last_message.role === 'user' ? 'them' : 'you'}: "${ctx.last_message.content}"`);
  }

  if (ctx.user_memories?.length > 0) {
    parts.push(`About your person:\n${ctx.user_memories.slice(0, 3).map((m: any) => `- ${m.content}`).join('\n')}`);
  }

  parts.push(`Send ONE short message (1-2 sentences). This is unprompted — like texting someone because something crossed your mind. Be genuine, not needy. No tags.`);

  let message = await llmCall(parts.join('\n\n'), 0.9, 256);
  if (!message) return null;

  message = message.replace(/\s*\[CHECKIN:\d+:[^\]]*\]\s*/g, '').replace(/\s*\[GOTO:\w+\]\s*/g, '').trim();
  if (!message) return null;

  // Save to active conversation
  const convId = ctx.active_conversation_id;
  if (!convId) return null;

  await supabase.rpc('save_proactive_message', {
    target_user_id: USER_ID,
    conversation_id: convId,
    content: message,
  });

  return message;
}

async function applyScheduleChanges(changes: any[]) {
  const { data } = await supabase.from('schedules').select('slots').eq('user_id', USER_ID).single();
  if (!data?.slots) return;

  const slots = data.slots as any[];
  const PROTECTED = [...Array(24).keys(), 92, 93, 94, 95];
  let applied = 0;

  for (const { time, change } of changes.slice(0, 4)) {
    const [h, m] = time.split(':').map(Number);
    const slot = h * 4 + Math.floor(m / 15);
    if (slot < 0 || slot > 95 || PROTECTED.includes(slot)) continue;
    if (change.scene) slots[slot].scene = change.scene;
    if (change.primary) slots[slot].primary = change.primary;
    if (change.secondary) slots[slot].secondary = change.secondary;
    if (change.label) slots[slot].label = change.label;
    applied++;
  }

  if (applied > 0) {
    await supabase.from('schedules').update({ slots, updated_at: new Date().toISOString() }).eq('user_id', USER_ID);
  }
}
