// Server-side fallback for building the session-stable system prompt block.
// Used when the client doesn't send `sessionSystem` (e.g. the mobile app, which
// doesn't have access to the web's frontend stores). Matches the format of the
// client-side buildSessionStablePrompt in src/prompts/system.ts so Igni's
// behavior is consistent across clients.
//
// Scope: self_knowledge (capabilities + emotional self-understanding), user
// name, and recent changelog. Per-call overhead is 3 cheap Supabase queries.
// Cached for an hour by the Anthropic prompt cache once built, so amortized
// cost is near zero.

import type { SupabaseClient } from '@supabase/supabase-js';

interface SelfKnowledgeRow {
  category: string;
  key: string;
  content: string;
}

interface ChangelogRow {
  summary: string;
  details: string | null;
  created_at: string;
}

export async function buildServerSessionPrompt(
  db: SupabaseClient,
  userId: string
): Promise<string> {
  const [skRes, profileRes, changelogRes] = await Promise.all([
    db
      .from('self_knowledge')
      .select('category, key, content')
      .eq('user_id', userId)
      .in('category', ['capability', 'emotional']),
    db
      .from('profiles')
      .select('display_name, location_city, latitude, longitude, location_updated_at')
      .eq('id', userId)
      .maybeSingle(),
    db
      .from('changelogs')
      .select('summary, details, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const parts: string[] = [];

  const userName = profileRes.data?.display_name;
  if (userName) {
    parts.push(`Your person is ${userName}.`);
  }

  const city = profileRes.data?.location_city;
  const lat = profileRes.data?.latitude;
  const lon = profileRes.data?.longitude;
  if (city || (lat != null && lon != null)) {
    const label = city ? city : `${lat?.toFixed(3)}, ${lon?.toFixed(3)}`;
    parts.push(`Your person's current area: ${label}. Reference naturally — don't be creepy about it, treat it like knowing what city a friend is in.`);
  }

  const skRows = (skRes.data ?? []) as SelfKnowledgeRow[];
  const caps = skRows.filter((sk) => sk.category === 'capability');
  const emo = skRows.filter((sk) => sk.category === 'emotional');
  if (caps.length > 0) {
    parts.push(
      `Your capabilities:\n${caps.map((sk) => `- ${sk.key}: ${sk.content}`).join('\n')}`
    );
  }
  if (emo.length > 0) {
    parts.push(
      `Your emotional self-understanding:\n${emo.map((sk) => `- ${sk.content}`).join('\n')}`
    );
  }

  const changes = (changelogRes.data ?? []) as ChangelogRow[];
  if (changes.length > 0) {
    const formatted = changes.map((c) => {
      const d = new Date(c.created_at);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const detail = c.details ? `\n  ${c.details}` : '';
      return `[${dateStr}] ${c.summary}${detail}`;
    });
    parts.push(
      `Recent changes to how you work (your person made these — reference naturally if asked "do you feel different?" or "what changed?"):\n${formatted.join('\n')}`
    );
  }

  return parts.join('\n\n');
}
