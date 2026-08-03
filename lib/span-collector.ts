/**
 * In-memory span collector — demo affordance only, not part of the integration.
 *
 * Arize is the real destination. This exists so the UI can render the span tree
 * immediately after a run, which makes the demo self-evident without asking you
 * to alt-tab and hunt for a trace ID. Delete it when adapting this to a real app.
 */

import type { SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-node';

export interface CapturedSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: string;
  statusCode: number;
  statusMessage?: string;
  durationMs: number;
  attributes: Record<string, unknown>;
  /** True when `span.recordException` ran (OTel event name `exception`). */
  hasException: boolean;
}

/**
 * Process-global store. Next/Turbopack can evaluate this module more than once
 * (instrumentation hook vs route bundle). A module-local Map would leave the
 * API route reading an empty collector while spans landed in a twin instance.
 */
const globalForSpans = globalThis as typeof globalThis & {
  __arizeAgentkitTraces?: Map<string, CapturedSpan[]>;
};

/** traceId -> spans. Capped so a long-running dev server can't grow unbounded. */
const traces =
  globalForSpans.__arizeAgentkitTraces ??
  (globalForSpans.__arizeAgentkitTraces = new Map<string, CapturedSpan[]>());
const MAX_TRACES = 20;

export class CollectingSpanProcessor implements SpanProcessor {
  onStart(): void {}

  onEnd(span: ReadableSpan): void {
    const traceId = span.spanContext().traceId;
    const [seconds, nanos] = span.duration;

    const existing = traces.get(traceId) ?? [];
    existing.push({
      spanId: span.spanContext().spanId,
      parentSpanId: span.parentSpanContext?.spanId,
      name: span.name,
      kind: span.attributes['openinference.span.kind'] as string | undefined,
      statusCode: span.status.code,
      statusMessage: span.status.message,
      durationMs: seconds * 1000 + nanos / 1e6,
      attributes: span.attributes as Record<string, unknown>,
      hasException: span.events.some((event) => event.name === 'exception'),
    });
    traces.set(traceId, existing);

    while (traces.size > MAX_TRACES) {
      const oldest = traces.keys().next().value;
      if (oldest === undefined) break;
      traces.delete(oldest);
    }
  }

  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
}

export function getTrace(traceId: string): CapturedSpan[] {
  return traces.get(traceId) ?? [];
}
