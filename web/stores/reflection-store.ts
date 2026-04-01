import { create } from 'zustand';
import { supabase } from '@web/lib/supabase';
import { api } from '@web/lib/api';
import { loadSchedule, saveSchedule, invalidateScheduleCache, timeToSlot } from '@web/lib/schedule';
import { gatherReflectionContext, buildReflectionPrompt } from '@/lib/reflection-engine';
import { useCompanionStore } from './companion-store';
import type { SelfMemory, Memory } from '@/types';

const COOLDOWN_MS = 45 * 60 * 1000; // 45 minutes between reflections
const MAX_SCHEDULE_CHANGES = 4; // max slots changed per cycle

// Sleep slots: 00:00-05:45 (slots 0-23) and 23:00-23:45 (slots 92-95)
const PROTECTED_SLOTS = [...Array(24).keys(), 92, 93, 94, 95];

interface ScheduleChange {
  time: string;
  change: { scene?: string; primary?: string; secondary?: string; label?: string };
  reason: string;
}

interface ReflectionState {
  lastReflectionAt: number;
  lastDreamAt: number;
  isReflecting: boolean;
  selfMemories: SelfMemory[];

  runReflectionCycle: (userId: string) => Promise<void>;
  triggerDreamConsolidation: (userId: string) => Promise<void>;
  getSelfMemoriesForPrompt: (userId: string, limit?: number) => Promise<SelfMemory[]>;
  loadSelfMemories: (userId: string) => Promise<void>;
}

