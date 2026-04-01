import { create } from 'zustand';
import { supabase } from '@web/lib/supabase';
import { computeSessionStart, computePostMessage, computeEnvironmentalInfluence } from '@/lib/emotional-engine';
import type { EmotionalState, EmotionalSignals } from '@/types';

const DEFAULT_STATE: Omit<EmotionalState, 'id' | 'user_id' | 'updated_at'> = {
  valence: 0.6,
  arousal: 0.4,
  attachment: 0.0,
  drift: 0.0,
  active_emotion: 'calm',
  secondary_emotion: null,
  inner_conflict: null,
  morning_thought: null,
  active_role: null,
  last_interaction_at: new Date().toISOString(),
};

interface CompanionState {
  emotionalState: EmotionalState | null;
  loading: boolean;

  loadState: (userId: string) => Promise<void>;
  applySessionStart: () => Promise<void>;
  processMessage: (message: string) => Promise<EmotionalSignals | null>;
  applyEnvironment: (scheduleLabel: string, hour: number) => Promise<void>;
}

export const useCompanionStore = create<CompanionState>((set, get) => ({
  emotionalState: null,
  loading: false,

  loadState: async (userId: string) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('emotional_state')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        set({
          emotionalState: {
            ...DEFAULT_STATE,
            id: '',
            user_id: userId,
            updated_at: new Date().toISOString(),
          } as EmotionalState,
        });
        return;
      }

      if (error) throw error;
      set({ emotionalState: data });
    } finally {
      set({ loading: false });
    }
  },

  applySessionStart: async () => {
    const { emotionalState } = get();
    if (!emotionalState) return;

    const changes = computeSessionStart(emotionalState);
    if (Object.keys(changes).length === 0) return;

    const updated = { ...emotionalState, ...changes, updated_at: new Date().toISOString() };
    set({ emotionalState: updated });

    await supabase
      .from('emotional_state')
      .update(changes)
      .eq('user_id', emotionalState.user_id);

    // Trigger reflection after long absence (>4 hours)
    const hoursSince = (Date.now() - new Date(emotionalState.last_interaction_at).getTime()) / (1000 * 60 * 60);
    if (hoursSince > 4) {
      import('./reflection-store').then(({ useReflectionStore }) => {
        useReflectionStore.getState().runReflectionCycle(emotionalState.user_id);
      });
    }
  },

  processMessage: async (message: string) => {
    const { emotionalState } = get();
    if (!emotionalState) return null;

    const { stateChanges, signals } = computePostMessage(emotionalState, message);
    const updated = { ...emotionalState, ...stateChanges, updated_at: new Date().toISOString() };
    set({ emotionalState: updated });

    await supabase
      .from('emotional_state')
      .update(stateChanges)
      .eq('user_id', emotionalState.user_id);

    return signals;
  },

  applyEnvironment: async (scheduleLabel: string, hour: number) => {
    const { emotionalState } = get();
    if (!emotionalState) return;

    const changes = computeEnvironmentalInfluence(emotionalState, scheduleLabel, hour);
    if (Object.keys(changes).length === 0) return;

    const updated = { ...emotionalState, ...changes, updated_at: new Date().toISOString() };
    set({ emotionalState: updated });

    // Await persistence when drift changed (important for cross-session consistency)
    if ('drift' in changes) {
      await supabase
        .from('emotional_state')
        .update(changes)
        .eq('user_id', emotionalState.user_id);
    } else {
      // Fire-and-forget for minor environment shifts
      supabase
        .from('emotional_state')
        .update(changes)
        .eq('user_id', emotionalState.user_id)
        .then(() => {});
    }
  },
}));
