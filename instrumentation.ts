/**
 * Next.js instrumentation hook. Runs once per server process, before any route
 * handler is imported — which is the only place tracing setup can go if the
 * OpenAI instrumentor is to patch the SDK before a client is constructed.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { initArize } = await import('./lib/arize');
  await initArize();
}
