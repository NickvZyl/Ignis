import { NextRequest } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ignis.app',
      'X-Title': 'Ignis',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-6',
      messages,
      temperature: 0.9,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return new Response(error, { status: response.status });
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return Response.json({ content });
}
