import { NextRequest } from 'next/server';
import { getAnthropic, withRetry, Anthropic } from '@/lib/anthropic';
import { CONFIG } from '@/constants/config';
import { logLLMCall } from '@/lib/llm/logger';

// Reflection is emotional narrative generation — Sonnet default for nuance.
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const { messages, userId } = await req.json();

  const systemMsg = messages.find((m: any) => m.role === 'system');
  const convo = messages.filter((m: any) => m.role !== 'system');
  const model = process.env.ANTHROPIC_MODEL ?? CONFIG.anthropic.defaultModel;

  try {
    const client = getAnthropic();
    const response = await withRetry(
      () =>
        client.messages.create({
          model,
          max_tokens: 512,
          temperature: 0.9,
          system: systemMsg?.content ?? '',
          messages: convo.map((m: any) => ({ role: m.role, content: m.content })),
        }),
      { label: 'reflect' },
    );

    const content =
      response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('') || '{}';

    logLLMCall({
      userId: userId ?? null,
      route: 'reflect',
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
      userId: userId ?? null, route: 'reflect', model,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      latencyMs: Date.now() - startedAt, toolsUsed: [], error: msg,
    });
    return new Response(msg, { status: 500 });
  }
}
