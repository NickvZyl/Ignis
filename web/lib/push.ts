import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushOptions {
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

export interface PushResult {
  sent: number;
  failed: number;
  errors: string[];
}

export async function sendPushToUser(
  userId: string,
  opts: PushOptions
): Promise<PushResult> {
  const { data: tokens, error } = await supabase.rpc('get_push_tokens', {
    target_user_id: userId,
  });

  if (error) {
    return { sent: 0, failed: 0, errors: [`fetch tokens: ${error.message}`] };
  }
  if (!tokens || tokens.length === 0) {
    return { sent: 0, failed: 0, errors: ['no tokens registered for user'] };
  }

  const messages = tokens.map((t: { token: string }) => ({
    to: t.token,
    sound: opts.sound === null ? undefined : 'default',
    title: opts.title ?? 'Ignis',
    body: opts.body,
    data: opts.data ?? {},
    priority: 'high' as const,
    channelId: 'default',
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { sent: 0, failed: messages.length, errors: [`expo push ${res.status}: ${text.slice(0, 200)}`] };
  }

  const json = (await res.json()) as {
    data?: Array<{ status: 'ok' | 'error'; message?: string }>;
  };

  const results = json.data ?? [];
  let sent = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'ok') sent++;
    else if (r.message) errors.push(r.message);
  }

  return { sent, failed: messages.length - sent, errors };
}
