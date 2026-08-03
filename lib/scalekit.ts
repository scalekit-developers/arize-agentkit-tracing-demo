/**
 * Scalekit client + connector-agnostic tool discovery.
 *
 * Nothing here hardcodes a connector. On each run we ask Scalekit which tools
 * the configured identifier actually has, convert them to OpenAI function
 * definitions, and hand the whole set to the model. Whatever you have connected
 * — GitHub, Gmail, Slack, Calendar — is what the agent can reach.
 */

import { ScalekitClient } from '@scalekit-sdk/node';
import type { ToolSpec } from './traced-tools';

let client: ScalekitClient | undefined;

export function getScalekit(): ScalekitClient {
  if (!client) {
    const { SCALEKIT_ENV_URL, SCALEKIT_CLIENT_ID, SCALEKIT_CLIENT_SECRET } =
      process.env;

    if (!SCALEKIT_ENV_URL || !SCALEKIT_CLIENT_ID || !SCALEKIT_CLIENT_SECRET) {
      throw new Error(
        'Missing SCALEKIT_ENV_URL / SCALEKIT_CLIENT_ID / SCALEKIT_CLIENT_SECRET — see .env.example'
      );
    }

    client = new ScalekitClient(
      SCALEKIT_ENV_URL,
      SCALEKIT_CLIENT_ID,
      SCALEKIT_CLIENT_SECRET
    );
  }
  return client;
}

export interface DiscoveredTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * `Tool.definition` is a `google.protobuf.Struct`, so it is untyped at the SDK
 * boundary and its exact shape depends on the connector. We defensively handle
 * the two shapes seen in practice — an OpenAI-style function definition and an
 * MCP-style tool definition — and skip anything we cannot read a name from.
 *
 * The raw definition of the first tool is logged once on startup so you can see
 * what your environment actually returns and tighten this if needed.
 */
let loggedSample = false;

function normalizeTool(definition: unknown): DiscoveredTool | undefined {
  if (!definition || typeof definition !== 'object') return undefined;
  const def = definition as Record<string, any>;

  if (!loggedSample) {
    loggedSample = true;
    console.log(
      '[scalekit] sample tool definition:',
      JSON.stringify(def, null, 2)
    );
  }

  // OpenAI-style: { type: "function", function: { name, description, parameters } }
  // Scalekit AgentKit definitions commonly use `input_schema` (MCP-adjacent).
  const fn = def.function ?? def;

  const name = fn.name ?? def.name ?? def.tool_name ?? def.toolName;
  if (typeof name !== 'string' || !name) return undefined;

  const parameters =
    fn.input_schema ??
    fn.inputSchema ??
    fn.parameters ??
    def.input_schema ??
    def.inputSchema;

  return {
    name,
    description:
      fn.description ?? def.description ?? `Scalekit AgentKit tool: ${name}`,
    parameters:
      parameters && typeof parameters === 'object'
        ? (parameters as Record<string, unknown>)
        : { type: 'object', properties: {} },
  };
}

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function discoverTools(
  identifier: string
): Promise<DiscoveredTool[]> {
  const scalekit = getScalekit();
  const connectionNames = parseCsvEnv('SCALEKIT_CONNECTION_NAMES');
  const providers = parseCsvEnv('SCALEKIT_PROVIDERS');

  let definitions: unknown[] = [];
  let source = 'none';

  // Prefer listScopedTools when we have a real filter. The API rejects empty
  // providers/toolNames/connectionNames ("no ... specified in filter").
  if (connectionNames.length > 0 || providers.length > 0) {
    const response = await scalekit.tools.listScopedTools(identifier, {
      filter: {
        providers,
        toolNames: [],
        connectionNames,
      },
      pageSize: 100,
    });
    definitions = (response.tools ?? []).map((scoped) => scoped.tool?.definition);
    source = 'listScopedTools';
  } else {
    // Connector-agnostic path. Prefer tools available for this identifier;
    // fall back to listTools(filter.identifier) when available list is empty
    // (common when TEST_IDENTIFIER is a connection id / non-email subject).
    try {
      const response = await scalekit.tools.listAvailableTools(identifier, {
        pageSize: 100,
      });
      definitions = (response.tools ?? []).map((tool) => tool.definition);
      source = 'listAvailableTools';
    } catch (error) {
      console.warn('[scalekit] listAvailableTools failed:', error);
    }

    if (definitions.length === 0) {
      const response = await scalekit.tools.listTools({
        filter: { identifier },
        pageSize: 100,
      });
      definitions = (response.tools ?? []).map((tool) => tool.definition);
      source =
        source === 'listAvailableTools'
          ? 'listTools(after empty listAvailableTools)'
          : 'listTools';
    }
  }

  const tools = definitions
    .map((definition) => normalizeTool(definition))
    .filter((tool): tool is DiscoveredTool => tool !== undefined);

  console.log(
    `[scalekit] discoverTools via ${source}: ${tools.length} tool(s) for identifier`
  );

  if (tools.length === 0) {
    console.warn(
      `[scalekit] no tools for identifier "${identifier}". Check ACTIVE connections in AgentKit → Connected Accounts. Optional: set SCALEKIT_CONNECTION_NAMES=github,gmail (comma-separated) to use listScopedTools.`
    );
  }
  return tools;
}

/** Lookup used by tracedTools to populate tool.description / tool.parameters. */
export function specLookup(
  tools: DiscoveredTool[]
): (name: string) => ToolSpec | undefined {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return (name) => {
    const tool = byName.get(name);
    return tool
      ? { description: tool.description, parameters: tool.parameters }
      : undefined;
  };
}
