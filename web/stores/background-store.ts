import { create } from 'zustand';
import { supabase } from '@web/lib/supabase';
import { api } from '@web/lib/api';
import { buildActivityPrompt } from '@/lib/reflection-engine';
import { useCompanionStore } from './companion-store';
import { useChatStore } from './chat-store';
import type { SelfMemory, Memory } from '@/types';

const ACTIVITY_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20 hours per activity type

// Activities that produce real background output
const REAL_ACTIVITIES = [
  'reading', 'working', 'tending the garden', 'feeding animals',
  'checking on animals', 'relaxing', 'winding down', 'evening rounds',
];

interface BackgroundState {
  lastActivityRun: Record<string, number>; // activity_label → timestamp
  isRunning: boolean;

  runBackgroundActivity: (userId: string, label: string, furniture: string, scene: string) => Promise<void>;
}

export const useBackgroundStore = create<BackgroundState>((set, get) => ({
  lastActivityRun: {},
  isRunning: false,

  runBackgroundActivity: async (userId: string, label: string, furniture: string, scene: string) => {
    const { lastActivityRun, isRunning } = get();

    // Check if this is a real activity
    const matchedActivity = REAL_ACTIVITIES.find(a => label.includes(a) || a.includes(label));
    if (!matchedActivity || isRunning) return;

    // Check per-activity cooldown
    const lastRun = lastActivityRun[matchedActivity] || 0;
    if (Date.now() - lastRun < ACTIVITY_COOLDOWN_MS) return;

    set({ isRunning: true });
    console.log(`[Background] starting activity: ${matchedActivity} at ${furniture} in ${scene}`);

    try {
      // Gather context
      const emotionalState = useCompanionStore.getState().emotionalState;
      const emotion = emotionalState?.active_emotion ?? 'calm';

      // Load recent self-memories
      const { data: selfMemsData } = await supabase
        .from('self_memories')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      const selfMems = (selfMemsData || []) as SelfMemory[];

      // Load user memories
      const { data: userMemsData } = await supabase
        .from('memories')
        .select('*')
        .eq('user_id', userId)
        .order('importance', { ascending: false })
        .limit(5);
      const userMems = (userMemsData || []) as Memory[];

      // Get recent conversation topics
      const messages = useChatStore.getState().messages;
      const recentTopics = messages
        .filter(m => m.role === 'user')
        .slice(-4)
        .map(m => m.content.slice(0, 80));

      // Build prompt
      const prompt = buildActivityPrompt(
        matchedActivity, furniture, scene,
        selfMems, userMems, emotion, recentTopics,
      );

      if (!prompt) {
        console.log(`[Background] no prompt for activity: ${matchedActivity}`);
        return;
      }

      // Call API
      const res = await fetch(api('/api/reflect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        console.error('[Background] API failed:', res.status);
        return;
      }

      const data = await res.json();
      const raw = data.content;
      console.log(`[Background] ${matchedActivity} response:`, raw);

      if (!raw) return;

      // Parse response
      let parsed: { outputs: Array<{ content: string; importance: number }> };
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
        console.error('[Background] failed to parse:', raw.slice(0, 200));
        return;
      }

      // Store outputs as self-memories
      if (Array.isArray(parsed.outputs)) {
        for (const output of parsed.outputs.slice(0, 2)) {
          const { error } = await supabase.from('self_memories').insert({
            user_id: userId,
            content: output.content,
            memory_type: 'observation',
            importance: Math.min(0.7, Math.max(0.4, output.importance)),
            context: {
              hour: new Date().getHours(),
              slot: 0,
              scene,
              furniture,
              activity: matchedActivity,
              emotion,
              valence: emotionalState?.valence ?? 0.5,
            },
            emotion_primary: emotionalState?.active_emotion ?? null,
            emotion_secondary: emotionalState?.secondary_emotion ?? null,
            valence_at_creation: emotionalState?.valence ?? null,
            arousal_at_creation: emotionalState?.arousal ?? null,
          });
          if (error) {
            console.error('[Background] insert failed:', error);
          } else {
            console.log(`[Background] saved from ${matchedActivity}:`, output.content);
          }
        }
      }

      // Update cooldown
      set({
        lastActivityRun: { ...get().lastActivityRun, [matchedActivity]: Date.now() },
      });

      console.log(`[Background] ${matchedActivity} complete`);
    } catch (err) {
      console.error('[Background] failed:', err);
    } finally {
      set({ isRunning: false });
    }
  },
}));
