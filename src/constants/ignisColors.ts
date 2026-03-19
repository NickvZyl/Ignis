import type { EmotionLabel, RoleLabel } from '@/types';

export const EMOTION_COLORS: Record<EmotionLabel, string> = {
  bright: '#F5D03B',      // yellow — energised, curious, engaged
  intense: '#D94F3D',     // red — passionate, urgent, heightened
  grounded: '#3A7D44',    // green — calm, stable, present
  reflective: '#4A90D9',  // blue — thoughtful, processing, quiet
  deep: '#6B4FA0',        // purple — introspective, dreaming, distant
  warm: '#E8748A',        // pink — affectionate, close, content
  eager: '#F0882A',       // orange — motivated, ready, anticipating
};

// RoleLabel is nullable — use NonNullable to exclude null from the Record key
export const ROLE_COLORS: Record<NonNullable<RoleLabel>, string> = {
  curious: '#F5D03B',      // yellow — researching, exploring
  urgent: '#D94F3D',       // red — high priority, deadline-driven
  building: '#3A7D44',     // green — creating, writing, executing
  thinking: '#4A90D9',     // blue — planning, reasoning
  remembering: '#6B4FA0',  // purple — memory retrieval, reflecting on past
  caring: '#E8748A',       // pink — checking in, emotional support
  active: '#F0882A',       // orange — general task execution
};

export const COLORS = {
  background: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceLight: '#2A2A2A',
  text: '#FAFAFA',
  textSecondary: '#A0A0A0',
  userBubble: '#2563EB',
  assistantBubble: '#1E1E1E',
  border: '#333333',
  error: '#EF4444',
};
