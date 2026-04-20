// Per-million-token USD prices for the Anthropic models we use. Update here when
// Anthropic's pricing changes — every logger call reads this.
//
// Cache read = 0.1× base input. Cache write (5-min TTL) = 1.25× base input.
// Source: https://platform.claude.com/docs/en/pricing
export const PRICING: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  'claude-opus-4-7': {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  'claude-opus-4-6': {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  'claude-sonnet-4-6': {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  'claude-haiku-4-5': {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
};

export function estimateCostUsd(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  },
): number {
  const p = PRICING[model];
  if (!p) return 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cost =
    (usage.input_tokens * p.input) / 1_000_000 +
    (usage.output_tokens * p.output) / 1_000_000 +
    (cacheRead * p.cacheRead) / 1_000_000 +
    (cacheWrite * p.cacheWrite) / 1_000_000;
  return Number(cost.toFixed(6));
}
