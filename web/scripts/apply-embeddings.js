const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Read .env.local
const envContent = fs.readFileSync(__dirname + '/../.env.local', 'utf-8');
const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
};

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const lines = fs.readFileSync(__dirname + '/_embeddings.sql', 'utf-8')
    .split('\n')
    .filter(l => l.trim());

  console.log(`Applying ${lines.length} embedding updates...`);

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

    const { error } = await supabase
      .from('memories')
      .update({ embedding: embeddingStr })
      .eq('id', id);

    if (error) {
      console.error(`\nFailed ${id}: ${error.message}`);
      failed++;
    } else {
      success++;
      process.stdout.write('.');
    }
  }

  console.log(`\nDone: ${success} succeeded, ${failed} failed`);
}

run();