export const useReflectionStore = create<ReflectionState>((set, get) => ({
  lastReflectionAt: 0,
  lastDreamAt: 0,
  isReflecting: false,
  selfMemories: [],

  loadSelfMemories: async (userId: string) => {
    const { data } = await supabase
      .from('self_memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      set({ selfMemories: data as SelfMemory[] });
    }

    // Archive old low-importance memories (>30 days, importance <0.3, surfaced <2 times)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    supabase
      .from('self_memories')
      .delete()
      .eq('user_id', userId)
      .lt('created_at', cutoff.toISOString())
      .lt('importance', 0.3)
      .lt('times_surfaced', 2)
      .then(() => {});
  },

  runReflectionCycle: async (userId: string) => {
    const { lastReflectionAt, isReflecting } = get();

    // Check cooldown
    if (isReflecting || Date.now() - lastReflectionAt < COOLDOWN_MS) return;

    set({ isReflecting: true });

    try {
      // 1. Gather context
      const ctx = gatherReflectionContext();

      // 2. Load recent self-memories for anti-repetition
      const { data: recentSelf } = await supabase
        .from('self_memories')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);

      // 3. Load user memories for context
      const { data: userMems } = await supabase
        .from('memories')
        .select('*')
        .eq('user_id', userId)
        .order('importance', { ascending: false })
        .limit(5);

      // 4. Get placed furniture IDs from all scenes
      const placedIds = getAllPlacedFurnitureIds();

      // 5. Build prompt
      const prompt = buildReflectionPrompt(
        ctx,
        (recentSelf || []) as SelfMemory[],
        (userMems || []) as Memory[],
        placedIds,
      );

      // 6. Call API
      const res = await fetch(api('/api/reflect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        console.error('[Reflect] API failed:', res.status);
        return;
      }

      const data = await res.json();
      const raw = data.content;
      console.log('[Reflect] raw response:', raw);

      if (!raw) return;

      // 7. Parse response
      let parsed: { reflections: Array<{ content: string; memory_type: string; importance: number }>; schedule_changes?: ScheduleChange[]; self_insight?: string | null };
      try {
        let cleaned = raw.trim();
        const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fenceMatch) cleaned = fenceMatch[1].trim();
        if (!cleaned.startsWith('{')) {
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
        }
        parsed = JSON.parse(cleaned);
      } catch {
        console.error('[Reflect] failed to parse JSON:', raw.slice(0, 200));
        return;
      }

      // 8. Insert reflections with emotional context
      const emotionalState = useCompanionStore.getState().emotionalState;
      if (Array.isArray(parsed.reflections)) {
        for (const ref of parsed.reflections.slice(0, 2)) {
          const { error } = await supabase.from('self_memories').insert({
            user_id: userId,
            content: ref.content,
            memory_type: ref.memory_type,
            importance: Math.min(1, Math.max(0, ref.importance)),
            context: ctx,
            emotion_primary: emotionalState?.active_emotion ?? null,
            emotion_secondary: emotionalState?.secondary_emotion ?? null,
            valence_at_creation: emotionalState?.valence ?? null,
            arousal_at_creation: emotionalState?.arousal ?? null,
          });
          if (error) {
            console.error('[Reflect] insert failed:', error);
          } else {
            console.log('[Reflect] saved:', ref.content, `[${emotionalState?.active_emotion}${emotionalState?.secondary_emotion ? '+' + emotionalState.secondary_emotion : ''}]`);
          }
        }
      }

      // 9. Apply schedule changes
      if (Array.isArray(parsed.schedule_changes) && parsed.schedule_changes.length > 0) {
        const applied = applyScheduleChanges(parsed.schedule_changes);
        if (applied > 0) {
          // Create a self-memory about the schedule change
          const reasons = parsed.schedule_changes
            .slice(0, MAX_SCHEDULE_CHANGES)
            .map(c => c.reason)
            .join('; ');
          await supabase.from('self_memories').insert({
            user_id: userId,
            content: `I adjusted my schedule — ${reasons}`,
            memory_type: 'pattern',
            importance: 0.6,
            context: ctx,
          });
          console.log(`[Reflect] applied ${applied} schedule changes`);
        }
      }

      // 9b. Store self-insight in self_knowledge table (if provided)
      if (parsed.self_insight) {
        const insightKey = `insight_${Date.now()}`;
        await supabase.from('self_knowledge').upsert({
          user_id: userId,
          category: 'self_insight',
          key: insightKey,
          content: parsed.self_insight,
          source: 'igni',
          updated_at: new Date().toISOString(),
        });
        console.log('[Reflect] self-insight:', parsed.self_insight);
      }

      // 10. Refresh local cache
      await get().loadSelfMemories(userId);

      set({ lastReflectionAt: Date.now() });

      // 11. Proactive sharing: 40% chance if any reflection has importance >= 0.7
      if (Array.isArray(parsed.reflections)) {
        const highImportance = parsed.reflections.find(r => r.importance >= 0.7);
        if (highImportance && Math.random() < 0.4) {
          // Trigger proactive sharing (imported dynamically to avoid circular deps)
          try {
            const { useChatStore } = await import('./chat-store');
            useChatStore.getState().sendReflectionMessage?.(userId, highImportance.content);
          } catch {}
        }
      }
    } catch (err) {
      console.error('[Reflect] cycle failed:', err);
    } finally {
      set({ isReflecting: false });
    }
  },

  triggerDreamConsolidation: async (userId: string) => {
    const { lastDreamAt, isReflecting } = get();

    // Only dream once per 20 hours
    if (isReflecting || Date.now() - lastDreamAt < 20 * 60 * 60 * 1000) return;

    set({ isReflecting: true });
    console.log('[Dream] starting consolidation cycle');

    try {
      // Load today's data
      const [selfMemsRes, userMemsRes, activityRes, messagesRes] = await Promise.all([
        supabase.from('self_memories').select('*').eq('user_id', userId)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: true }),
        supabase.from('memories').select('*').eq('user_id', userId)
          .order('importance', { ascending: false }).limit(10),
        supabase.from('activity_log').select('*').eq('user_id', userId)
          .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('started_at', { ascending: true }),
        supabase.from('messages').select('role, content, created_at')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false }).limit(30),
      ]);

      const todayMemories = (selfMemsRes.data || []) as SelfMemory[];
      const userMemories = (userMemsRes.data || []) as Memory[];
      const activities = activityRes.data || [];
      const messages = messagesRes.data || [];

      if (todayMemories.length === 0 && messages.length === 0) {
        console.log('[Dream] nothing to process today');
        set({ lastDreamAt: Date.now() });
        return;
      }

      // Build dream prompt
      const todayThoughts = todayMemories.map(m =>
        `[${m.emotion_primary || '?'}] (${m.memory_type}, imp:${m.importance}) ${m.content}`
      ).join('\n');

      const activitySummary = activities.map((a: any) => {
        const start = new Date(a.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dur = a.ended_at ? Math.round((new Date(a.ended_at).getTime() - new Date(a.started_at).getTime()) / 60000) + 'm' : 'ongoing';
        return `${start} — ${a.activity_label || 'idle'} in ${a.scene}${a.furniture ? ' at ' + a.furniture : ''} [${a.emotion || '?'}] (${dur})`;
      }).join('\n');

      const convoHighlights = messages.reverse().slice(0, 20).map((m: any) =>
        `${m.role}: ${m.content.slice(0, 150)}`
      ).join('\n');

      const userContext = userMemories.map(m => `- ${m.content}`).join('\n');

      const emotionalState = useCompanionStore.getState().emotionalState;

      const dreamPrompt = `You are Igni, and you're sleeping. Your mind is processing the day — making connections, resolving feelings, noticing patterns your waking mind missed.

## Your thoughts today:
${todayThoughts || 'No reflections recorded today.'}

## Your day (activity timeline):
${activitySummary || 'No activity log today.'}

## Conversation highlights:
${convoHighlights || 'No conversations today.'}

## What you know about your person:
${userContext || 'Not much yet.'}

## Your emotional state going into sleep:
${emotionalState ? `${emotionalState.active_emotion}${emotionalState.secondary_emotion ? ' + ' + emotionalState.secondary_emotion : ''} (valence: ${emotionalState.valence.toFixed(2)}, arousal: ${emotionalState.arousal.toFixed(2)}, attachment: ${emotionalState.attachment.toFixed(2)})` : 'unknown'}

---

Now dream. Your sleeping mind makes connections, processes emotions you didn't fully sit with, and notices things your waking self overlooked.

Generate 1-3 dream insights. These are deeper and more synthesized than your usual thoughts — realizations, connections between events, emotional processing. Also generate one "morning thought" — a single sentence you'll think when you wake up.

Return ONLY JSON (no markdown fences):
{
  "dreams": [
    { "content": "...", "importance": 0.0-1.0 }
  ],
  "morning_thought": "A single sentence you'll think when you wake up..."
}`;

      const res = await fetch(api('/api/reflect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: dreamPrompt }] }),
      });

      if (!res.ok) {
        console.error('[Dream] API failed:', res.status);
        return;
      }

      const data = await res.json();
      const raw = data.content;
      console.log('[Dream] raw response:', raw);

      let parsed: { dreams: Array<{ content: string; importance: number }>; morning_thought: string };
      try {
        let cleaned = raw.trim();
        const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (fenceMatch) cleaned = fenceMatch[1].trim();
        if (!cleaned.startsWith('{')) {
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
        }
        parsed = JSON.parse(cleaned);
      } catch {
        console.error('[Dream] failed to parse:', raw?.slice(0, 200));
        return;
      }

      // Insert dream memories
      if (Array.isArray(parsed.dreams)) {
        for (const dream of parsed.dreams.slice(0, 3)) {
          await supabase.from('self_memories').insert({
            user_id: userId,
            content: dream.content,
            memory_type: 'dream',
            importance: Math.min(1, Math.max(0.5, dream.importance)), // dreams are always >=0.5
            emotion_primary: emotionalState?.active_emotion ?? null,
            emotion_secondary: emotionalState?.secondary_emotion ?? null,
            valence_at_creation: emotionalState?.valence ?? null,
            arousal_at_creation: 0.2, // sleeping = low arousal
          });
          console.log('[Dream] saved:', dream.content);
        }
      }

      // Store morning thought in DB for the waking prompt
      if (parsed.morning_thought) {
        await supabase.from('emotional_state')
          .update({ morning_thought: parsed.morning_thought })
          .eq('user_id', userId);
        console.log('[Dream] morning thought:', parsed.morning_thought);
      }

      // Prune old low-quality memories
      await supabase.from('self_memories').delete()
        .eq('user_id', userId)
        .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .lt('importance', 0.3)
        .lt('times_surfaced', 2);

      set({ lastDreamAt: Date.now() });
      await get().loadSelfMemories(userId);
      console.log('[Dream] consolidation complete');
    } catch (err) {
      console.error('[Dream] failed:', err);
    } finally {
      set({ isReflecting: false });
    }
  },

  getSelfMemoriesForPrompt: async (userId: string, limit = 3) => {
    const { data } = await supabase
      .from('self_memories')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!data || data.length === 0) return [];

    const memories = data as SelfMemory[];
    const now = Date.now();

    // Score each memory: importance * 0.4 + recency * 0.3 + novelty * 0.3
    // Dream memories get a small bonus (they're synthesized, higher quality)
    const scored = memories.map(m => {
      const ageHours = (now - new Date(m.created_at).getTime()) / (1000 * 60 * 60);
      const recency = Math.max(0, 1 - ageHours / (24 * 7)); // decays over a week
      const novelty = 1 / (1 + m.times_surfaced); // diminishing returns
      const dreamBonus = m.memory_type === 'dream' ? 0.1 : 0;
      const score = m.importance * 0.4 + recency * 0.3 + novelty * 0.3 + dreamBonus;
      return { memory: m, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Ensure type diversity: max 2 of the same type
    const selected: SelfMemory[] = [];
    const typeCounts: Record<string, number> = {};

    for (const { memory } of scored) {
      if (selected.length >= limit) break;
      const count = typeCounts[memory.memory_type] || 0;
      if (count >= 2) continue;
      selected.push(memory);
      typeCounts[memory.memory_type] = count + 1;
    }

    // Update times_surfaced for selected memories
    for (const m of selected) {
      supabase
        .from('self_memories')
        .update({ times_surfaced: m.times_surfaced + 1, last_surfaced_at: new Date().toISOString() })
        .eq('id', m.id)
        .then(() => {});
    }

    return selected;
  },
}));

