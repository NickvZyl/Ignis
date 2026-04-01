const fs = require('fs');

const OPENROUTER_KEY = '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';
const SUPABASE_URL = 'https://oolktmyiavmhgxbvjlpd.supabase.co';
// Use the service_role key or just generate SQL for MCP
// We'll generate SQL statements and pipe them through Supabase MCP

async function getEmbedding(text) {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text,
      dimensions: 1536,
    }),
  });
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

async function run() {
  // Read memory IDs and content from stdin or hardcoded
  const memoriesRaw = fs.readFileSync(__dirname + '/_memories.json', 'utf-8');
  const memories = JSON.parse(memoriesRaw);

  console.log(`Processing ${memories.length} memories...`);
  const sqlLines = [];
  let done = 0;

  for (const mem of memories) {
    try {
      const embedding = await getEmbedding(mem.content);
      const vecStr = '[' + embedding.join(',') + ']';
      sqlLines.push(`UPDATE memories SET embedding = '${vecStr}' WHERE id = '${mem.id}';`);
      done++;
      process.stdout.write('.');
    } catch (e) {
      console.error(`\nFailed for ${mem.id}: ${e.message}`);
    }
  }

  fs.writeFileSync(__dirname + '/_embeddings.sql', sqlLines.join('\n'));
  console.log(`\nDone: ${done}/${memories.length} embeddings generated`);
  console.log(`SQL written to scripts/_embeddings.sql`);
}

run();
