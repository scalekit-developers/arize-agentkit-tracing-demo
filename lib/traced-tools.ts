/**
 * OpenTelemetry / OpenInference tracing for Scalekit AgentKit tool execution.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * Provider auto-instrumentors (OpenAI, Anthropic, ...) capture the LLM call,
 * including the model's *request* to call a tool — the tool name and arguments
 * it wants. They do NOT capture:
 *
 *   - the tool actually executing
 *   - what the tool returned
 *   - the fact that several LLM calls form one logical turn
 *
 * Those are application-level, so they are yours to add. Without them a trace
 * is a flat list of LLM spans with no tool results — you cannot see that the
 * model said "done!" while the tool returned 403.
 *
 * ---------------------------------------------------------------------------
 * WHY A WRAPPER AND NOT A MONKEY-PATCH
 * ---------------------------------------------------------------------------
 * The obvious alternative is patching `ToolsClient.prototype.executeTool` via
 * `Object.getPrototypeOf(client.tools)`. Don't. `ToolsClient` is not exported
 * from `@scalekit-sdk/node` (only `ScalekitClient` is), so a patch reaches into
 * internals the SDK never promised. When those internals shift, the patch stops
 * applying and **spans silently stop appearing** — no error, no warning, and
 * nobody notices until they need a trace that isn't there. Observability that
 * fails silently is worse than none.
 *
 * This wrapper touches only the documented public surface. The parameter and
 * return types below are derived from the SDK's own signature, so if
 * `executeTool` ever changes shape this file fails at `tsc`, loudly, before it
 * ships.
 */