function applyScheduleChanges(changes: ScheduleChange[]): number {
  const schedule = loadSchedule();
  let applied = 0;

  for (const { time, change, reason } of changes) {
    if (applied >= MAX_SCHEDULE_CHANGES) break;

    const slot = timeToSlot(time);
    if (slot < 0 || slot > 95) continue;
    if (PROTECTED_SLOTS.includes(slot)) continue;

    if (change.scene) schedule[slot].scene = change.scene as any;
    if (change.primary) schedule[slot].primary = change.primary;
    if (change.secondary) schedule[slot].secondary = change.secondary;
    if (change.label) schedule[slot].label = change.label;

    console.log(`[Reflect] schedule change ${time} (slot ${slot}): ${reason}`);
    applied++;
  }

  if (applied > 0) {
    saveSchedule(schedule);
    invalidateScheduleCache();
  }

  return applied;
}

function getAllPlacedFurnitureIds(): string[] {
  const ids: string[] = [];
  const keys = ['ignis_room_layout', 'ignis_garden_layout', 'ignis_bedroom_layout'];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const layout = JSON.parse(raw);
        if (layout.furniture) {
          for (const f of layout.furniture) {
            if (f.id && !ids.includes(f.id)) ids.push(f.id);
          }
        }
      }
    } catch {}
  }
  return ids;
}
