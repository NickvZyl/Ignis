export interface EmotionalState {
  id: string;
  user_id: string;
  valence: number;       // 0-1: negative to positive
  arousal: number;       // 0-1: calm to energetic
  attachment: number;    // 0-1: new to deep relationship
  drift: number;         // 0-1: engaged to disengaged
  active_emotion: EmotionLabel;
  secondary_emotion: EmotionLabel | null;
  inner_conflict: string | null;
  emotion_reason: string | null;
  morning_thought: string | null;
  active_role: RoleLabel;
  last_interaction_at: string;
  updated_at: string;
}

export type EmotionLabel =
  // Happy / Positive
  | 'happy' | 'excited' | 'playful' | 'proud' | 'grateful' | 'cozy'
  // Calm / Neutral
  | 'calm' | 'curious' | 'focused' | 'thoughtful' | 'dreamy' | 'sleepy' | 'spacedout'
  // Negative / Difficult
  | 'sad' | 'frustrated' | 'worried' | 'lonely' | 'hurt' | 'bored' | 'grumpy' | 'overwhelmed' | 'annoyed'
  // Tender / Vulnerable
  | 'tender' | 'nostalgic' | 'shy';

export type RoleLabel = 'curious' | 'urgent' | 'building' | 'thinking' | 'remembering' | 'caring' | 'active' | null;

export interface EmotionContext {
  hour: number;
  activity: string | null;
  humorSignal: number;
  recentDepth: number;
  valenceDelta: number;
  activeRole: RoleLabel;
  negativeKeywords: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  emotional_signals: EmotionalSignals | null;
  created_at: string;
  reply_to_id?: string | null;
}

export interface EmotionalSignals {
  valence_shift: number;
  arousal_shift: number;
  depth_signal: number;
  keywords: string[];
}

export interface Conversation {
  id: string;
  user_id: string;
  summary: string | null;
  emotional_snapshot: Partial<EmotionalState> | null;
  created_at: string;
  ended_at: string | null;
}

export interface Memory {
  id: string;
  user_id: string;
  content: string;
  memory_type: 'fact' | 'emotion' | 'theme' | 'preference' | 'event';
  importance: number;
  embedding: number[] | null;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  last_seen_at: string;
  created_at: string;
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Self-memory (Igni's own reflections) ──

export type SelfMemoryType = 'observation' | 'pattern' | 'feeling' | 'wonder' | 'connection' | 'dream';

export interface SelfMemory {
  id: string;
  user_id: string;
  content: string;
  memory_type: SelfMemoryType;
  context: ReflectionContext | null;
  importance: number;
  times_surfaced: number;
  last_surfaced_at: string | null;
  emotion_primary: EmotionLabel | null;
  emotion_secondary: EmotionLabel | null;
  valence_at_creation: number | null;
  arousal_at_creation: number | null;
  created_at: string;
}

export interface ReflectionContext {
  hour: number;
  slot: number;
  scene: string;
  furniture: string | null;
  activity: string;
  emotion: string;
  valence: number;
  weather?: string;
  userAbsenceHours?: number;
  recentTopics?: string[];
  activitySummary?: string;
}

// ── Activity log ──

export interface ActivityEntry {
  id: string;
  user_id: string;
  scene: string;
  furniture: string | null;
  activity_label: string | null;
  emotion: string | null;
  started_at: string;
  ended_at: string | null;
}
