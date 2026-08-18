import Link from 'next/link';
import AppNav from '@/components/AppNav';
import FileMapTable from '@/components/education/FileMapTable';
import ValuePropCards from '@/components/education/ValuePropCards';
import {
  ARCHITECTURE_FLOW,
  CONNECTIONS_DOC_URL,
  DASHBOARD_URL,
  EASY_CONNECTORS,
  FIVE_MINUTE_SCRIPT,
  AGENTKIT_QUICKSTART_URL,
  PHOENIX_PROJECT,
  PHOENIX_UI_URL,
  SETUP_CHECKLIST,
  SETUP_STEPS,
  SPAN_KINDS,
  WHY_NOT_CHAT,
} from '@/lib/demo/guide-content';

export default function GuidePage() {
  return (
    <div className="page">
      <AppNav active="guide" />

      <main className="page-main guide-prose">
        <header className="guide-hero">
          <h1>Scalekit authorizes the tool. Arize Phoenix times the call.</h1>
          <p>
            This lab is a teaching app. A connected account decides which tools
            Scalekit may list and run. Arize Phoenix only draws the timeline. To add
            AgentKit to your own app, follow the{' '}
            <a href={AGENTKIT_QUICKSTART_URL} target="_blank" rel="noreferrer">
              AgentKit quickstart
            </a>
            .
          </p>
        </header>

        <section>
          <h2>What each product does</h2>
          <ValuePropCards />
        </section>

        <section>
          <h2>How it fits together</h2>
          <pre className="flow-block">{ARCHITECTURE_FLOW}</pre>
        </section>

        <section>
          <h2>What a span is</h2>
          <p>
            A span is one timed step. This lab writes three kinds:
          </p>
          <ul className="kind-list">
            {SPAN_KINDS.map((item) => (
              <li key={item.kind}>
                <code>{item.kind}</code>
                <span>{item.meaning}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="setup">
          <h2>Easy setup</h2>
          <p>
            Use Scalekit&apos;s own GitHub, Gmail, and Slack connections. Choose
            Use Scalekit credentials. You do not register an OAuth app for this
            lab.
          </p>
          <ol className="script-list">
            {SETUP_STEPS.map((step) => (
              <li key={step.title}>
                <strong>{step.title}.</strong> {step.body}
              </li>
            ))}
          </ol>
          <table className="edu-table">
            <caption className="sr-only">Easy connections</caption>
            <thead>
              <tr>
                <th scope="col">App</th>
                <th scope="col">Why it is easy</th>
                <th scope="col">Try this prompt</th>
              </tr>
            </thead>
            <tbody>
              {EASY_CONNECTORS.map((item) => (
                <tr key={item.name}>
                  <td>
                    <a href={item.docs} target="_blank" rel="noreferrer">
                      {item.name}
                    </a>
                  </td>
                  <td>{item.why}</td>
                  <td>{item.prompt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Dashboard:{' '}
            <a href={DASHBOARD_URL} target="_blank" rel="noreferrer">
              {DASHBOARD_URL}
            </a>
            . Connection help:{' '}
            <a href={CONNECTIONS_DOC_URL} target="_blank" rel="noreferrer">
              Configure a connection
            </a>
            .
          </p>
        </section>

        <section>
          <h2>5-minute test script</h2>
          <ol className="script-list">
            {FIVE_MINUTE_SCRIPT.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section>
          <h2>Why the first reply is slow</h2>
          <p>{WHY_NOT_CHAT}</p>
        </section>

        <section>
          <h2>Setup checklist</h2>
          <p>
            Set these in <code>.env.local</code>. Then run{' '}
            <code>uvx arize-phoenix serve</code> and <code>npm run dev</code>.
          </p>
          <ul className="env-list">
            {SETUP_CHECKLIST.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Files to copy</h2>
          <FileMapTable />
        </section>

        <p className="guide-cta">
          <Link href="/" className="cmd-run cmd-run--link">
            Open the lab
          </Link>
          <a href={PHOENIX_UI_URL} target="_blank" rel="noreferrer">
            Arize Phoenix · {PHOENIX_PROJECT}
          </a>
          <a href={AGENTKIT_QUICKSTART_URL} target="_blank" rel="noreferrer">
            AgentKit quickstart
          </a>
        </p>
      </main>

      <footer className="foot-inline">
        <span>Scalekit × Arize Phoenix</span>
        <span>guide · then one traced run</span>
      </footer>
    </div>
  );
}
