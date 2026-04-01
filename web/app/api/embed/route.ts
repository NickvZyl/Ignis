import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text) return new Response('Missing text', { status: 400 });

  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text,
      dimensions: 1536,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    return new Response(error, { status: res.status });
  }

  const data = await res.json();
  return Response.json({ embedding: data.data[0].embedding });
}
