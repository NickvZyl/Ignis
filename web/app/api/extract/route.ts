import { NextRequest } from 'next/server';
import { getAnthropic, withRetry, Anthropic } from '@/lib/anthropic';
import { pickUtilityModel } from '@/lib/llm/router';
import { logLLMCall } from '@/lib/llm/logger';

// Extraction is structured, not conversational — Haiku is fine.
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const { messages, userId } = await req.json();

  // Anthropic requires system as a top-level field, not inside messages.
  const systemMsg = messages.find((m: any) => m.role === 'system');
  const convo = messages.filter((m: any) => m.role !== 'system');
  const model = pickUtilityModel();

  try {
    const client = getAnthropic();
    const response = await withRetry(
      () =>
        client.messages.create({
          model,
          max_tokens: 1024,
          temperature: 0.3,
          system: systemMsg?.content ?? '',
          messages: convo.map((m: any) => ({ role: m.role, content: m.content })),
        }),
      { label: 'extract' },
    );

    const content =
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('') || '[]';

    logLLMCall({
      userId: userId ?? null,
      route: 'extract',
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
      toolsUsed: [],
    });

    return Response.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logLLMCall({
      userId: userId ?? null,
      route: 'extract',
      model,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      latencyMs: Date.now() - startedAt,
      toolsUsed: [],
      error: msg,
    });
    return new Response(msg, { status: 500 });
  }
}
