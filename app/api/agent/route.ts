import { NextResponse } from 'next/server';
import { runAgent } from '@/lib/agent';
import { flushTraces } from '@/lib/arize';
import { getTrace } from '@/lib/span-collector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const identifier = process.env.TEST_IDENTIFIER;
  if (!identifier) {
    return NextResponse.json(
      { error: 'TEST_IDENTIFIER is not set — see .env.example' },
      { status: 500 }
    );
  }

  let message: string;
  try {
    const body = await request.json();
    message = String(body.message ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  try {
    const result = await runAgent(message, identifier);

    // Local capture is synchronous on span end. OTLP export uses a batch
    // processor — flush so Arize is more likely to have the trace when the
    // user switches tabs. Failures here must not break the demo response.
    try {
      await flushTraces();
    } catch (flushError) {
      console.warn('[agent] trace flush failed:', flushError);
    }

    const spans = getTrace(result.traceId);
    if (spans.length === 0) {
      console.warn(
        `[agent] no local spans for trace=${result.traceId} recording=${result.recording} — UI tree empty; Arize export may still work`
      );
    }

    return NextResponse.json({
      reply: result.reply,
      traceId: result.traceId,
      turns: result.turns,
      toolCount: result.toolCount,
      recording: result.recording,
      spans,
    });
  } catch (error) {
    console.error('[agent] run failed:', error);
    try {
      await flushTraces();
    } catch {
      // ignore
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
