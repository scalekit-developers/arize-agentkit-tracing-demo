# Arize AX + Scalekit AgentKit — Tracing Demo

A focused Next.js demo that puts **Scalekit AgentKit tool executions and OpenAI (or LiteLLM) LLM calls into a single [Arize AX](https://arize.com) trace** — so you can see what an agent actually did, including when a tool failed and the model claimed it succeeded.

**What this proves**

1. Provider auto-instrumentors capture LLM calls, but **not** tool execution results.
2. A thin **public-API wrapper** around `ScalekitClient.tools.executeTool` can emit OpenInference `TOOL` spans without patching SDK internals.
3. Those tool spans share one trace with AGENT + LLM spans when you instrument **in-process** (no `traceparent` plumbing to Scalekit).
4. Failure-inside-`data` (resolved, not thrown) can be marked as span `ERROR` so “tool failed / model said OK” is visible.

The integration surface is one file — [`lib/traced-tools.ts`](lib/traced-tools.ts) — written against Scalekit’s **public API only**, so it works as a copy-paste recipe today and can later become a package without a rewrite.

---

## Who this is for

- You’re building agents with **Scalekit AgentKit** and want **LLM observability** in Arize AX (or any OpenTelemetry/OpenInference backend).
- You want a **runnable** Next.js app, not a blog post: install, set env, `npm run verify`, `npm run dev`.
- You care about the difference between “the model requested a tool” and “the tool actually ran and returned X.”

**Not** a production observability product. Treat it as a local prototype and hardening guide.

---

## The problem this solves

Provider auto-instrumentors (OpenAI, Anthropic) capture the LLM call, including the model’s *request* to call a tool. They capture **none** of this:

- the tool actually running
- what it returned
- that several LLM calls form one turn

So a stock-instrumented AgentKit app produces a flat list of LLM spans with no tool results. This is what you want instead:

```
AGENT  run_agent                            4.2s
├─ LLM   chat.completions.create            0.8s   → wants tool: slack.chat.postMessage
├─ TOOL  slack.chat.postMessage             0.3s   ERROR  missing_scope
└─ LLM   chat.completions.create            1.1s   → "Sent!"        ← caught
```

The last two lines are the point. The tool failed; the model said it worked. Neither system catches that alone — Scalekit knows the tool failed, Arize knows what the model said, and only one trace containing both makes it visible.

---

## Why a wrapper, not a monkey-patch

The obvious approach is patching `ToolsClient.prototype.executeTool` via `Object.getPrototypeOf(client.tools)`. This prototype **rejects that**, for one reason:

`ToolsClient` is not exported from `@scalekit-sdk/node` — only `ScalekitClient` is. A prototype patch reaches into internals the SDK never promised, and when those internals shift the patch stops applying and **spans silently stop appearing**. No error, no warning. Observability that fails silently is worse than none.

`lib/traced-tools.ts` derives its types from the SDK’s own public signature:

```typescript
type ExecuteToolParams = Parameters<ScalekitClient['tools']['executeTool']>[0];
```

A breaking change to `executeTool` becomes a **compile error**, before it ships.

### Context propagation is free

A server-side integration (Scalekit emitting spans itself) has to propagate `traceparent` from your process to Scalekit’s, or the tool spans land in a separate, parentless trace. Instrumenting in-process sidesteps that entirely — the TOOL span is created inside your active OTel context, shares the same trace as the AGENT/LLM spans, and parents under the active AGENT span without any extra `traceparent` plumbing.

---

## Prerequisites

- **Node.js 20+**
- A [Scalekit](https://app.scalekit.com) project with AgentKit and at least one **Active** connected account
- An **OpenAI API key**, or any **OpenAI-compatible** proxy (LiteLLM / Scalekit LLM Gateway)
- Optional: an [Arize AX](https://app.arize.com) space (the app still runs and renders local span trees without it)

---

## Documentation

| Topic | Link |
|---|---|
| AgentKit overview | [docs.scalekit.com/agentkit/overview](https://docs.scalekit.com/agentkit/overview.md) |
| Authorize a user | [Authorize](https://docs.scalekit.com/agentkit/tools/authorize.md) |
| Execute tools | [Tools](https://docs.scalekit.com/agentkit/tools/execute.md) |
| Scalekit Node SDK | [Node.js SDK](https://docs.scalekit.com/dev-kit/sdks/nodejs/) |
| Arize OpenTelemetry / OpenInference | [Arize AX docs](https://docs.arize.com) |

---

## Quick start

### Clone and install

```bash
git clone https://github.com/scalekit-developers/arize-agentkit-tracing-demo.git
cd arize-agentkit-tracing-demo

npm install
cp .env.example .env.local
```

Fill in `.env.local` — every variable is documented inline in [`.env.example`](.env.example).

**Secrets:** never commit real credentials. `.env.local` is gitignored. Do not paste API keys into issues, PRs, or chat logs.

### Verify the span contract offline (no credentials needed)

```bash
npm run verify
```

Checks the outcomes that matter against a stubbed Scalekit client that returns real `ExecuteToolResponse` envelopes (`{ data, executionId }`):

| Case | Expected span status |
|---|---|
| Tool succeeds (`data.ok: true`) | `OK` |
| Tool returns a **failure inside `data`** (resolved, not thrown) | `ERROR` |
| Tool throws | `ERROR` + exception recorded |
| Nested `statusCode` / `error` object under `data` | `ERROR` |

The middle rows are the ones that are easy to get wrong and matter most — see [Known gap](#known-gap-error-detection-is-a-guess).

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), type a request that needs a connected tool, and the page renders the span tree it just produced alongside the trace ID. The demo flushes the OTLP batch after each run; Arize can still lag a few seconds before the trace is searchable.

---

## Configuration

### Scalekit

- **Dashboard → Developers → API credentials** for `SCALEKIT_ENV_URL`, `SCALEKIT_CLIENT_ID`, `SCALEKIT_CLIENT_SECRET`
- **Dashboard → AgentKit → Connected Accounts** for `TEST_IDENTIFIER` — copy the Identifier of any connection showing **Active**

This demo is **connector-agnostic**. It discovers tools for your identifier and hands whatever comes back to the model. GitHub, Gmail, Slack, Calendar — no code change.

Optional:

```bash
# Prefer listScopedTools for specific connections
SCALEKIT_CONNECTION_NAMES=github,gmail
```

### OpenAI or LiteLLM (OpenAI-compatible proxy)

The agent uses the official `openai` SDK. That is enough for both:

| Setup | Env |
|---|---|
| Direct OpenAI | `OPENAI_API_KEY` only |
| LiteLLM / LLM Gateway / other proxy | `OPENAI_API_KEY` + **`OPENAI_BASE_URL`** + `OPENAI_MODEL` |

```bash
OPENAI_BASE_URL=http://localhost:4000/v1
OPENAI_API_KEY=<litellm-master-or-virtual-key>
OPENAI_MODEL=<model-id-as-configured-in-litellm>
```

Arize still gets LLM spans: the OpenInference instrumentor patches the OpenAI SDK methods, not the remote host. Pointing the client at LiteLLM does not change tracing.

Aliases: `LITELLM_API_KEY`, `LITELLM_BASE_URL`, `OPENAI_API_BASE`.

### Arize AX

- **Dashboard → Settings → Space Settings** for `ARIZE_SPACE_ID` and `ARIZE_API_KEY`
- `ARIZE_PROJECT_NAME` is **required**. Arize rejects the export with an HTTP 500 if it is missing; `service.name` alone is not enough.
- `ARIZE_COLLECTOR_ENDPOINT` — **do not assume US**:

  | Cluster | Endpoint |
  |---|---|
  | US | `https://otlp.arize.com/v1/traces` |
  | EU | `https://otlp.eu-west-1a.arize.com/v1/traces` |
  | Canada | `https://otlp.ca-central-1a.arize.com/v1/traces` |

This app uses the OTLP **HTTP** exporter, which needs the signal-specific `/v1/traces` path. A bare `/v1` (the gRPC base) is normalized automatically, and `ARIZE_OTLP_ENDPOINT` is accepted as an alias.

Without Arize credentials the app still runs and renders traces locally — nothing is exported.

### Privacy

TOOL and LLM spans include full tool arguments, tool results, and chat content by default (that is what makes the demo useful). `scalekit.identifier` is often an email. The in-memory span tree is also returned to the browser for the UI.

Treat this as a **local prototype**. Before reusing the recipe in production: redact or hash identifiers, drop PII from `input.value` / `output.value`, and do not return raw span attributes to untrusted clients. Arize also supports server-side scrubbing in project settings.

---

## How it fits together

| File | Role |
|---|---|
| [`lib/traced-tools.ts`](lib/traced-tools.ts) | **The integration surface.** Public-API wrapper emitting OpenInference TOOL spans. This is the part worth extracting. |
| [`lib/arize.ts`](lib/arize.ts) | Tracer provider, OTLP exporter, OpenAI instrumentor |
| [`instrumentation.ts`](instrumentation.ts) | Next.js hook — runs setup before any route module loads |
| [`lib/agent.ts`](lib/agent.ts) | The agent loop and its AGENT span |
| [`lib/scalekit.ts`](lib/scalekit.ts) | Client + connector-agnostic tool discovery |
| [`lib/span-collector.ts`](lib/span-collector.ts) | Demo-only in-memory capture so the UI can draw the tree. Delete when adapting. |

```
Browser (prompt only)
   │
   ▼
POST /api/agent
   │
   ├─ AGENT span (lib/agent.ts)
   │    ├─ LLM  openai.chat.completions   ← OpenInference auto-instrument
   │    ├─ TOOL executeTool(name, …)      ← lib/traced-tools.ts
   │    └─ LLM  follow-up completion
   │
   ├─ OTLP export → Arize AX (if credentials set)
   └─ JSON span tree → UI (demo only)
```

### Order matters

1. Register the TracerProvider  
2. Register instrumentors  
3. **Then** construct the OpenAI client  

`lib/agent.ts` builds its OpenAI client lazily for exactly this reason. A client constructed at import time gets captured before patching and emits no LLM spans.

### Next.js specifics

Things that are not obvious and will cost you an afternoon:

- **`manuallyInstrument()` is required.** Next bundles server code, which rewrites module identity and defeats the require-in-the-middle hooking `registerInstrumentations` relies on. Without the manual call you get TOOL spans but no LLM spans — a trace with a hole in it.
- **Put `openai` in `serverExternalPackages`.** `lib/arize.ts` patches the module object from `await import('openai')`; `lib/agent.ts` does a static import. If Next bundles a second copy, the instrumentor patches one and the agent uses the other — same hole as above.
- **`@opentelemetry/resources` v2 removed `new Resource()`.** Use `resourceFromAttributes()`. Some older Arize snippets still show the v1 API.

---

## Known gap: error detection is a guess

The Scalekit Node SDK types `executeTool` as:

```ts
Promise<{ data?: JsonObject; executionId: string }>
```

Connector failures (missing scope, 4xx, `{ ok: false, error: "..." }`, …) almost always arrive as a **resolved** response with the failure inside `data` — not as a throw, and not as a top-level `error` on the envelope.

`defaultIsErrorResult` in `lib/traced-tools.ts` unwraps `data` first, then looks for common error-ish shapes (`ok === false`, `error` key, `statusCode >= 400`, `status: "failed"`). That is still a **structural guess** about what connectors put in the Struct, not a full catalog of every provider.

**Run a tool you know will fail — revoke a scope, use a bad ID — inspect `result.data`, then tighten `isErrorResult` if needed.** If the classifier returns false for a real failure, the span exports `OK`, and the headline demo silently stops working.

For the same reason, `lib/scalekit.ts` logs the first tool definition it sees on startup so you can check what your environment actually returns.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | Offline span-contract tests (no credentials) |

---

## Related Scalekit samples

| Repo | Focus |
|---|---|
| [litellm-agentkit-inbox-triage](https://github.com/scalekit-developers/litellm-agentkit-inbox-triage) | LiteLLM routing + AgentKit inbox triage |
| [fastrouter-scalekit-demo](https://github.com/scalekit-developers/fastrouter-scalekit-demo) | FastRouter + AgentKit tool loop |
| [vercel-ai-agent-toolkit](https://github.com/scalekit-developers/vercel-ai-agent-toolkit) | Vercel AI SDK + Agent Auth patterns |
| [vapi-scalekit-voice-demo](https://github.com/scalekit-developers/vapi-scalekit-voice-demo) | Voice + AgentKit tools |

---

## License

MIT
