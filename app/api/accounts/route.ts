import { NextResponse } from 'next/server';
import { demoIdentifier, listDemoAccounts } from '@/lib/accounts';
import { setupStatus } from '@/lib/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const setup = setupStatus();
  if (setup.setupRequired) {
    return NextResponse.json({
      setupRequired: true,
      missing: setup.missing,
      identifier: null,
      accounts: [],
    });
  }

  try {
    const accounts = await listDemoAccounts();
    return NextResponse.json({
      setupRequired: false,
      missing: [],
      identifier: demoIdentifier(),
      accounts,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
