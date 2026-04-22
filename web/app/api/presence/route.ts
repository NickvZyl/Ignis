import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const accessToken = body.accessToken as string | undefined;
  if (!accessToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { error } = await client.rpc('mark_user_active', {
    p_latitude: typeof body.latitude === 'number' ? body.latitude : null,
    p_longitude: typeof body.longitude === 'number' ? body.longitude : null,
    p_location_city: typeof body.city === 'string' ? body.city : null,
  });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
