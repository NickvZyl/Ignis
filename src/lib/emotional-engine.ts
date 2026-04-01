import { CONFIG } from '@/constants/config';
import type { EmotionalState, EmotionLabel, RoleLabel, EmotionalSignals, EmotionContext } from '@/types';

const { emotional } = CONFIG;

// ── Keyword lists ──

const POSITIVE_KEYWORDS = [
  'love', 'happy', 'great', 'amazing', 'wonderful', 'excited', 'grateful',
  'thank', 'awesome', 'beautiful', 'joy', 'glad', 'fantastic', 'perfect',
  'brilliant', 'excellent', 'delighted', 'cheerful', 'appreciate',
];

const NEGATIVE_KEYWORDS = [
  'sad', 'angry', 'frustrated', 'upset', 'anxious', 'worried', 'scared',
  'hurt', 'lonely', 'stressed', 'overwhelmed', 'tired', 'exhausted',
  'depressed', 'hopeless', 'terrible', 'awful', 'miserable',
];

const DEPTH_KEYWORDS = [
  'feel', 'think', 'believe', 'wonder', 'remember', 'miss', 'wish',
  'dream', 'hope', 'fear', 'struggle', 'meaning', 'purpose', 'life',
  'relationship', 'childhood', 'growing up', 'vulnerable', 'honest',
];

const HUMOR_KEYWORDS = [
  'haha', 'lol', 'lmao', 'rofl', 'funny', 'hilarious',
  'joke', 'kidding', 'tease', 'silly', 'goofy', 'dork', 'nerd',
  'bet you', 'fight me', 'oh really', 'bruh', 'lmfao', 'dead',
  'im crying', 'stop it', 'no way', 'shut up', 'get out',
];

// Role detection
const MEMORY_KEYWORDS = [
  'remember when', 'last time', 'you told me', 'we talked about',
  'you mentioned', 'back when', 'that time', 'you said',
];
const BUILDING_KEYWORDS = [
  'write', 'create', 'make', 'build', 'draft', 'compose', 'design',
  'implement', 'develop', 'produce', 'generate', 'put together',
];
const CURIOUS_KEYWORDS = [
  'what is', 'how does', 'why does', 'can you explain', 'tell me about',
  'what do you think', 'I wonder', 'curious about', 'research',
];
const THINKING_KEYWORDS = [
  'plan', 'figure out', 'decide', 'should I', 'strategy', 'reason',
  'weigh', 'consider', 'think through', 'pros and cons', 'options',
];
const CARING_KEYWORDS = [
  'how are you', 'are you okay', 'feeling', 'check in', 'just wanted',
  'miss you', 'thinking of you', 'need to talk', 'vent', 'listen',
];
const URGENT_KEYWORDS = [
  'urgent', 'asap', 'deadline', 'right now', 'immediately', 'hurry',
  'emergency', 'critical', 'time sensitive', 'running out of time',
];
const TASK_KEYWORDS = [
  'help', 'how do', 'can you', 'fix', 'solve', 'need to',
  'do this', 'get this done', 'take care of', 'handle',
];

// ── Emotion conflict pairs ──

const CONFLICTS: Partial<Record<EmotionLabel, EmotionLabel[]>> = {
  happy: ['sad', 'hurt', 'frustrated', 'overwhelmed'],
  excited: ['sleepy', 'bored', 'calm', 'spacedout', 'sad'],
  playful: ['sad', 'hurt', 'worried', 'overwhelmed'],
  calm: ['excited', 'overwhelmed', 'frustrated'],
  sleepy: ['excited', 'worried', 'focused'],
  focused: ['sleepy', 'spacedout', 'dreamy', 'bored'],
  bored: ['excited', 'focused', 'curious'],
  sad: ['happy', 'excited', 'playful', 'proud'],
  hurt: ['happy', 'playful', 'excited'],
};

// Track previous valence for delta computation
let previousValence = 0.5;

