/**
 * The agent loop. Model decides, Scalekit executes, result goes back to model.
 *
 * Span shape produced:
 *
 *   AGENT  run_agent                        <- this file
 *   ├─ LLM   chat.completions.create        <- OpenAI instrumentor (automatic)
 *   ├─ TOOL  <connector tool>               <- tracedTools wrapper
 *   ├─ LLM   chat.completions.create        <- automatic
 *   └─ ...
 *
 * The AGENT and TOOL spans are ours because no provider instrumentor can see
 * them. The LLM spans are free.
 */

import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  INPUT_VALUE,
  OUTPUT_VALUE,
  SemanticConventions,
  OpenInferenceSpanKind,
} from '@arizeai/openinference-semantic-conventions';
import { getScalekit, discoverTools, specLookup } from './scalekit';
import { tracedTools } from './traced-tools';

const MAX_TURNS = 6;

let openai: OpenAI | undefined;

/**
 * Lazy on purpose. The OpenAI instrumentor patches the module at startup; a
 * client constructed at import time can be captured before that happens and
 * then emits no LLM spans.
 */
/**
 * OpenAI SDK appends `/chat/completions` to `baseURL`. LiteLLM and Scalekit
 * LLM Gateway expose the OpenAI surface under `/v1`, so a bare host like
 * `http://localhost:4000` would hit `/chat/completions` (404). Accept either
 * form and normalize.
 */
function normalizeOpenAIBaseURL(raw: string): string {
  const trimmed = raw.replace(/\/+$/, '');
  if (trimmed.endsWith('/v1')) return trimmed;
  return `${trimmed}/v1`;
}

function getOpenAI(): OpenAI {
  if (!openai) {
    // LiteLLM / any OpenAI-compatible proxy: set OPENAI_BASE_URL (and usually
    // OPENAI_API_KEY to the proxy key). The OpenInference instrumentor patches
    // the OpenAI SDK — destination does not matter as long as the SDK is used.
    const apiKey =
      process.env.OPENAI_API_KEY ?? process.env.LITELLM_API_KEY;
    if (!apiKey) {
      throw new Error(
        'Missing OPENAI_API_KEY (or LITELLM_API_KEY) — see .env.example'
      );
    }
    const rawBase =
      process.env.OPENAI_BASE_URL ??
      process.env.LITELLM_BASE_URL ??
      process.env.OPENAI_API_BASE;
    const baseURL = rawBase ? normalizeOpenAIBaseURL(rawBase) : undefined;
    openai = new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    if (baseURL) {
      console.log(`[openai] using compatible proxy baseURL=${baseURL}`);
    }
  }
  return openai;
}

export interface AgentResult {
  reply: string;
  traceId: string;
  turns: number;
  /** True when the active span is recording (false ⇒ OTel API/provider mismatch). */
  recording: boolean;
}

export async function runAgent(
  userMessage: string,
  identifier: string
): Promise<AgentResult> {
  const tracer = trace.getTracer('agentkit-demo');
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const discovered = await discoverTools(identifier);
  const tools = tracedTools(getScalekit(), { specFor: specLookup(discovered) });

  const toolDefs: ChatCompletionTool[] = discovered.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  return tracer.startActiveSpan('run_agent', async (span) => {
    const recording = span.isRecording();
    if (!recording) {
      console.warn(
        '[agent] span is not recording — TracerProvider likely not visible to this module (@opentelemetry/api duplication or init order).'
      );
    }

    span.setAttribute(
      SemanticConventions.OPENINFERENCE_SPAN_KIND,
      OpenInferenceSpanKind.AGENT
    );
    span.setAttribute(INPUT_VALUE, userMessage);
    span.setAttribute('scalekit.identifier', identifier);
    span.setAttribute('agent.available_tool_count', discovered.length);

    const traceId = span.spanContext().traceId;

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content:
          'You are an assistant with access to the user\'s connected accounts. ' +
          'Use the available tools to answer. Report tool failures honestly — ' +
          'if a tool returns an error, say so rather than claiming success.',
      },
      { role: 'user', content: userMessage },
    ];

    let turns = 0;

    try {
      while (turns < MAX_TURNS) {
        turns += 1;

        const completion = await getOpenAI().chat.completions.create({
          model,
          messages,
          ...(toolDefs.length > 0 && { tools: toolDefs }),
        });

        const choice = completion.choices[0];
        const message = choice.message;
        messages.push(message);

        const toolCalls = message.tool_calls ?? [];
        if (toolCalls.length === 0) {
          const reply = message.content ?? '';
          span.setAttribute(OUTPUT_VALUE, reply);
          span.setStatus({ code: SpanStatusCode.OK });
          return { reply, traceId, turns, recording };
        }

        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') continue;

          let resultText: string;
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.function.arguments || '{}') as Record<
              string,
              unknown
            >;
          } catch (parseError) {
            // Malformed arguments from the model — do not call the tool with
            // empty params (that looks like a provider failure). Feed the parse
            // error back so the model can retry with valid JSON.
            resultText = JSON.stringify({
              error: 'invalid_tool_arguments',
              message: `Could not parse tool arguments as JSON: ${String(parseError)}`,
              raw: toolCall.function.arguments,
            });
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: resultText,
            });
            continue;
          }

          try {
            const result = await tools.executeTool(
              {
                toolName: toolCall.function.name,
                identifier,
                params: args,
              },
              toolCall.id
            );
            // Prefer the connector payload when present — that is what the model
            // needs to reason about. Keep the full envelope if `data` is absent.
            const payload =
              result && typeof result === 'object' && 'data' in result
                ? (result as { data?: unknown }).data ?? result
                : result;
            resultText = JSON.stringify(payload);
          } catch (error) {
            // Already recorded on the TOOL span; surface it to the model too.
            resultText = JSON.stringify({ error: String(error) });
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: resultText,
          });
        }
      }

      const reply = `Stopped after ${MAX_TURNS} turns without a final answer.`;
      span.setAttribute(OUTPUT_VALUE, reply);
      span.setStatus({ code: SpanStatusCode.OK });
      return { reply, traceId, turns, recording };
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
