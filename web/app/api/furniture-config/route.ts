import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const CONFIG_FILE = join(process.cwd(), 'lib', 'furniture-config.json');

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const raw = await readFile(CONFIG_FILE, 'utf-8');
  return NextResponse.json(JSON.parse(raw), {
    headers: { 'Cache-Control': 'no-store, must-revalidate' },
  });
}

export async function POST(req: NextRequest) {
  const config = await req.json();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return NextResponse.json({ ok: true });
}