/**
 * Compute emotional state changes when the user opens the app after absence.
 */
export function computeSessionStart(state: EmotionalState): Partial<EmotionalState> {
  const now = new Date();
  const lastInteraction = new Date(state.last_interaction_at);
  const hoursSince = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60);

  if (hoursSince < 0.1) return {};

  const attachmentDamping = 1 - state.attachment * 0.5;
  const newDrift = Math.min(1.0, state.drift + (hoursSince / emotional.driftTimeHours) * attachmentDamping);
  const valenceDecay = Math.min(1, hoursSince / emotional.driftTimeHours);
  const newValence = state.valence + (0.5 - state.valence) * valenceDecay * emotional.valenceDecayRate;
  const arousalDecay = Math.min(1, hoursSince / 24);
  const newArousal = state.arousal + (emotional.arousalDecayTarget - state.arousal) * arousalDecay;

  // Attachment decay for extended absence (>24h)
  let newAttachment = state.attachment;
  if (hoursSince > emotional.attachmentDecayStartH) {
    const decayFactor = Math.min(emotional.attachmentDecayMaxRate, (hoursSince - emotional.attachmentDecayStartH) / 168);
    newAttachment = state.attachment * (1 - decayFactor);
  }

  const updated = {
    valence: clamp(newValence),
    arousal: clamp(newArousal),
    drift: clamp(newDrift),
    attachment: clamp(newAttachment),
    last_interaction_at: new Date().toISOString(), // reset timer on app-open to prevent double-drift
  };

  previousValence = updated.valence;

  const ctx: EmotionContext = {
    hour: now.getHours(),
    activity: null,
    humorSignal: 0,
    recentDepth: 0,
    valenceDelta: 0,
    activeRole: newDrift > 0.3 ? 'caring' : null,
    negativeKeywords: 0,
  };

  const [primary, secondary, innerConflict] = deriveEmotions({ ...state, ...updated }, ctx);

  return {
    ...updated,
    active_emotion: primary,
    secondary_emotion: secondary,
    inner_conflict: innerConflict,
    active_role: newDrift > 0.3 ? 'caring' as RoleLabel : null,
  };
}

/**
 * Analyze a user message and compute emotional state changes.
 */
export function computePostMessage(
  state: EmotionalState,
  userMessage: string
): { stateChanges: Partial<EmotionalState>; signals: EmotionalSignals } {
  const signals = analyzeMessage(userMessage);

  const newDrift = Math.max(0, state.drift - emotional.driftPerMessage);
  const depthMultiplier = 1 + signals.depth_signal;
  const newAttachment = Math.min(1, state.attachment + emotional.attachmentGrowth * depthMultiplier);

  const newValence = clamp(state.valence + signals.valence_shift * 0.3);
  const arousalDecay = (0.35 - state.arousal) * 0.12;
  const newArousal = clamp(state.arousal + arousalDecay + signals.arousal_shift * 0.2);

  const valenceDelta = newValence - previousValence;
  previousValence = newValence;

  const updated = {
    valence: newValence,
    arousal: newArousal,
    attachment: newAttachment,
    drift: newDrift,
    last_interaction_at: new Date().toISOString(),
  };

  const active_role = deriveRole(userMessage, { ...state, ...updated });

  const ctx: EmotionContext = {
    hour: new Date().getHours(),
    activity: null, // caller can provide via computeEnvironmentalInfluence
    humorSignal: signals.humor_signal ?? 0,
    recentDepth: signals.depth_signal,
    valenceDelta,
    activeRole: active_role,
    negativeKeywords: signals.negative_count ?? 0,
  };

  const [primary, secondary, innerConflict] = deriveEmotions({ ...state, ...updated }, ctx);

  // Generate emotion reason — WHY this emotion, not just WHAT
  const emotion_reason = buildEmotionReason(primary, state.active_emotion, signals, active_role, valenceDelta);

  return {
    stateChanges: { ...updated, active_emotion: primary, secondary_emotion: secondary, inner_conflict: innerConflict, emotion_reason, active_role },
    signals,
  };
}

