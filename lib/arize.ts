/**
 * Arize Phoenix tracer setup.
 *
 * Called once from `instrumentation.ts` (Next.js runs that before any route
 * module is imported). Order matters and is not negotiable:
 *
 *   1. register the TracerProvider
 *   2. register instrumentors
 *   3. only then create the OpenAI client
 *
 * `lib/agent.ts` constructs its OpenAI client lazily for exactly this reason.
 *
 * Destination is local Arize Phoenix (OTLP HTTP). No Arize AX space/key.
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
 * The OTLP HTTP exporter needs the signal-specific path. Accept a `/v1` base
 * or a full `/v1/traces` URL so a missing suffix does not become a silent miss.
 */
function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? `${trimmed}/traces` : trimmed;
}

const DEFAULT_PHOENIX_OTLP = 'http://localhost:6006/v1/traces';

export async function initArize(): Promise<void> {
  if (started) return;
  started = true;

  const projectName =
    process.env.PHOENIX_PROJECT_NAME ??
    process.env.ARIZE_PROJECT_NAME ??
    'agentkit-tracing-demo';

  const endpoint = normalizeEndpoint(
    process.env.PHOENIX_COLLECTOR_ENDPOINT ??
      process.env.PHOENIX_OTLP_ENDPOINT ??
      DEFAULT_PHOENIX_OTLP
  );

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [SEMRESATTRS_PROJECT_NAME]: projectName,
      [ATTR_SERVICE_NAME]: 'arize-agentkit-tracing-demo',
    }),
    spanProcessors: [
      new CollectingSpanProcessor(), // demo UI tree
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: endpoint,
        })
      ),
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
    `[phoenix] tracing initialised — project="${projectName}" endpoint="${endpoint}"`
  );
}

/**
 * Flush pending OTLP batches so a just-finished demo run is more likely to
 * appear in Arize Phoenix before the user switches tabs. Local capture is synchronous;
 * export is not.
 */
export async function flushTraces(): Promise<void> {
  await provider?.forceFlush();
}
