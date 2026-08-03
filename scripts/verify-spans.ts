/**
 * Offline verification of the TOOL span contract. No credentials required.
 *
 *   node --experimental-strip-types scripts/verify-spans.ts
 *
 * Stubs return real `ExecuteToolResponse` envelopes:
 *   `{ data?: JsonObject; executionId: string }`
 *
 * Checks the outcomes that matter:
 *
 *   1. success in `data`                         -> OK
 *   2. connector failure nested under `data`     -> ERROR  <- easy to get wrong
 *   3. thrown exception                          -> ERROR + exception recorded
 *   4. bare top-level `{ error }` (wrong shape)  -> still classifies, but
 *      regression case 2 is the one that must pass for production Scalekit
 *
 * Case 2 is the reason this file exists. AgentKit surfaces most upstream
 * failures as a resolved response with the failure inside `data`, not as a
 * throw and not as a top-level `error` on the envelope.
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { ScalekitClient } from '@scalekit-sdk/node';
import { CollectingSpanProcessor, getTrace } from '../lib/span-collector.ts';
import { tracedTools } from '../lib/traced-tools.ts';

const provider = new NodeTracerProvider({
  spanProcessors: [new CollectingSpanProcessor()],
});
provider.register();

/** Minimal shape matching SDK `ExecuteToolResponse`. */
function envelope(data: unknown, executionId = 'exec_verify_1') {
  return { data, executionId };
}

function stubClient(behaviour: () => unknown): ScalekitClient {
  return {
    tools: {
      executeTool: async () => behaviour(),
    },
  } as unknown as ScalekitClient;
}

const specFor = () => ({
  description: 'Send a message to a channel',
  parameters: { type: 'object', properties: { text: { type: 'string' } } },
});

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`, detail !== undefined ? detail : '');
  }
}

async function runCase(
  label: string,
  behaviour: () => unknown,
  expectedStatus: SpanStatusCode,
  extras?: {
    expectException?: boolean;
    outputIncludes?: string;
  }
) {
  console.log(`\n${label}`);

  const tools = tracedTools(stubClient(behaviour), { specFor });
  const tracer = trace.getTracer('verify');

  let traceId = '';
  await tracer.startActiveSpan('run_agent', async (parent) => {
    traceId = parent.spanContext().traceId;
    try {
      await tools.executeTool(
        {
          toolName: 'slack.chat.postMessage',
          identifier: 'demo-identifier',
          params: { text: 'hi' },
          connector: 'SLACK',
          organizationId: 'org_demo',
        },
        'call_abc123'
      );
    } catch {
      // expected in the throwing case
    }
    parent.end();
  });

  const toolSpan = getTrace(traceId).find((span) => span.kind === 'TOOL');
  if (!toolSpan) {
    failures += 1;
    console.log('  FAIL  no TOOL span was produced');
    return;
  }

  check('span kind is TOOL', toolSpan.kind === 'TOOL');
  check(
    `status is ${SpanStatusCode[expectedStatus]}`,
    toolSpan.statusCode === expectedStatus,
    `got ${SpanStatusCode[toolSpan.statusCode]}`
  );
  check(
    'status is never UNSET',
    toolSpan.statusCode !== SpanStatusCode.UNSET
  );
  check(
    'tool.name set',
    toolSpan.attributes['tool.name'] === 'slack.chat.postMessage'
  );
  check(
    'tool.description set',
    Boolean(toolSpan.attributes['tool.description'])
  );
  check(
    'tool.parameters set',
    Boolean(toolSpan.attributes['tool.parameters'])
  );
  check(
    'tool.id links to model tool_call',
    toolSpan.attributes['tool.id'] === 'call_abc123'
  );
  check('input.value set', Boolean(toolSpan.attributes['input.value']));
  check('output.value set', Boolean(toolSpan.attributes['output.value']));
  check(
    'scalekit metadata set',
    toolSpan.attributes['scalekit.connector'] === 'SLACK' &&
      toolSpan.attributes['scalekit.organization_id'] === 'org_demo'
  );
  check(
    'TOOL span nests under the agent span',
    Boolean(toolSpan.parentSpanId)
  );

  if (extras?.expectException) {
    check(
      'exception recorded on span',
      toolSpan.hasException === true,
      toolSpan
    );
    check(
      'status message present',
      Boolean(toolSpan.statusMessage),
      toolSpan.statusMessage
    );
  }

  if (extras?.outputIncludes) {
    const output = String(toolSpan.attributes['output.value'] ?? '');
    check(
      `output.value contains "${extras.outputIncludes}"`,
      output.includes(extras.outputIncludes),
      output
    );
  }
}

await runCase(
  '1. success envelope { data: { ok: true }, executionId } -> OK',
  () => envelope({ ok: true, ts: '1699.123', channel: 'C0123' }),
  SpanStatusCode.OK,
  { outputIncludes: 'executionId' }
);

await runCase(
  '2. resolved failure under data (SDK shape) -> ERROR',
  () =>
    envelope({
      ok: false,
      error: 'missing_scope',
      message: 'chat:write not granted',
    }),
  SpanStatusCode.ERROR,
  { outputIncludes: 'missing_scope' }
);

await runCase(
  '3. thrown exception -> ERROR + exception recorded',
  () => {
    throw new Error('connection reset');
  },
  SpanStatusCode.ERROR,
  { expectException: true, outputIncludes: 'connection reset' }
);

// Nested status / error variants that real connectors emit inside `data`.
await runCase(
  '4. data.statusCode 403 -> ERROR',
  () => envelope({ statusCode: 403, message: 'forbidden' }),
  SpanStatusCode.ERROR,
  { outputIncludes: '403' }
);

await runCase(
  '5. data.error object -> ERROR',
  () =>
    envelope({
      error: { code: 'invalid_grant', message: 'token revoked' },
    }),
  SpanStatusCode.ERROR,
  { outputIncludes: 'invalid_grant' }
);

// Guard against reintroducing top-level-only classification: a success
// envelope must not be marked ERROR just because a nested field is noisy.
await runCase(
  '6. success with nested warning field -> OK',
  () => envelope({ ok: true, warning: 'rate_limit_near' }),
  SpanStatusCode.OK
);

console.log(
  failures === 0
    ? '\nAll span-contract checks passed.'
    : `\n${failures} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);