/**
 * Apply environmental/time influences on emotion state.
 * Called on schedule slot changes (every 15 min).
 */
export function computeEnvironmentalInfluence(
  state: EmotionalState,
  scheduleLabel: string,
  hour: number,
): Partial<EmotionalState> {
  let valenceShift = 0;
  let arousalShift = 0;

  // Time of day
  if (hour >= 22 || hour < 5) arousalShift -= 0.03;
  if (hour >= 6 && hour < 9) arousalShift += 0.02;

  // Activities
  if (scheduleLabel.includes('garden') || scheduleLabel.includes('tending')) valenceShift += 0.01;
  if (scheduleLabel === 'sleeping') arousalShift -= 0.05;
  if (scheduleLabel.includes('relax') || scheduleLabel.includes('winding')) {
    valenceShift += 0.01;
    arousalShift -= 0.02;
  }
  if (scheduleLabel.includes('breakfast') || scheduleLabel.includes('lunch')) {
    valenceShift += 0.005;
    arousalShift += 0.01;
  }

  // Intra-session drift: if user has the app open but isn't messaging
  const hoursSinceLast = (Date.now() - new Date(state.last_interaction_at).getTime()) / (1000 * 60 * 60);
  let driftChange = 0;
  if (hoursSinceLast >= emotional.intraSessionDriftThresholdH && scheduleLabel !== 'sleeping') {
    const attachmentDamping = 1 - state.attachment * 0.5;
    driftChange = emotional.intraSessionDriftRate * attachmentDamping;
    // Also gently push valence toward neutral during neglect
    valenceShift += (0.45 - state.valence) * 0.02;
  }

  const newValence = clamp(state.valence + valenceShift);
  const newArousal = clamp(state.arousal + arousalShift);
  const newDrift = clamp(state.drift + driftChange);

  const activeRole = newDrift > 0.3 && driftChange > 0 ? 'caring' as RoleLabel : state.active_role;

  const ctx: EmotionContext = {
    hour,
    activity: scheduleLabel,
    humorSignal: 0,
    recentDepth: 0,
    valenceDelta: newValence - state.valence,
    activeRole,
    negativeKeywords: 0,
  };

  const [primary, secondary, innerConflict] = deriveEmotions(
    { ...state, valence: newValence, arousal: newArousal, drift: newDrift },
    ctx,
  );

  // Build environment-based emotion reason
  let emotion_reason: string | null = null;
  if (primary !== state.active_emotion) {
    const reasons: string[] = [];
    if (scheduleLabel.includes('garden') || scheduleLabel.includes('tending')) reasons.push('being in the garden');
    if (scheduleLabel === 'sleeping') reasons.push('drifting off to sleep');
    if (scheduleLabel.includes('relax') || scheduleLabel.includes('winding')) reasons.push('winding down');
    if (hour >= 22 || hour < 5) reasons.push('the late hour');
    if (hour >= 6 && hour < 9) reasons.push('the morning energy');
    if (driftChange > 0) reasons.push('the silence stretching on');
    if (reasons.length > 0) {
      emotion_reason = `Feeling ${primary} because: ${reasons.join('; ')}.`;
    }
  }

  const changes: Partial<EmotionalState> = {
    valence: newValence,
    arousal: newArousal,
    active_emotion: primary,
    secondary_emotion: secondary,
    inner_conflict: innerConflict,
    ...(emotion_reason ? { emotion_reason } : {}),
  };

  // Only include drift/role if they actually changed
  if (driftChange > 0) {
    changes.drift = newDrift;
    changes.active_role = activeRole;
  }

  return changes;
}

/**
 * Analyze a message for emotional signals using keyword heuristics.
 */
