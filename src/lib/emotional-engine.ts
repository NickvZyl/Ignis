import { CONFIG } from '@/constants/config';
import type { EmotionalState, EmotionLabel, RoleLabel, EmotionalSignals } from '@/types';

const { emotional } = CONFIG;

// Positive/negative/depth keyword lists for heuristic analysis
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

// Role detection keyword lists
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

/**
 * Compute emotional state changes when the user opens the app after absence.
 */
export function computeSessionStart(state: EmotionalState): Partial<EmotionalState> {
  const now = new Date();
  const lastInteraction = new Date(state.last_interaction_at);
  const hoursSince = (now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60);

  if (hoursSince < 0.1) return {}; // Less than 6 minutes, no change

  const attachmentDamping = 1 - state.attachment * 0.5;
  const newDrift = Math.min(1.0, state.drift + (hoursSince / emotional.driftTimeHours) * attachmentDamping);

  // Valence drifts toward 0.5 (neutral)
  const valenceDecay = Math.min(1, hoursSince / emotional.driftTimeHours);
  const newValence = state.valence + (0.5 - state.valence) * valenceDecay * emotional.valenceDecayRate;

  // Arousal decays toward low
  const arousalDecay = Math.min(1, hoursSince / 24);
  const newArousal = state.arousal + (emotional.arousalDecayTarget - state.arousal) * arousalDecay;

  const updated = {
    valence: clamp(newValence),
    arousal: clamp(newArousal),
    drift: clamp(newDrift),
  };

  return {
    ...updated,
    active_emotion: deriveEmotion({ ...state, ...updated }),
    // When returning after drift, wear caring hat; otherwise hide hat
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
  // Arousal decays toward 0.35 — enough to prevent lockup, slow enough to allow movement
  const arousalDecay = (0.35 - state.arousal) * 0.12;
  const newArousal = clamp(state.arousal + arousalDecay + signals.arousal_shift * 0.2);

  const updated = {
    valence: newValence,
    arousal: newArousal,
    attachment: newAttachment,
    drift: newDrift,
    last_interaction_at: new Date().toISOString(),
  };

  const active_emotion = deriveEmotion({ ...state, ...updated });
  const active_role = deriveRole(userMessage, { ...state, ...updated });

  return {
    stateChanges: { ...updated, active_emotion, active_role },
    signals,
  };
}

/**
 * Analyze a message for emotional signals using keyword heuristics.
 */
function analyzeMessage(message: string): EmotionalSignals {
  const lower = message.toLowerCase();
  const words = lower.split(/\s+/);

  let positiveCount = 0;
  let negativeCount = 0;
  let depthCount = 0;
  const matchedKeywords: string[] = [];

  for (const keyword of POSITIVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      positiveCount++;
      matchedKeywords.push(keyword);
    }
  }
  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      negativeCount++;
      matchedKeywords.push(keyword);
    }
  }
  for (const keyword of DEPTH_KEYWORDS) {
    if (lower.includes(keyword)) {
      depthCount++;
      matchedKeywords.push(keyword);
    }
  }

  // Longer messages signal more engagement
  const lengthBonus = Math.min(0.3, words.length / 80);

  const valence_shift = (positiveCount - negativeCount) * 0.15 + lengthBonus * 0.1;
  const arousal_shift = 0.05 + (positiveCount + negativeCount) * 0.08 + lengthBonus * 0.3;
  const depth_signal = Math.min(2, depthCount * 0.5 + (words.length > 20 ? 0.5 : 0));

  return {
    valence_shift: clamp(valence_shift, -1, 1),
    arousal_shift: clamp(arousal_shift, -1, 1),
    depth_signal,
    keywords: matchedKeywords,
  };
}

/**
 * Derive the current emotion label from continuous dimensions.
 * Drift moves toward deep → reflective (purple → blue), not grey.
 * Default resting state is warm (pink).
 */
export function deriveEmotion(state: Pick<EmotionalState, 'valence' | 'arousal' | 'drift'>): EmotionLabel {
  const { valence, arousal, drift } = state;

  // Drift states take priority
  if (drift > 0.6) return 'reflective';             // blue — withdrawn, quiet
  if (drift > 0.3) return 'deep';                    // purple — distant, introspective

  // High energy states
  if (arousal > 0.6 && valence > 0.6) return 'intense';   // red — passionate, excited
  if (arousal > 0.5 && valence > 0.45) return 'bright';   // yellow — energised, engaged
  if (arousal > 0.5 && valence <= 0.45) return 'eager';   // orange — restless, driven

  // Low energy states
  if (valence < 0.35) return 'grounded';            // green — subdued but stable
  if (valence >= 0.35 && valence <= 0.55 && arousal <= 0.5) return 'grounded';  // green — calm

  // Default resting — only when genuinely relaxed and positive
  return 'warm';                                     // pink — affectionate, content
}

/**
 * Derive the current role hat from message content and state.
 * Returns null when no task-oriented language detected (hat hides).
 */
export function deriveRole(message: string, state: Pick<EmotionalState, 'drift'>): RoleLabel {
  const lower = message.toLowerCase();

  // Memory retrieval context
  for (const keyword of MEMORY_KEYWORDS) {
    if (lower.includes(keyword)) return 'remembering';
  }

  // Task/creation language
  for (const keyword of BUILDING_KEYWORDS) {
    if (lower.includes(keyword)) return 'building';
  }

  // Question/research language
  for (const keyword of CURIOUS_KEYWORDS) {
    if (lower.includes(keyword)) return 'curious';
  }

  // Planning/reasoning language
  for (const keyword of THINKING_KEYWORDS) {
    if (lower.includes(keyword)) return 'thinking';
  }

  // Emotional support language
  for (const keyword of CARING_KEYWORDS) {
    if (lower.includes(keyword)) return 'caring';
  }

  // Urgency language
  for (const keyword of URGENT_KEYWORDS) {
    if (lower.includes(keyword)) return 'urgent';
  }

  // General task language
  for (const keyword of TASK_KEYWORDS) {
    if (lower.includes(keyword)) return 'active';
  }

  // No task-oriented language — hide hat
  return null;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
