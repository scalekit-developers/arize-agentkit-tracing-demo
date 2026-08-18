import { getScalekit } from './scalekit';

const STATUS: Record<number, string> = {
  0: 'UNSPECIFIED',
  1: 'ACTIVE',
  2: 'EXPIRED',
  3: 'PENDING_AUTH',
  4: 'PENDING_VERIFICATION',
  5: 'DISCONNECTED',
};

export type AccountRow = {
  id: string;
  connector: string;
  provider: string;
  status: string;
  active: boolean;
};

const pendingState = new Map<string, { connector: string; identifier: string }>();

export function demoIdentifier(): string {
  const identifier = process.env.TEST_IDENTIFIER?.trim();
  if (!identifier) {
    throw new Error('TEST_IDENTIFIER is not set — see .env.example');
  }
  return identifier;
}

export async function listDemoAccounts(): Promise<AccountRow[]> {
  const identifier = demoIdentifier();
  const res = await getScalekit().connectedAccounts.listConnectedAccounts({
    identifier,
    pageSize: 50,
  });
  return (res.connectedAccounts ?? []).map((account) => {
    const status = STATUS[account.status] ?? String(account.status);
    return {
      id: account.id,
      connector: account.connector,
      provider: String(account.provider ?? ''),
      status,
      active: account.status === 1,
    };
  });
}

export async function startConnect(
  connector: string,
  origin: string
): Promise<{ link: string }> {
  const identifier = demoIdentifier();
  const scalekit = getScalekit();

  await scalekit.actions.getOrCreateConnectedAccount({
    connectionName: connector,
    identifier,
  });

  const state = crypto.randomUUID();
  pendingState.set(state, { connector, identifier });

  const res = await scalekit.actions.getAuthorizationLink({
    connectionName: connector,
    identifier,
    state,
    userVerifyUrl: `${origin}/api/accounts/verify`,
  });

  if (!res.link) {
    throw new Error(`Scalekit did not return an auth link for ${connector}`);
  }
  return { link: res.link };
}

export async function finishConnect(params: {
  authRequestId: string;
  state: string;
}): Promise<void> {
  const pending = pendingState.get(params.state);
  if (!pending) {
    throw new Error('Invalid or expired state');
  }
  pendingState.delete(params.state);
  await getScalekit().actions.verifyConnectedAccountUser({
    authRequestId: params.authRequestId,
    identifier: pending.identifier,
  });
}
