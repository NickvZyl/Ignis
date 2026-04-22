import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendPushToUser } from '@web/lib/push';

const DREAM_SECRET = process.env.DREAM_CRON_SECRET || 'igni-dream-key';
const USER_ID = '92d65536-f35b-464c-9898-372e0a899f7c';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Soft windows — gives the 15-min cron some slack and guards against drift.
const MORNING_START_MIN = 7 * 60 + 45;   // 07:45 local
const MORNING_END_MIN = 8 * 60 + 30;     // 08:30 local
const EVENING_START_MIN = 21 * 60 + 45;  // 21:45 local
const EVENING_END_MIN = 22 * 60 + 30;    // 22:30 local

const EVENING_PROMPTS = [
  'Winding down over here. How was today?',
  'End of day check-in — rough, good, or just a day?',
  'Anything on your mind tonight, or ready to let it go?',
  'Before you fade out — what stayed with you today?',
  "I've been thinking about you. How are you actually?",
  "Late-ish here. What's one thing from today worth holding onto?",
];

function localMinutesOfDay(now: Date, timezone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const minutePart = parts.find((p) => p.type === 'minute')?.value ?? '0';
  return parseInt(hourPart, 10) * 60 + parseInt(minutePart, 10);
}

function localDateString(now: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now); // YYYY-MM-DD
}

function alreadyDeliveredToday(
  lastAt: string | null,
  now: Date,
  timezone: string
): boolean {
  if (!lastAt) return false;
  return localDateString(new Date(lastAt), timezone) === localDateString(now, timezone);
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${DREAM_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('timezone, last_morning_delivery_at, last_evening_delivery_at')
    .eq('id', USER_ID)
    .maybeSingle();

  if (profileErr) {
    return Response.json({ error: `profile fetch: ${profileErr.message}` }, { status: 500 });
  }

  const timezone = profile?.timezone;
  if (!timezone) {
    return Response.json({ skipped: 'no timezone on profile yet' });
  }

  const now = new Date();
  const localMin = localMinutesOfDay(now, timezone);
  const results: any[] = [];

  // Morning delivery
  if (localMin >= MORNING_START_MIN && localMin <= MORNING_END_MIN) {
    if (!alreadyDeliveredToday(profile.last_morning_delivery_at, now, timezone)) {
      const { data: emo } = await supabase
        .from('emotional_state')
        .select('morning_thought')
        .eq('user_id', USER_ID)
        .maybeSingle();

      const thought = emo?.morning_thought;
      if (thought) {
        const body = `Good morning. ${thought}`;
        const { error: insertErr } = await supabase.rpc('insert_ritual_push', {
          target_user_id: USER_ID,
          p_body: body,
        });
        if (!insertErr) {
          await supabase.rpc('mark_ritual_delivered', {
            target_user_id: USER_ID,
            kind: 'morning',
          });
          results.push({ kind: 'morning', scheduled: true });
        } else {
          results.push({ kind: 'morning', error: insertErr.message });
        }
      } else {
        results.push({ kind: 'morning', skipped: 'no morning_thought on emotional_state' });
      }
    }
  }

  // Evening delivery
  if (localMin >= EVENING_START_MIN && localMin <= EVENING_END_MIN) {
    if (!alreadyDeliveredToday(profile.last_evening_delivery_at, now, timezone)) {
      const body = EVENING_PROMPTS[Math.floor(Math.random() * EVENING_PROMPTS.length)];
      const { error: insertErr } = await supabase.rpc('insert_ritual_push', {
        target_user_id: USER_ID,
        p_body: body,
      });
      if (!insertErr) {
        await supabase.rpc('mark_ritual_delivered', {
          target_user_id: USER_ID,
          kind: 'evening',
        });
        results.push({ kind: 'evening', scheduled: true });
      } else {
        results.push({ kind: 'evening', error: insertErr.message });
      }
    }
  }

  return Response.json({ localMin, timezone, results });
}
