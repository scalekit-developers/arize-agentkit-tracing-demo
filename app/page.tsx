'use client';

import { useEffect, useState } from 'react';
import AppNav from '@/components/AppNav';
import AccountConnect from '@/components/AccountConnect';
import ValuePropCards from '@/components/education/ValuePropCards';
import {
  PHOENIX_PROJECT,
  PHOENIX_UI_URL,
  EASY_CONNECTORS,
  WAIT_STAGES,
  WHY_NOT_CHAT,
} from '@/lib/demo/guide-content';

interface CapturedSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: string;
  statusCode: number;
  statusMessage?: string;
  durationMs: number;
  attributes: Record<string, unknown>;
}

interface AgentResponse {
  reply: string;
  traceId: string;
  turns: number;
  toolCount?: number;
  spans: CapturedSpan[];
  error?: string;
}

function buildTree(spans: CapturedSpan[]): Array<{ span: CapturedSpan; depth: number }> {
  const byParent = new Map<string, CapturedSpan[]>();
  const ids = new Set(spans.map((s) => s.spanId));

  for (const span of spans) {
    const key = span.parentSpanId && ids.has(span.parentSpanId) ? span.parentSpanId : '__root__';
    byParent.set(key, [...(byParent.get(key) ?? []), span]);
  }

  const out: Array<{ span: CapturedSpan; depth: number }> = [];
  const walk = (key: string, depth: number) => {
    for (const span of byParent.get(key) ?? []) {
      out.push({ span, depth });
      walk(span.spanId, depth + 1);
    }
  };
  walk('__root__', 0);
  return out;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function waitStage(ms: number) {
  return [...WAIT_STAGES].reverse().find((stage) => ms >= stage.afterMs) ?? WAIT_STAGES[0];
}

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|yo)\b/i.test(text.trim());
}

