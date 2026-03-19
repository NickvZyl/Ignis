export interface EmotionalState {
  id: string;
  user_id: string;
  valence: number;       // 0-1: negative to positive
  arousal: number;       // 0-1: calm to energetic
  attachment: number;    // 0-1: new to deep relationship
  drift: number;         // 0-1: engaged to disengaged
  active_emotion: EmotionLabel;
  active_role: RoleLabel;
  last_interaction_at: string;
  updated_at: string;
}

export type EmotionLabel = 'bright' | 'intense' | 'grounded' | 'reflective' | 'deep' | 'warm' | 'eager';
export type RoleLabel = 'curious' | 'urgent' | 'building' | 'thinking' | 'remembering' | 'caring' | 'active' | null;

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  emotional_signals: EmotionalSignals | null;
  created_at: string;
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