import { trace, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import {
  INPUT_VALUE,
  OUTPUT_VALUE,
  SemanticConventions,
  OpenInferenceSpanKind,
} from '@arizeai/openinference-semantic-conventions';
import type { ScalekitClient } from '@scalekit-sdk/node';

/**
 * Bound to the SDK's public signature on purpose. A breaking change to
 * `executeTool` becomes a compile error here rather than a silent gap in your
 * traces.
 */
type ExecuteToolParams = Parameters<ScalekitClient['tools']['executeTool']>[0];
type ExecuteToolResult = Awaited<
  ReturnType<ScalekitClient['tools']['executeTool']>
>;

/**
 * OpenInference requires `tool.description` and `tool.parameters` on a TOOL
 * span, not just `tool.name`. Scalekit knows these (they come back from
 * `listTools`), but `executeTool` only receives a name — so pass a lookup and
 * the wrapper will fill them in.
 */
export interface ToolSpec {
  description?: string;
  parameters?: unknown;
}

export interface TracedToolsOptions {
  /** Resolves a tool name to its description + JSON schema. */
  specFor?: (toolName: string) => ToolSpec | undefined;
  /** Defaults to the global tracer provider. */
  tracer?: Tracer;
  /**
   * Decides whether a *returned* (not thrown) response represents a failure.
   *
   * This matters more than it looks. AgentKit surfaces many upstream failures —
   * expired scope, revoked grant, provider 4xx — as a normal resolved response
   * carrying an error payload, not as a thrown exception. If you only mark
   * spans ERROR on throw, those spans export as OK and the single most valuable
   * signal in the trace (tool failed, model claimed success anyway) is lost.
   *
   * Override this once you have seen the exact error envelope your connectors
   * return; the default below is a conservative structural guess.
   */
  isErrorResult?: (result: ExecuteToolResult) => boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Classify a connector payload as failure. Scalekit puts this under
 * `ExecuteToolResponse.data` (a protobuf Struct) — not on the envelope root.
 */
function looksLikeErrorPayload(data: Record<string, unknown>): boolean {
  // Provider-style envelopes (Slack, etc.): `{ ok: false, error: "..." }`
  if (data.ok === false) return true;

  if ('error' in data && data.error) return true;

  const status = data.status ?? data.statusCode ?? data.code;
  if (typeof status === 'number' && status >= 400) return true;
  if (typeof status === 'string' && /^(error|failed|failure)$/i.test(status)) {
    return true;
  }
  return false;
}

/**
 * Default classifier for resolved AgentKit responses.
 *
 * The SDK types `executeTool` as `Promise<ExecuteToolResponse>`:
 *   `{ data?: JsonObject; executionId: string }`
 *
 * Connector failures (missing scope, 4xx, `{ ok: false }`, …) almost always
 * arrive as a *resolved* response with the failure inside `data` — not as a
 * throw, and not as a top-level `error` field on the envelope. Inspecting only
 * the root object marks real failures OK and kills the headline demo.
 */
function defaultIsErrorResult(result: ExecuteToolResult): boolean {
  const root = asRecord(result);
  if (!root) return false;

  // Prefer the documented Scalekit envelope.
  if ('data' in root || 'executionId' in root) {
    const data = asRecord(root.data);
    if (!data) return false;
    return looksLikeErrorPayload(data);
  }

  // Bare connector payload — not what the real SDK returns, but keep the
  // classifier honest if a custom transport unwraps `data` before us.
  return looksLikeErrorPayload(root);
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Returns a tracing wrapper around `client.tools`.
 *
 *   const tools = tracedTools(scalekit, { specFor });
 *   await tools.executeTool({ toolName, identifier, params });
 *
 * The span is created in *your* process, inside whatever OTel context is
 * active. That means it nests under the surrounding LLM/agent span for free —
 * no `traceparent` propagation, no collector-side stitching.
 */
export function tracedTools(
  client: ScalekitClient,
  options: TracedToolsOptions = {}
) {
  const tracer = options.tracer ?? trace.getTracer('scalekit-agentkit');
  const isErrorResult = options.isErrorResult ?? defaultIsErrorResult;

  return {
    async executeTool(
      params: ExecuteToolParams,
      /** The model's `tool_call.id`, when you have it — links span to LLM output. */
      toolCallId?: string
    ): Promise<ExecuteToolResult> {
      const spec = options.specFor?.(params.toolName);

      return tracer.startActiveSpan(params.toolName, async (span) => {
        span.setAttributes({
          [SemanticConventions.OPENINFERENCE_SPAN_KIND]:
            OpenInferenceSpanKind.TOOL,
          [SemanticConventions.TOOL_NAME]: params.toolName,
          [SemanticConventions.TOOL_DESCRIPTION]:
            spec?.description ?? `Scalekit AgentKit tool: ${params.toolName}`,
          [SemanticConventions.TOOL_PARAMETERS]: serialize(
            spec?.parameters ?? {}
          ),
          [INPUT_VALUE]: serialize(params.params ?? {}),
        });

        if (toolCallId) {
          span.setAttribute(SemanticConventions.TOOL_ID, toolCallId);
        }

        // Scalekit-specific context. `organizationId` / `userId` here come from
        // an authenticated Scalekit connected account rather than a string the
        // app asserted about itself, which is what makes per-tenant filtering
        // in Arize trustworthy.
        const meta: Record<string, string> = {};
        if (params.connector) meta['scalekit.connector'] = params.connector;
        if (params.identifier) meta['scalekit.identifier'] = params.identifier;
        if (params.connectedAccountId) {
          meta['scalekit.connected_account_id'] = params.connectedAccountId;
        }
        if (params.organizationId) {
          meta['scalekit.organization_id'] = params.organizationId;
        }
        if (params.userId) meta['scalekit.user_id'] = params.userId;
        span.setAttributes(meta);

        try {
          const result = await client.tools.executeTool(params);
          span.setAttribute(OUTPUT_VALUE, serialize(result));

          if (isErrorResult(result)) {
            // Resolved, but the connector reported failure. Mark it ERROR so it
            // is visible in Arize next to the model's (likely optimistic) reply.
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'Tool returned an error result',
            });
          } else {
            // Required. startActiveSpan sets ERROR on a thrown exception but
            // never sets OK — without this line the span exports UNSET.
            span.setStatus({ code: SpanStatusCode.OK });
          }
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          span.setAttribute(OUTPUT_VALUE, serialize({ error: String(error) }));
          throw error;
        } finally {
          span.end();
        }
      });
    },
  };
}
