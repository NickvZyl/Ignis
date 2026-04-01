import { create } from 'zustand';
import { supabase } from '@web/lib/supabase';
import type { ActivityEntry } from '@/types';

interface ActivityState {
  currentEntry: ActivityEntry | null;
  todayEntries: ActivityEntry[];

  loadToday: (userId: string) => Promise<void>;
  logTransition: (userId: string, scene: string, furniture: string | null, label: string | null, emotion: string | null) => Promise<void>;
  summarizeDay: () => string;
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  currentEntry: null,
  todayEntries: [],

  loadToday: async (userId: string) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('activity_log')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', todayStart.toISOString())
      .order('started_at', { ascending: true });

    const entries = (data || []) as ActivityEntry[];
    // The most recent entry without ended_at is the current one
    const current = entries.find(e => !e.ended_at) || null;
    set({ todayEntries: entries, currentEntry: current });

    // Cleanup: delete entries older than 7 days (fire and forget)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    supabase
      .from('activity_log')
      .delete()
      .eq('user_id', userId)
      .lt('started_at', cutoff.toISOString())
      .then(() => {});
  },

  logTransition: async (userId: string, scene: string, furniture: string | null, label: string | null, emotion: string | null) => {
    const { currentEntry, todayEntries } = get();

    // Skip if nothing changed
    if (currentEntry && currentEntry.scene === scene && currentEntry.furniture === furniture) {
      return;
    }

    const now = new Date().toISOString();

    // Close current entry
    if (currentEntry) {
      await supabase
        .from('activity_log')
        .update({ ended_at: now })
        .eq('id', currentEntry.id);

      // Update local copy
      const updated = todayEntries.map(e =>
        e.id === currentEntry.id ? { ...e, ended_at: now } : e
      );
      set({ todayEntries: updated });
    }

    // Insert new entry
    const { data } = await supabase
      .from('activity_log')
      .insert({ user_id: userId, scene, furniture, activity_label: label, emotion })
      .select()
      .single();

    if (data) {
      const entry = data as ActivityEntry;
      set({
        currentEntry: entry,
        todayEntries: [...get().todayEntries, entry],
      });
    }
  },

  summarizeDay: () => {
    const { todayEntries } = get();
    if (todayEntries.length === 0) return 'No activity logged today yet.';

    // Aggregate time by activity label + scene
    const buckets: Record<string, number> = {};
    const now = Date.now();

    for (const entry of todayEntries) {
      const start = new Date(entry.started_at).getTime();
      const end = entry.ended_at ? new Date(entry.ended_at).getTime() : now;
      const mins = Math.round((end - start) / 60000);
      const key = `${entry.activity_label || 'idle'} in ${entry.scene}${entry.furniture ? ` at ${entry.furniture}` : ''}`;
      buckets[key] = (buckets[key] || 0) + mins;
    }

    // Sort by duration descending, format
    return Object.entries(buckets)
      .sort((a, b) => b[1] - a[1])
      .map(([label, mins]) => {
        if (mins >= 60) {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          return m > 0 ? `${h}h${m}m ${label}` : `${h}h ${label}`;
        }
        return `${mins}m ${label}`;
      })
      .join(', ');
  },
}));
