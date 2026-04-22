import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!apiKey) {
    throw new Error(
      '[anthropic] ANTHROPIC_API_KEY is not set. Get one from https://console.anthropic.com/settings/keys',
    );
  }
  if (!_client) {
    const maxRetries = Number(process.env.LLM_MAX_RETRIES ?? 3);
    _client = new Anthropic({ apiKey, maxRetries });
  }
  return _client;
}

// Exp backoff + jitter wrapper for the narrow set of errors the SDK doesn't already retry.
// The SDK retries 408/409/429/5xx by default; this is the belt-and-braces second pass
// the brief asked for, with jitter so concurrent retries don't thundering-herd.
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { label: string; maxAttempts?: number } = { label: 'anthropic' },
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? Number(process.env.LLM_MAX_RETRIES ?? 3);
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status =
        err instanceof Anthropic.APIError ? err.status : undefined;
      const retryable =
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.InternalServerError ||
        status === 529;
      if (!retryable || attempt === maxAttempts - 1) {
        console.error(`[${opts.label}] failed (attempt ${attempt + 1}/${maxAttempts}):`, err);
        throw err;
      }
      const base = Math.min(1000 * 2 ** attempt, 8000);
      const jitter = Math.random() * base;
      const wait = base + jitter;
      console.warn(
        `[${opts.label}] retryable error (status ${status ?? '?'}), sleeping ${Math.round(wait)}ms before retry ${attempt + 2}/${maxAttempts}`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

export { Anthropic };
