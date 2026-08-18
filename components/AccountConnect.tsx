'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DASHBOARD_URL, EASY_CONNECTORS } from '@/lib/demo/guide-content';

type AccountRow = {
  id: string;
  connector: string;
  provider: string;
  status: string;
  active: boolean;
};

type AccountsResponse = {
  identifier: string | null;
  accounts: AccountRow[];
  setupRequired?: boolean;
  missing?: string[];
  error?: string;
};

export default function AccountConnect() {
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch('/api/accounts');
    const body: AccountsResponse = await response.json();
    if (!response.ok) {
      setError(body.error ?? 'Could not load accounts');
      return;
    }
    setError(null);
    setData(body);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!busy) return;
    const tick = window.setInterval(() => {
      void refresh();
    }, 2500);
    return () => window.clearInterval(tick);
  }, [busy]);

  useEffect(() => {
    if (!busy || !data) return;
    const row = data.accounts.find((account) => account.connector === busy);
    if (row?.active) setBusy(null);
  }, [busy, data]);

  async function connect(connector: string) {
    setBusy(connector);
    setError(null);
    try {
      const response = await fetch('/api/accounts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connector }),
      });
      const body = await response.json();
      if (!response.ok || !body.link) {
        setError(body.error ?? 'Could not start connect');
        setBusy(null);
        return;
      }
      window.open(body.link, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setError(String(requestError));
      setBusy(null);
    }
  }

  const pending = data?.accounts.filter((account) => !account.active) ?? [];

  if (data?.setupRequired) {
    return (
      <section className="index-block account-panel" aria-labelledby="connect-label">
        <p className="index-label" id="connect-label">
          Setup required
        </p>
        <p className="account-lede">
          This lab has no <code>.env.local</code> yet. Use Scalekit&apos;s
          GitHub, Gmail, and Slack connections. You do not register an OAuth
          app.
        </p>
        <ol className="expect-list">
          <li>
            Run <code>cp .env.example .env.local</code>
          </li>
          <li>
            Paste API credentials from{' '}
            <a href={DASHBOARD_URL} target="_blank" rel="noreferrer">
              Developers → API credentials
            </a>
          </li>
          <li>
            In AgentKit → Connections, add GitHub, Gmail, and Slack. Choose
            Use Scalekit credentials.
          </li>
          <li>
            Set <code>TEST_IDENTIFIER</code> to your email. Restart{' '}
            <code>npm run dev</code>.
          </li>
        </ol>
        {data.missing && data.missing.length > 0 && (
          <ul className="env-list">
            {data.missing.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        )}
        <p className="guide-cta">
          <Link href="/guide#setup" className="cmd-run cmd-run--link">
            Open the setup guide
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="index-block account-panel" aria-labelledby="connect-label">
      <p className="index-label" id="connect-label">
        Step 1 · Connect an account
      </p>
      <p className="account-lede">
        Connect GitHub, Gmail, or Slack for identifier{' '}
        <code>{data?.identifier ?? '…'}</code>, then send a matching prompt.
      </p>
      <ul className="easy-list">
        {EASY_CONNECTORS.map((item) => (
          <li key={item.name}>
            <strong>{item.name}</strong>
            <span>{item.prompt}</span>
          </li>
        ))}
      </ul>
      {error && <pre className="err-box">{error}</pre>}
      {!data && !error && <p className="empty-index">Loading accounts…</p>}
      {data && (
        <ul className="account-list">
          {data.accounts.map((account) => (
            <li key={account.id}>
              <span className="account-name">{account.connector}</span>
              <span className={account.active ? 'account-ok' : 'account-wait'}>
                {account.status}
              </span>
              <button
                type="button"
                className="chip"
                disabled={busy === account.connector}
                onClick={() => connect(account.connector)}
              >
                {account.active ? 'Reconnect' : 'Authenticate'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <p className="hint-warn" role="status">
          Waiting for {busy}. Finish the tab that Scalekit opened.
        </p>
      )}
      {data && pending.length === 0 && data.accounts.length > 0 && (
        <p className="foot-note">All listed accounts are active. You can run a prompt.</p>
      )}
    </section>
  );
}
