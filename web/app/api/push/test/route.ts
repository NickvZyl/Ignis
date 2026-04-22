import { NextRequest } from 'next/server';
import { sendPushToUser } from '@web/lib/push';

const DREAM_SECRET = process.env.DREAM_CRON_SECRET || 'igni-dream-key';
const USER_ID = '92d65536-f35b-464c-9898-372e0a899f7c';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${DREAM_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title = body.title ?? 'Igni';
  const message = body.body ?? 'hey — just testing if i can reach you';

  const result = await sendPushToUser(USER_ID, { title, body: message });
  return Response.json(result);
}
