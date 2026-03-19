import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { computeSessionStart, computePostMessage } from '@/lib/emotional-engine';
import type { EmotionalState, EmotionLabel, RoleLabel, EmotionalSignals } from '@/types';

const DEFAULT_STATE: Omit<EmotionalState, 'id' | 'user_id' | 'updated_at'> = {
  valence: 0.6,
  arousal: 0.4,
  attachment: 0.0,
  drift: 0.0,
  active_emotion: 'warm',
  active_role: null,
  last_interaction_at: new Date().toISOString(),
};

interface CompanionState {
  emotionalState: EmotionalState | null;
  loading: boolean;

  loadState: (userId: string) => Promise<void>;
  applySessionStart: () => Promise<void>;
  processMessage: (message: string) => Promise<EmotionalSignals | null>;
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
        // No row exists yet — will be created by trigger on signup
        // Use defaults for now
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

    // Persist to Supabase
    await supabase
      .from('emotional_state')
      .update(changes)
      .eq('user_id', emotionalState.user_id);
  },

  processMessage: async (message: string) => {
    const { emotionalState } = get();
    if (!emotionalState) return null;

    const { stateChanges, signals } = computePostMessage(emotionalState, message);
    const updated = { ...emotionalState, ...stateChanges, updated_at: new Date().toISOString() };
    set({ emotionalState: updated });

    // Persist to Supabase
    await supabase
      .from('emotional_state')
      .update(stateChanges)
      .eq('user_id', emotionalState.user_id);

    return signals;
  },
}));
