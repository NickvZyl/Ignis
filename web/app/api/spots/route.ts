import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const SPOTS_FILE = join(process.cwd(), 'lib', 'spot-defaults.json');

export async function GET() {
  const raw = await readFile(SPOTS_FILE, 'utf-8');
  return NextResponse.json(JSON.parse(raw));
}

export async function POST(req: NextRequest) {
  const spots = await req.json();
  await writeFile(SPOTS_FILE, JSON.stringify(spots, null, 2) + '\n', 'utf-8');
  return NextResponse.json({ ok: true });
}
