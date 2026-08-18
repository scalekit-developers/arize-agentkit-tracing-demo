import { NextResponse } from 'next/server';
import { startConnect } from '@/lib/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function originFrom(request: Request): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  if (host) return `${proto}://${host}`;
  return 'http://localhost:3000';
}

export async function POST(request: Request) {
  let connector: string;
  try {
    const body = await request.json();
    connector = String(body.connector ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!connector) {
    return NextResponse.json({ error: 'connector is required' }, { status: 400 });
  }

  try {
    const result = await startConnect(connector, originFrom(request));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