export default function Home() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      setElapsedMs(0);
      return;
    }
    const started = Date.now();
    const tick = window.setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 250);
    return () => window.clearInterval(tick);
  }, [loading]);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim() || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data: AgentResponse = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Request failed');
      } else {
        setResult(data);
      }
    } catch (requestError) {
      setError(String(requestError));
    } finally {
      setLoading(false);
    }
  }

  const tree = result ? buildTree(result.spans) : [];
  const errorCount = tree.filter(({ span }) => span.statusCode === 2).length;
  const toolSpans = tree.filter(({ span }) => (span.kind ?? '').toUpperCase() === 'TOOL');
  const stage = waitStage(elapsedMs);
  const greeting = isGreeting(message);

  return (
    <div className="page">
      <AppNav active="lab" />

      <main className="page-main lab-main">
        <div className="lab-teach">
        <header className="lab-hero">
          <h1>See Scalekit authorize and run a connected tool</h1>
          <p>
            First connect GitHub, Gmail, or Slack. Then send one prompt. This
            page and Phoenix record the timed steps.
          </p>
        </header>

        <ValuePropCards />

        <section className="index-block" aria-labelledby="expect-label">
          <p className="index-label" id="expect-label">
            What to expect
          </p>
          <ol className="expect-list">
            <li>Scalekit lists every tool for your identifier.</li>
            <li>The model reads that list. The first reply can take 30–90 seconds.</li>
            <li>A span is one timed step: AGENT, LLM, or TOOL.</li>
            <li>After the reply, open Arize Phoenix and search the trace id.</li>
          </ol>
        </section>
        </div>

        <div className="lab-run">
        <AccountConnect />
        <form id="prompt" className="cmd-form" onSubmit={run} aria-busy={loading}>
          <span className="cmd-prompt" aria-hidden="true">
            $
          </span>
          <textarea
            className="cmd-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask for something a connected tool can do"
            rows={2}
            disabled={loading}
            aria-label="Agent prompt"
          />
          <button
            type="submit"
            className="cmd-run"
            disabled={loading || !message.trim()}
            data-state={loading ? 'loading' : undefined}
          >
            {loading ? `wait ${formatElapsed(elapsedMs)}` : 'run'}
          </button>
        </form>

        <div className="prompt-hints">
          <p className="hint-label">Try a Scalekit connection</p>
          <div className="chip-row">
            {EASY_CONNECTORS.map((item) => (
              <button
                key={item.name}
                type="button"
                className="chip"
                disabled={loading}
                onClick={() => setMessage(item.prompt)}
              >
                {item.name}: {item.prompt}
              </button>
            ))}
          </div>
          {greeting && !loading && (
            <p className="hint-warn" role="status">
              A greeting still sends every tool to the model. Expect 30–90
              seconds. You may get no TOOL span.
            </p>
          )}
        </div>

        {error && <pre className="err-box">{error}</pre>}

        {loading && (
          <section className="wait-panel" aria-live="polite" aria-atomic="true">
            <p className="wait-clock">
              <span className="wait-dot" aria-hidden="true" />
              Running {formatElapsed(elapsedMs)}
              <span className="wait-expect">First reply: 30–90 seconds</span>
            </p>
            <p className="wait-title">{stage.title}</p>
            <p className="wait-body">{stage.body}</p>
            {greeting && <p className="wait-body">{WHY_NOT_CHAT}</p>}
          </section>
        )}

        {result && (
          <section id="reply" className="index-block" aria-live="polite">
            <p className="index-label">Reply</p>
            <div className="meta-row">
              <span>
                {result.turns} turn{result.turns === 1 ? '' : 's'}
                {typeof result.toolCount === 'number'
                  ? ` · ${result.toolCount} tools listed`
                  : ''}
                {errorCount > 0 ? ` · ${errorCount} error` : ''}
              </span>
              <code title="trace id">{result.traceId}</code>
            </div>
            <p className="reply-body">{result.reply}</p>
            <div className="next-panel">
              <p>
                Local spans are ready. Open Arize Phoenix project{' '}
                <code>{PHOENIX_PROJECT}</code> and search this trace id.
              </p>
              <a
                className="cmd-run cmd-run--link"
                href={PHOENIX_UI_URL}
                target="_blank"
                rel="noreferrer"
              >
                Open Arize Phoenix
              </a>
              {toolSpans.length === 0 && (
                <p className="foot-note">
                  This run has no TOOL span. The model did not call
                  executeTool. Try a prompt that needs a connected account.
                </p>
              )}
            </div>
          </section>
        )}

        <section id="spans" className="index-block" aria-live="polite">
          <p className="index-label">Spans</p>

          {!result && !loading && (
            <p className="empty-index">
              No rows yet. Send a prompt that needs a connected tool. The
              index fills when the run ends.
            </p>
          )}

          {result && tree.length > 0 && (
            <>
              <ol className="span-index">
                {tree.map(({ span, depth }, index) => {
                  const isError = span.statusCode === 2;
                  const n = String(index + 1).padStart(2, '0');
                  return (
                    <li
                      key={span.spanId}
                      className={isError ? 'is-error' : undefined}
                      style={{ paddingLeft: depth ? `${depth * 0.75}rem` : undefined }}
                    >
                      <span className="span-n">{n}</span>
                      <span className="span-kind">{span.kind ?? 'SPAN'}</span>
                      <span className="span-name" title={span.name}>
                        {span.name}
                      </span>
                      <span
                        className="span-status"
                        title={isError ? span.statusMessage ?? 'error' : undefined}
                      >
                        {isError ? 'ERR' : 'ok'}
                      </span>
                      <span className="span-ms">{span.durationMs.toFixed(0)}ms</span>
                    </li>
                  );
                })}
              </ol>
              <p className="foot-note">
                Local index is complete. Arize Phoenix can lag a few seconds after
                flush. Search the trace id if the project view is empty.
              </p>
            </>
          )}
        </section>
        </div>
      </main>

      <footer className="foot-inline">
        <span>Scalekit × Arize Phoenix</span>
        <span>one prompt · one trace</span>
      </footer>
    </div>
  );
}
