const fs = require('fs');

// Read .env.local for Supabase keys
const envContent = fs.readFileSync(__dirname + '/../.env.local', 'utf-8');
const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
};

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function run() {
  const lines = fs.readFileSync(__dirname + '/_embeddings.sql', 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  console.log(`Executing ${lines.length} UPDATE statements...`);

  // Execute in batches of 5 to avoid payload limits
  const batchSize = 5;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, i + batchSize);
    const sql = batch.join('\n');

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
      // The REST RPC approach might not work for raw SQL. Let's use the pg endpoint instead.
    } catch (e) {
      // fall through
    }

    // Use the Supabase Management API SQL endpoint instead
    // Actually, let's just use individual updates via the REST API
    for (const line of batch) {
      // Parse the UPDATE statement
      const match = line.match(/UPDATE memories SET embedding = '(\[.*?\])' WHERE id = '(.*?)'/);
      if (!match) {
        console.error('Failed to parse:', line.substring(0, 80));
        failed++;
        continue;
      }

      const [, embedding, id] = match;

      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/memories?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ embedding }),
        });

        if (res.ok) {
          success++;
          process.stdout.write('.');
        } else {
          const text = await res.text();
          console.error(`\nFailed for ${id}: ${res.status} ${text}`);
          failed++;
        }
      } catch (e) {
        console.error(`\nError for ${id}: ${e.message}`);
        failed++;
      }
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed out of ${lines.length}`);
}

run();
