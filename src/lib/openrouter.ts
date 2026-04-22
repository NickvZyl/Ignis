import { CONFIG } from '@/constants/config';
import type { ChatCompletionMessage } from '@/types';

const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY!;

const headers = {
  'Authorization': `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://ignis.app',
  'X-Title': 'Ignis',
};

/**
 * Non-streaming chat completion (used for memory extraction etc.)
 */
export async function chatCompletion(messages: ChatCompletionMessage[]): Promise<string> {
  const response = await fetch(`${CONFIG.openrouter.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: CONFIG.openrouter.chatModel,
      messages,
      temperature: 0.85,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Streaming chat completion. Calls onToken for each chunk, returns full text.
 */
export async function chatCompletionStream(
  messages: ChatCompletionMessage[],
  onToken: (token: string) => void,
): Promise<string> {
  const response = await fetch(`${CONFIG.openrouter.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: CONFIG.openrouter.chatModel,
      messages,
      temperature: 0.85,
      max_tokens: 1024,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body for streaming');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines
    const lines = buffer.split('\n');
    // Keep the last potentially incomplete line in buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onToken(delta);
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return fullText;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${CONFIG.openrouter.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CONFIG.openrouter.embeddingModel,
      input: text,
      dimensions: CONFIG.openrouter.embeddingDimensions,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}
