import { CONFIG } from '@/constants/config';
import type { LLMContext } from './context';

// Explicit override wins. Model switches invalidate the prompt cache (caches are
// model-scoped), so keep routing stable across a conversation where possible.
const ENV_MODEL = process.env.ANTHROPIC_MODEL;

// Heuristics for bumping up to Opus: rare, explicit triggers only. The default
// Sonnet floor handles conversational and emotional depth well.
export function pickModel(opts: {
  ctx?: LLMContext;
  incomingMessage?: string;
  needsWebSearch?: boolean;
  forceModel?: string;
}): string {
  if (opts.forceModel) return opts.forceModel;
  if (ENV_MODEL) return ENV_MODEL;

  const msg = (opts.incomingMessage ?? '').toLowerCase();

  // Opus triggers: long-horizon thinking, dense synthesis, explicit asks.
  const opusHints = [
    'think through',
    'help me figure out',
    'weigh',
    'should i',
    'long term',
    'big decision',
    'analyze',
    'walk me through',
  ];
  if (opusHints.some((h) => msg.includes(h))) return CONFIG.anthropic.opusModel;

  // If the user drift is high and attachment is high, the conversation is about
  // to be emotionally loaded — Opus earns its keep here.
  if (opts.ctx && opts.ctx.state.drift > 0.7 && opts.ctx.state.attachment > 0.5) {
    return CONFIG.anthropic.opusModel;
  }

  // Web search adds compute overhead server-side; Opus handles synthesis of
  // search results more reliably.
  if (opts.needsWebSearch) return CONFIG.anthropic.opusModel;

  return CONFIG.anthropic.defaultModel;
}

// For non-chat sub-tasks (extraction, classification, structured parses) —
// Haiku is fine. Explicit helper so each caller doesn't redecide.
export function pickUtilityModel(): string {
  return process.env.ANTHROPIC_UTILITY_MODEL ?? CONFIG.anthropic.haikuModel;
}