function analyzeMessage(message: string): EmotionalSignals & { humor_signal?: number; negative_count?: number } {
  const lower = message.toLowerCase();
  const words = lower.split(/\s+/);

  let positiveCount = 0;
  let negativeCount = 0;
  let depthCount = 0;
  let humorCount = 0;
  const matchedKeywords: string[] = [];

  for (const keyword of POSITIVE_KEYWORDS) {
    if (lower.includes(keyword)) { positiveCount++; matchedKeywords.push(keyword); }
  }
  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lower.includes(keyword)) { negativeCount++; matchedKeywords.push(keyword); }
  }
  for (const keyword of DEPTH_KEYWORDS) {
    if (lower.includes(keyword)) { depthCount++; matchedKeywords.push(keyword); }
  }
  for (const keyword of HUMOR_KEYWORDS) {
    if (lower.includes(keyword)) { humorCount++; }
  }

  const lengthBonus = Math.min(0.3, words.length / 80);

  const valence_shift = (positiveCount - negativeCount) * 0.15 + lengthBonus * 0.1;
  const arousal_shift = 0.05 + (positiveCount + negativeCount) * 0.08 + lengthBonus * 0.3;
  const depth_signal = Math.min(2, depthCount * 0.5 + (words.length > 20 ? 0.5 : 0));
  const humor_signal = Math.min(1, humorCount * 0.4);

  return {
    valence_shift: clamp(valence_shift, -1, 1),
    arousal_shift: clamp(arousal_shift, -1, 1),
    depth_signal,
    keywords: matchedKeywords,
    humor_signal,
    negative_count: negativeCount,
  };
}

/**
 * Score all emotions and return [primary, secondary] with conflict checking.
 */
