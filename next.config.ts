import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep the OpenTelemetry SDK and the Scalekit SDK out of the server bundle.
  //
  // Why this matters: bundlers rewrite module identity, which breaks the
  // require-in-the-middle hooking that OpenTelemetry auto-instrumentation
  // normally relies on. We also call `manuallyInstrument()` in lib/arize.ts as a
  // belt-and-braces measure — see the comment there.
  serverExternalPackages: [
    '@opentelemetry/sdk-trace-node',
    '@opentelemetry/exporter-trace-otlp-proto',
    '@opentelemetry/instrumentation',
    '@opentelemetry/api',
    '@arizeai/openinference-instrumentation-openai',
    '@scalekit-sdk/node',
    // Must match the module identity that `manuallyInstrument()` patches in
    // lib/arize.ts. If Next bundles a second copy for lib/agent.ts, LLM spans
    // silently disappear while TOOL spans still show up.
    'openai',
  ],
};

export default nextConfig;
