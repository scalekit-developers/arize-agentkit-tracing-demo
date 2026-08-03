'use client';

import { useState } from 'react';

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
  spans: CapturedSpan[];
  error?: string;
}

/** Sort spans into a parent/child tree for display. */
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

export default function Home() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="page">
      {/* N8 · Terminal command */}
      <header className="nav-term">
        <pre className="nav-term__line">
          <span className="prompt">&gt;</span>
          <span className="cmd">scalekit-arize</span>{' '}
          <a href="#prompt">--prompt</a>{' '}
          <a href="#reply">--reply</a>{' '}
          <a href="#spans">--spans</a>
          <span className="caret" aria-hidden="true">
            ▮
          </span>
        </pre>
      </header>

      <main className="page-main">
        <p className="index-lede">
          <strong>Local span index.</strong> Prompt an agent with tools bound to
          your Scalekit identifier. Rows below list agent, model, and tool spans
          — including errors the model may paper over.
        </p>

        <form id="prompt" className="cmd-form" onSubmit={run}>
          <span className="cmd-prompt" aria-hidden="true">
            $
          </span>
          <textarea
            className="cmd-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder='agent "list open issues and summarize"'
            rows={2}
            disabled={loading}
            aria-label="Agent prompt"
          />
          <button
            type="submit"
            className="cmd-run"
            disabled={loading || !message.trim()}
          >
            {loading ? 'run…' : 'run'}
          </button>
        </form>

        {error && <pre className="err-box">{error}</pre>}

        {result && (
          <section id="reply" className="index-block" aria-live="polite">
            <p className="index-label">Reply</p>
            <div className="meta-row">
              <span>
                {result.turns} turn{result.turns === 1 ? '' : 's'}
                {errorCount > 0 ? ` · ${errorCount} error` : ''}
              </span>
              <code title="trace id">{result.traceId}</code>
            </div>
            <p className="reply-body">{result.reply}</p>
          </section>
        )}

        <section id="spans" className="index-block" aria-live="polite">
          <p className="index-label">Spans</p>

          {!result && !loading && (
            <p className="empty-index">
              No rows yet. Run a prompt that needs a connected tool — the index
              fills when the turn ends.
            </p>
          )}

          {loading && !result && (
            <p className="empty-index">Collecting spans…</p>
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
                Local index is complete. Arize export flushes after each run and
                can lag a few seconds — search the trace id above if the remote
                view is empty.
              </p>
            </>
          )}
        </section>
      </main>

      {/* Ft2 · Inline single line */}
      <footer className="foot-inline">
        <span>Scalekit × Arize</span>
        <span>identifier tools · one tree per run</span>
      </footer>
    </div>
  );
}