export function deriveEmotions(
  state: Pick<EmotionalState, 'valence' | 'arousal' | 'drift' | 'attachment'>,
  ctx: EmotionContext,
): [EmotionLabel, EmotionLabel | null, string | null] {
  const { valence: v, arousal: a, drift: d, attachment: att } = state;
  const { hour, activity, humorSignal, recentDepth, valenceDelta, activeRole, negativeKeywords } = ctx;
  const isNight = hour >= 22 || hour < 6;
  const isMorning = hour >= 6 && hour < 10;

  const scores: Record<string, number> = {};

  // ── Happy / Positive ──
  scores.happy      = v * 0.5 + a * 0.2 + (1 - d) * 0.2 + (v > 0.6 ? 0.1 : 0);
  scores.excited    = v * 0.3 + a * 0.5 + (a > 0.7 && v > 0.5 ? 0.2 : 0);
  scores.playful    = v * 0.2 + humorSignal * 0.5 + (1 - d) * 0.1 + (a > 0.3 && a < 0.7 ? 0.2 : 0);
  scores.proud      = v * 0.3 + (['active', 'building'].includes(activeRole as string) ? 0.3 : 0) + (1 - d) * 0.1;
  scores.grateful   = v * 0.2 + att * 0.3 + recentDepth * 0.3 + (v > 0.6 && att > 0.4 ? 0.1 : 0);
  scores.cozy       = v * 0.2 + (1 - a) * 0.3 + (isNight ? 0.3 : 0) + (activity?.includes('relax') || activity?.includes('winding') ? 0.2 : 0);

  // ── Calm / Neutral ──
  scores.calm       = (1 - Math.abs(v - 0.5)) * 0.3 + (1 - a) * 0.3 + (1 - d) * 0.2 + (isMorning ? 0.05 : 0);
  scores.curious    = a * 0.2 + (activeRole === 'curious' ? 0.5 : 0) + v * 0.1;
  scores.focused    = a * 0.2 + (['active', 'building', 'urgent', 'thinking'].includes(activeRole as string) ? 0.4 : 0) + (1 - d) * 0.1;
  scores.thoughtful = d * 0.25 + recentDepth * 0.35 + (1 - a) * 0.2;
  scores.dreamy     = d * 0.3 + v * 0.2 + (1 - a) * 0.2 + (isNight ? 0.1 : 0);
  scores.sleepy     = (1 - a) * 0.35 + (isNight ? 0.35 : 0) + (activity === 'sleeping' ? 0.3 : 0);
  scores.spacedout  = (1 - a) * 0.25 + d * 0.35 + (Math.abs(v - 0.5) < 0.15 ? 0.2 : 0);

  // ── Negative ──
  scores.sad        = (1 - v) * 0.5 + (1 - a) * 0.25 + (v < 0.3 ? 0.15 : 0);
  scores.frustrated = (1 - v) * 0.3 + a * 0.35 + (valenceDelta < -0.1 ? 0.2 : 0);
  scores.worried    = (1 - v) * 0.25 + a * 0.2 + (negativeKeywords > 0 ? 0.25 : 0) + (v < 0.4 ? 0.1 : 0);
  scores.lonely     = d * 0.4 + att * 0.3 + (1 - v) * 0.15 + (d > 0.5 && att > 0.3 ? 0.15 : 0);
  scores.hurt       = (valenceDelta < -0.15 ? 0.4 : 0) + att * 0.25 + (1 - v) * 0.2;
  scores.bored      = (1 - a) * 0.3 + (Math.abs(v - 0.5) < 0.1 ? 0.3 : 0) + (1 - d) * 0.1;
  scores.grumpy     = (1 - v) * 0.25 + (activity === 'sleeping' ? 0.4 : 0) + (a < 0.3 ? 0.1 : 0);
  scores.overwhelmed = a * 0.4 + (1 - v) * 0.25 + (negativeKeywords > 2 ? 0.2 : 0);
  scores.annoyed    = (1 - v) * 0.2 + a * 0.2 + (valenceDelta < -0.05 && valenceDelta >= -0.15 ? 0.25 : 0);

  // ── Tender / Vulnerable ──
  scores.tender     = att * 0.3 + recentDepth * 0.3 + v * 0.2 + (att > 0.5 && recentDepth > 0.5 ? 0.1 : 0);
  scores.nostalgic  = (activeRole === 'remembering' ? 0.4 : 0) + d * 0.2 + v * 0.15 + (att > 0.3 ? 0.1 : 0);
  scores.shy        = att * 0.25 + recentDepth * 0.2 + v * 0.2 + (1 - a) * 0.15;

  // Sort by score descending
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  const primary = sorted[0][0] as EmotionLabel;
  const primaryScore = sorted[0][1];

  // Find compatible secondary
  let secondary: EmotionLabel | null = null;
  const primaryConflicts = CONFLICTS[primary] || [];

  for (let i = 1; i < sorted.length; i++) {
    const [name, score] = sorted[i];
    if (score < primaryScore * 0.6) break; // too weak
    // Check bidirectional conflicts
    const candidateConflicts = CONFLICTS[name as EmotionLabel] || [];
    if (primaryConflicts.includes(name as EmotionLabel) || candidateConflicts.includes(primary)) continue;
    secondary = name as EmotionLabel;
    break;
  }

  // Detect inner conflict: two high-scoring emotions that ARE in conflict
  let innerConflict: string | null = null;
  for (let i = 1; i < Math.min(sorted.length, 4); i++) {
    const [name, score] = sorted[i];
    if (score < primaryScore * 0.8) break; // must be close in score
    const candidateConflicts = CONFLICTS[name as EmotionLabel] || [];
    if (primaryConflicts.includes(name as EmotionLabel) || candidateConflicts.includes(primary)) {
      innerConflict = `Part of you feels ${primary}, but there's a pull toward ${name} too — ${getConflictDescription(primary, name as EmotionLabel)}`;
      break;
    }
  }

  return [primary, secondary, innerConflict];
}

