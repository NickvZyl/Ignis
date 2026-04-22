// Server-side fallback for the ephemeral (per-call, never cached) system
// prompt block. Used when the client doesn't send a dynamic system message —
// mobile is the main consumer. Matches what web's buildEphemeralPrompt puts
// in its dynamic tier, scoped to the three things that most visibly affect
// Igni's behavior:
//   1. Recent self-thoughts (so she references her own inner life)
//   2. Current time context (time-of-day awareness)
//   3. Emotional state (how she's feeling + why + morning thought)

import type { SupabaseClient } from '@supabase/supabase-js';

interface SelfMemoryRow {
  content: string;
  emotion_primary: string | null;
}

interface EmotionalStateRow {
  valence: number;
  arousal: number;
  attachment: number;
  active_emotion: string;
  secondary_emotion: string | null;
  active_role: string | null;
  emotion_reason: string | null;
  inner_conflict: string | null;
  morning_thought: string | null;
}

function describeTimeOfDay(hour: number): string {
  if (hour < 5) return 'late night / very early morning';
  if (hour < 9) return 'early morning';
  if (hour < 12) return 'morning';
  if (hour < 14) return 'midday';
  if (hour < 17) return 'afternoon';
  if (hour < 20) return 'early evening';
  if (hour < 23) return 'evening';
  return 'late night';
}

export async function buildServerEphemeralPrompt(
  db: SupabaseClient,
  userId: string
): Promise<string> {
  const [selfMemRes, emoRes] = await Promise.all([
    db
      .from('self_memories')
      .select('content, emotion_primary, importance, times_surfaced, last_surfaced_at')
      .eq('user_id', userId)
      .order('importance', { ascending: false })
      .order('last_surfaced_at', { ascending: true, nullsFirst: true })
      .limit(3),
    db
      .from('emotional_state')
      .select(
        'valence, arousal, attachment, active_emotion, secondary_emotion, active_role, emotion_reason, inner_conflict, morning_thought'
      )
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const parts: string[] = [];

  const selfMems = (selfMemRes.data ?? []) as SelfMemoryRow[];
  if (selfMems.length > 0) {
    const lines = selfMems.map((m) => {
      const tag = m.emotion_primary ? `[${m.emotion_primary}] ` : '';
      return `${tag}${m.content}`;
    });
    parts.push(`Your recent thoughts: ${lines.join('. ')}`);
  }

  const now = new Date();
  const hour = now.getHours();
  const timeLabel = now.toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  parts.push(`Current time: ${timeLabel} (${describeTimeOfDay(hour)}).`);

  const emo = emoRes.data as EmotionalStateRow | null;
  if (emo) {
    const blendParts: string[] = [];
    blendParts.push(`You're feeling ${emo.active_emotion}`);
    if (emo.secondary_emotion) blendParts.push(`alongside ${emo.secondary_emotion}`);
    const blend = blendParts.join(' ');
    const metrics = `(valence ${emo.valence.toFixed(2)}, arousal ${emo.arousal.toFixed(2)}, attachment ${emo.attachment.toFixed(2)})`;

    let emoBlock = `${blend} ${metrics}.`;
    if (emo.emotion_reason) emoBlock += ` Why: ${emo.emotion_reason}`;
    if (emo.active_role) emoBlock += ` Role: ${emo.active_role}.`;
    if (emo.inner_conflict) {
      emoBlock += `\n\nInner conflict: ${emo.inner_conflict}`;
    }
    if (emo.morning_thought) {
      emoBlock += `\n\nThis morning's thought (from dreams): "${emo.morning_thought}"`;
    }
    parts.push(emoBlock);
  }

  return parts.join('\n\n');
}
