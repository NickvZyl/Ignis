import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@web/lib/push';

const DREAM_SECRET = process.env.DREAM_CRON_SECRET || 'igni-dream-key';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface DuePush {
  id: string;
  user_id: string;
  body: string;
  title: string | null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${DREAM_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: due, error: claimError } = await supabase.rpc('claim_due_scheduled_pushes', {
    batch_size: 20,
  });

  if (claimError) {
    return Response.json({ error: `claim failed: ${claimError.message}` }, { status: 500 });
  }

  const rows = (due ?? []) as DuePush[];
  if (rows.length === 0) {
    return Response.json({ processed: 0 });
  }

  const results: Array<{ id: string; sent: number; failed: number; skipped?: string; error?: string }> = [];

  for (const row of rows) {
    try {
      const r = await sendPushToUser(row.user_id, {
        title: row.title ?? undefined,
        body: row.body,
        data: { type: 'scheduled', scheduledPushId: row.id },
        // Scheduled pushes are explicit — user asked for one. Don't skip even
        // if they happen to be active; they explicitly asked to be reminded.
        skipIfActiveWithinSeconds: 0,
      });
      results.push({ id: row.id, sent: r.sent, failed: r.failed, skipped: r.skipped });
      if (r.failed > 0 && r.sent === 0) {
        await supabase.rpc('mark_scheduled_push_failed', {
          target_id: row.id,
          err: r.errors.join('; ').slice(0, 500),
        });
      }
    } catch (err: any) {
      results.push({ id: row.id, sent: 0, failed: 1, error: err?.message ?? 'unknown' });
      await supabase.rpc('mark_scheduled_push_failed', {
        target_id: row.id,
        err: (err?.message ?? 'unknown').slice(0, 500),
      });
    }
  }

  return Response.json({ processed: rows.length, results });
}
