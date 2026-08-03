/**
 * Arize AX tracer setup.
 *
 * Called once from `instrumentation.ts` (Next.js runs that before any route
 * module is imported). Order matters and is not negotiable:
 *
 *   1. register the TracerProvider
 *   2. register instrumentors
 *   3. only then create the OpenAI client
 *
 * `lib/agent.ts` constructs its OpenAI client lazily for exactly this reason.
 */

import { NodeTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { SEMRESATTRS_PROJECT_NAME } from '@arizeai/openinference-semantic-conventions';
import { OpenAIInstrumentation } from '@arizeai/openinference-instrumentation-openai';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { CollectingSpanProcessor } from './span-collector';

let started = false;
let provider: NodeTracerProvider | undefined;

/**
 * The OTLP HTTP exporter needs the signal-specific path. Arize's docs and the
 * gRPC transport both use the `/v1` base, so accept either and fix it up rather
 * than failing in the way that is hardest to diagnose — a silent no-op export.
 */
function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? `${trimmed}/traces` : trimmed;
}

export async function initArize(): Promise<void> {
  if (started) return;
  started = true;

  const spaceId = process.env.ARIZE_SPACE_ID;
  const apiKey = process.env.ARIZE_API_KEY;
  const projectName = process.env.ARIZE_PROJECT_NAME ?? 'agentkit-tracing-demo';

  if (!spaceId || !apiKey) {
    console.warn(
      '[arize] ARIZE_SPACE_ID / ARIZE_API_KEY not set — running with local span capture only, nothing will be exported.'
    );
  }

  // Region is NOT assumed. Arize runs US / EU / Canada clusters and sending to
  // the wrong one fails in a way that looks exactly like "no traces". See
  // .env.example for the full endpoint table.
  const endpoint = normalizeEndpoint(
    process.env.ARIZE_COLLECTOR_ENDPOINT ??
      process.env.ARIZE_OTLP_ENDPOINT ??
      'https://otlp.arize.com/v1/traces'
  );

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      // Required. Arize rejects the export with a 500 if the project name is
      // missing — service.name alone is not enough.
      [SEMRESATTRS_PROJECT_NAME]: projectName,
      [ATTR_SERVICE_NAME]: 'arize-agentkit-tracing-demo',
    }),
    spanProcessors: [
      new CollectingSpanProcessor(), // demo-only, see span-collector.ts
      ...(spaceId && apiKey
        ? [
            new BatchSpanProcessor(
              new OTLPTraceExporter({
                url: endpoint,
                headers: { space_id: spaceId, api_key: apiKey },
              })
            ),
          ]
        : []),
    ],
  });

  provider.register();

  const openAIInstrumentation = new OpenAIInstrumentation();
  registerInstrumentations({ instrumentations: [openAIInstrumentation] });

  // Next.js bundles server code, which rewrites module identity and defeats the
  // require-in-the-middle hooking `registerInstrumentations` relies on. Patching
  // the imported module object directly is the supported escape hatch. Without
  // this you get TOOL spans but no LLM spans — a trace with a hole in it.
  //
  // Dynamic import rather than require(): this module is compiled as ESM, where
  // require() is not available. The instrumentor reads `module.OpenAI` and
  // tolerates the namespace object being frozen.
  const openaiModule = await import('openai');
  openAIInstrumentation.manuallyInstrument(
    openaiModule as unknown as Parameters<
      typeof openAIInstrumentation.manuallyInstrument
    >[0]
  );

  console.log(
    `[arize] tracing initialised — project="${projectName}" endpoint="${endpoint}"`
  );
}

/**
 * Flush pending OTLP batches so a just-finished demo run is more likely to
 * appear in Arize before the user switches tabs. Local capture is synchronous;
 * export is not. No-op when the exporter was never registered.
 */
export async function flushTraces(): Promise<void> {
  await provider?.forceFlush();
}
