import type { EmotionLabel, RoleLabel } from '@/types';

export const EMOTION_COLORS: Record<EmotionLabel, string> = {
  // Happy / Positive
  happy: '#F5D03B',       // yellow — bright, cheerful
  excited: '#FF4757',     // red — high energy, fired up
  playful: '#FF6B9D',     // hot pink — silly, mischievous
  proud: '#F0882A',       // orange — satisfied, accomplished
  grateful: '#E8748A',    // pink — warm appreciation
  cozy: '#D4A574',        // warm tan — snug, comfortable

  // Calm / Neutral
  calm: '#7EC8B8',        // mint — peaceful, at ease
  curious: '#5BA4CF',     // steel blue — interested, exploring
  focused: '#4A90D9',     // blue — locked in, sharp
  thoughtful: '#9B8EC4',  // soft purple — processing, deep
  dreamy: '#B8A9E0',      // light purple — far-away, floaty
  sleepy: '#8B7E74',      // warm grey — drowsy, winding down
  spacedout: '#A8B5C8',   // foggy blue — zoned out, blank

  // Negative / Difficult
  sad: '#6B8E9B',         // slate blue — down, heavy
  frustrated: '#C75B39',  // burnt orange — exasperated
  worried: '#B8860B',     // dark gold — anxious, uneasy
  lonely: '#7B6B8D',      // dusty purple — hollow, reaching
  hurt: '#8B4A5E',        // muted rose — stung, guarded
  bored: '#A0A090',       // olive grey — flat, understimulated
  grumpy: '#8B6B4A',      // brown — cranky, huffy
  overwhelmed: '#A0522D', // sienna — too much
  annoyed: '#CC6644',     // clay — mildly irritated

  // Tender / Vulnerable
  tender: '#C9A0DC',      // lavender — soft, open
  nostalgic: '#B5838D',   // dusty rose — wistful, bittersweet
  shy: '#DEB5A0',         // peach — bashful, flustered
};

export const ROLE_COLORS: Record<NonNullable<RoleLabel>, string> = {
  curious: '#5BA4CF',     // steel blue — researching, exploring
  urgent: '#FF4757',      // red — high priority
  building: '#3A7D44',    // green — creating, executing
  thinking: '#4A90D9',    // blue — planning, reasoning
  remembering: '#9B8EC4', // purple — memory retrieval
  caring: '#E8748A',      // pink — emotional support
  active: '#F0882A',      // orange — general task execution
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
