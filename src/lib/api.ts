import type { ChatCompletionMessage } from '@/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error('Missing EXPO_PUBLIC_API_URL. Check .env.');
}

export interface ChatRequest {
  messages: ChatCompletionMessage[];
  userId: string;
  accessToken: string;
  messageId?: string;
  sessionSystem?: string;
}

export interface ChatResponse {
  content: string;
}

export async function postChat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, stream: false }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`chat ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  return { content };
}

export interface PresencePayload {
  accessToken: string;
  latitude?: number;
  longitude?: number;
  city?: string;
}

export async function postPresence(payload: PresencePayload): Promise<void> {
  // Fire-and-forget; never throw. We don't want presence pings to interrupt
  // anything user-facing.
  try {
    await fetch(`${API_URL}/api/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore — next foreground will try again
  }
}
