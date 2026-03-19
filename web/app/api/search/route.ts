import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl);
    const data = await res.json();

    const results: Array<{ title: string; snippet: string; url: string }> = [];

    if (data.Abstract) {
      results.push({
        title: data.Heading || 'Summary',
        snippet: data.Abstract,
        url: data.AbstractURL || '',
      });
    }

    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text) {
          results.push({
            title: topic.Text.slice(0, 80),
            snippet: topic.Text,
            url: topic.FirstURL || '',
          });
        }
      }
    }

    if (results.length === 0) {
      return Response.json({
        results: `Search for "${query}" returned no instant results. Answer based on your knowledge, or let the user know you couldn't find current information.`,
      });
    }

    const formatted = results
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}${r.url ? '\n' + r.url : ''}`)
      .join('\n\n');

    return Response.json({ results: formatted });
  } catch (err: any) {
    return Response.json({
      results: `Search failed: ${err.message}. Answer based on your existing knowledge.`,
    });
  }
}