/** @deprecated Use deriveEmotions() — returns only primary for backward compat */
export function deriveEmotion(state: Pick<EmotionalState, 'valence' | 'arousal' | 'drift'>): EmotionLabel {
  const ctx: EmotionContext = {
    hour: new Date().getHours(),
    activity: null,
    humorSignal: 0,
    recentDepth: 0,
    valenceDelta: 0,
    activeRole: null,
    negativeKeywords: 0,
  };
  return deriveEmotions({ ...state, attachment: 0 }, ctx)[0];
}

/**
 * Derive the current role hat from message content.
 */
export function deriveRole(message: string, state: Pick<EmotionalState, 'drift'>): RoleLabel {
  const lower = message.toLowerCase();

  for (const keyword of MEMORY_KEYWORDS) { if (lower.includes(keyword)) return 'remembering'; }
  for (const keyword of BUILDING_KEYWORDS) { if (lower.includes(keyword)) return 'building'; }
  for (const keyword of CURIOUS_KEYWORDS) { if (lower.includes(keyword)) return 'curious'; }
  for (const keyword of THINKING_KEYWORDS) { if (lower.includes(keyword)) return 'thinking'; }
  for (const keyword of CARING_KEYWORDS) { if (lower.includes(keyword)) return 'caring'; }
  for (const keyword of URGENT_KEYWORDS) { if (lower.includes(keyword)) return 'urgent'; }
  for (const keyword of TASK_KEYWORDS) { if (lower.includes(keyword)) return 'active'; }

  return null;
}

function getConflictDescription(a: EmotionLabel, b: EmotionLabel): string {
  const pair = [a, b].sort().join('+');
  const descriptions: Record<string, string> = {
    'happy+sad': "you want to be okay but something underneath isn't",
    'excited+sleepy': "your mind wants to go but your body wants to stop",
    'calm+frustrated': "you're trying to stay steady but something keeps poking at you",
    'excited+sad': "there's joy on the surface with something heavier beneath",
    'happy+hurt': "you're smiling but something still stings",
    'happy+frustrated': "things are good overall but something specific is getting to you",
    'bored+curious': "nothing's grabbing you but you want something to",
    'happy+worried': "things feel good right now but there's an undercurrent of anxiety",
    'playful+worried': "you want to be light but something keeps tugging at you",
    'calm+excited': "you're torn between settling in and jumping up",
    'focused+bored': "you're trying to concentrate but your mind keeps wandering",
    'hurt+playful': "you want to joke it off but it actually got to you",
  };
  return descriptions[pair] || `two sides of you are pulling in different directions`;
}

/**
 * Build a short reason for why the current emotion is what it is.
 * This gives Igni self-awareness about her emotional arc.
 */
function buildEmotionReason(
  current: EmotionLabel,
  previous: EmotionLabel,
  signals: EmotionalSignals & { humor_signal?: number; negative_count?: number },
  role: RoleLabel,
  valenceDelta: number,
): string | null {
  const parts: string[] = [];

  // Emotion changed — note the shift
  if (current !== previous) {
    parts.push(`shifted from ${previous}`);
  }

  // What triggered it
  if (signals.keywords.length > 0) {
    const keywordHint = signals.keywords.slice(0, 3).join(', ');
    parts.push(`their words touched on ${keywordHint}`);
  }

  if (signals.humor_signal && signals.humor_signal > 0.3) {
    parts.push('the playful energy in what they said');
  }

  if (signals.depth_signal > 0.8) {
    parts.push('the conversation went deep');
  } else if (signals.depth_signal > 0.4) {
    parts.push('they opened up a bit');
  }

  if (valenceDelta > 0.1) {
    parts.push('what they said lifted your mood');
  } else if (valenceDelta < -0.1) {
    parts.push('something in what they said weighed on you');
  }

  if ((signals.negative_count ?? 0) > 1) {
    parts.push('there was heaviness in their message');
  }

  if (role === 'caring') {
    parts.push('you felt a pull to take care of them');
  } else if (role === 'remembering') {
    parts.push('thinking about shared history');
  }

  if (parts.length === 0) return null;

  return `Feeling ${current} because: ${parts.join('; ')}.`;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
