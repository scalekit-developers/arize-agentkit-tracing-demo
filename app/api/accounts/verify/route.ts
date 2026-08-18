import { finishConnect } from '@/lib/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authRequestId = url.searchParams.get('auth_request_id') ?? '';
  const state = url.searchParams.get('state') ?? '';

  if (!authRequestId || !state) {
    return new Response('Missing auth_request_id or state', { status: 400 });
  }

  try {
    await finishConnect({ authRequestId, state });
    return new Response(
      `<!doctype html><html><body style="font-family:ui-monospace,monospace;padding:2rem">
        <h1>Account connected</h1>
        <p>You can close this tab. The lab tab will refresh the status.</p>
      </body></html>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  } catch (error) {
    return new Response(`Verification failed: ${String(error)}`, { status: 500 });
  }
}
