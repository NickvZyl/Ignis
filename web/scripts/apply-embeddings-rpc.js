const fs = require('fs');

// Read .env.local
const envContent = fs.readFileSync(__dirname + '/../.env.local', 'utf-8');
const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
};

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

async function run() {
  const lines = fs.readFileSync(__dirname + '/_embeddings.sql', 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  console.log(`Applying ${lines.length} embedding updates via RPC...`);

  let success = 0;
  let failed = 0;

  for (const line of lines) {
    const match = line.match(/UPDATE memories SET embedding = '(\[.*?\])' WHERE id = '(.*?)'/);
    if (!match) {
      console.error('Parse error:', line.substring(0, 80));
      failed++;
      continue;
    }

    const [, embeddingStr, id] = match;

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_memory_embedding`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memory_id: id,
          embedding_vector: embeddingStr,
        }),
      });

      if (res.ok) {
        success++;
        process.stdout.write('.');
      } else {
        const text = await res.text();
        console.error(`\nFailed ${id}: ${res.status} ${text}`);
        failed++;
      }
    } catch (e) {
      console.error(`\nError ${id}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed`);
}

run();
