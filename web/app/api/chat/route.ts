import { NextRequest } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'anthropic/claude-sonnet-4-6';

const HEADERS = {
  'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://ignis.app',
  'X-Title': 'Ignis',
};

const SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'web_search',
    description:
      'Search the web for current information. Use when the user asks about recent events, facts you are unsure about, anything needing up-to-date information, or when they ask for recipes or cooking instructions — search for a good recipe.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
};

async function openrouterFetch(body: any, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });

    if (response.ok || response.status < 500 || i === retries) {
      return response;
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error('Exhausted retries');
}

async function executeSearch(query: string): Promise<string> {
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        model: 'perplexity/sonar',
        messages: [{ role: 'user', content: query }],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      return `Search failed (${response.status}). Answer based on your existing knowledge.`;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    let result = content;
    if (citations.length > 0) {
      result += '\n\nSources:\n' + citations.map((url: string, i: number) => `[${i + 1}] ${url}`).join('\n');
    }

    return result || `Search for "${query}" returned no results. Answer based on your knowledge.`;
  } catch {
    return `Search failed. Answer based on your existing knowledge.`;
  }
}

export async function POST(req: NextRequest) {
  const { messages, stream = true } = await req.json();

  // Step 1: Non-streaming call with search tool only
  const toolResponse = await openrouterFetch({
    model: MODEL, messages, temperature: 0.85, max_tokens: 1024,
    tools: [SEARCH_TOOL],
  });

  if (!toolResponse.ok) {
    const error = await toolResponse.text();
    console.error('[Chat API] failed:', toolResponse.status, error);
    return new Response(error, { status: toolResponse.status });
  }

  const toolData = await toolResponse.json();
  const choice = toolData.choices?.[0];
  const hasSearchCalls = choice?.message?.tool_calls?.some(
    (tc: any) => tc.function.name === 'web_search'
  );

  if (hasSearchCalls) {
    const augmentedMessages = [...messages, choice.message];

    for (const tc of choice.message.tool_calls) {
      if (tc.function.name === 'web_search') {
        const args = JSON.parse(tc.function.arguments);
        const searchContent = await executeSearch(args.query);
        augmentedMessages.push({ role: 'tool', tool_call_id: tc.id, content: searchContent });
      }
    }

    if (stream) {
      const finalResponse = await openrouterFetch({
        model: MODEL, messages: augmentedMessages, temperature: 0.85, max_tokens: 1024, stream: true,
      });
      if (!finalResponse.ok) {
        const error = await finalResponse.text();
        return new Response(error, { status: finalResponse.status });
      }
      return new Response(finalResponse.body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    const finalResponse = await openrouterFetch({
      model: MODEL, messages: augmentedMessages, temperature: 0.85, max_tokens: 1024,
    });
    return new Response(finalResponse.body, { headers: { 'Content-Type': 'application/json' } });
  }

  // No search — use the content we already have
  const content = choice?.message?.content || '';

  if (stream) {
    const sseData = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
    return new Response(sseData, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  return Response.json(toolData);
}
