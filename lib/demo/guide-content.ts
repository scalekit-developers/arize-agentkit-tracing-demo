export const PHOENIX_UI_URL = 'http://localhost:6006';
export const PHOENIX_PROJECT = 'agentkit-tracing-demo';
export const AGENTKIT_QUICKSTART_URL = 'https://docs.scalekit.com/agentkit/quickstart/';

export const VALUE_PROPS = [
  {
    title: 'Scalekit',
    subtitle: 'Auth and tools. Not the timeline.',
    bullets: [
      'Lists the tools this identifier may call',
      'Runs each tool through executeTool',
      'Returns success or a failure inside data',
    ],
  },
  {
    title: 'Arize Phoenix',
    subtitle: 'The timeline. Not the tools.',
    bullets: [
      'Receives one OpenTelemetry trace per run',
      'Shows AGENT, LLM, and TOOL as timed steps',
      'Lets you see a tool fail when the model still says it worked',
    ],
  },
] as const;

export const ARCHITECTURE_FLOW = `You send a prompt in this lab
  → Scalekit lists tools for TEST_IDENTIFIER
  → the model reads every tool (this is the slow step)
  → the model may call executeTool
  → lib/traced-tools.ts writes a TOOL span
  → OTLP flush to Arize Phoenix :6006
  → this page lists the same spans`;

export const FILE_MAP = [
  {
    path: 'lib/traced-tools.ts',
    role: 'Public-API wrapper that writes TOOL spans around executeTool',
  },
  {
    path: 'lib/arize.ts',
    role: 'OTLP export to local Arize Phoenix (project + collector endpoint)',
  },
  {
    path: 'lib/agent.ts',
    role: 'AGENT span and the model loop that decides which tools to call',
  },
  {
    path: 'lib/scalekit.ts',
    role: 'Discovers tools for the identifier. No connector is hard-coded.',
  },
  {
    path: 'app/api/agent/route.ts',
    role: 'One POST starts a run and returns the local span tree',
  },
] as const;

export const DASHBOARD_URL = 'https://app.scalekit.com';
export const CONNECTIONS_DOC_URL = 'https://docs.scalekit.com/agentkit/connections';

export const EASY_CONNECTORS = [
  {
    name: 'GitHub',
    connection: 'github-connect',
    why: 'New environments often include this connection with Scalekit credentials. No GitHub OAuth app to register.',
    prompt: 'List my open GitHub issues and summarize them',
    docs: 'https://docs.scalekit.com/agentkit/connectors/github',
  },
  {
    name: 'Gmail',
    connection: 'gmail',
    why: 'Add the Gmail connection and choose Use Scalekit credentials. Skip Google Cloud OAuth setup.',
    prompt: 'Summarize my unread Gmail',
    docs: 'https://docs.scalekit.com/agentkit/connectors/gmail',
  },
  {
    name: 'Slack',
    connection: 'slack',
    why: 'Add the Slack connection and choose Use Scalekit credentials. Skip a custom Slack app.',
    prompt: 'List my unread Slack mentions',
    docs: 'https://docs.scalekit.com/agentkit/connectors/slack',
  },
] as const;

export const SETUP_STEPS = [
  {
    title: 'Copy the env file',
    body: 'In this repo run: cp .env.example .env.local',
  },
  {
    title: 'Paste Scalekit API credentials',
    body: 'Dashboard → Developers → API credentials. Set SCALEKIT_ENV_URL, SCALEKIT_CLIENT_ID, and SCALEKIT_CLIENT_SECRET.',
  },
  {
    title: 'Add GitHub, Gmail, and Slack',
    body: 'Dashboard → AgentKit → Connections → Add connection. Pick GitHub, Gmail, and Slack. Choose Use Scalekit credentials so you do not register an OAuth app.',
  },
  {
    title: 'Pick a TEST_IDENTIFIER',
    body: 'Any stable string works, such as your email. The lab connects accounts under this identifier.',
  },
  {
    title: 'Add a model key',
    body: 'Set OPENAI_API_KEY, or a Scalekit LLM Gateway key plus OPENAI_BASE_URL.',
  },
  {
    title: 'Start Phoenix and the lab',
    body: 'uvx arize-phoenix serve, then npm run dev. Open :3000 and click Authenticate on GitHub, Gmail, or Slack.',
  },
] as const;

export const SETUP_CHECKLIST = [
  'SCALEKIT_ENV_URL',
  'SCALEKIT_CLIENT_ID',
  'SCALEKIT_CLIENT_SECRET',
  'TEST_IDENTIFIER',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL (optional proxy)',
  'PHOENIX_COLLECTOR_ENDPOINT',
  'PHOENIX_PROJECT_NAME',
] as const;

export const FIVE_MINUTE_SCRIPT = [
  'Copy .env.example to .env.local and fill Scalekit plus a model key.',
  'In the dashboard, add GitHub, Gmail, and Slack with Use Scalekit credentials.',
  'Keep Phoenix open at http://localhost:6006.',
  'Open the lab. Click Authenticate for one of those three apps.',
  'Send a GitHub, Gmail, or Slack prompt. Do not send only “Hi” if you want a TOOL span.',
  'Wait 30–90 seconds on the first run. Read AGENT, then LLM, then TOOL.',
  'In Phoenix, open project agentkit-tracing-demo and search the trace id.',
] as const;

export const SPAN_KINDS = [
  {
    kind: 'AGENT',
    meaning: 'The whole run. One row per prompt.',
  },
  {
    kind: 'LLM',
    meaning: 'One model call. This is usually the long wait.',
  },
  {
    kind: 'TOOL',
    meaning: 'One Scalekit executeTool call, including failures inside data.',
  },
] as const;

export const WAIT_STAGES = [
  {
    afterMs: 0,
    title: 'Listing Scalekit tools',
    body: 'The agent asks Scalekit which tools this identifier can use.',
  },
  {
    afterMs: 4000,
    title: 'Sending the tool list to the model',
    body: 'A large list (often ~100 tools) makes the first model call slow.',
  },
  {
    afterMs: 20000,
    title: 'Still on the model call',
    body: 'The page is waiting. This is normal. A greeting still pays this cost.',
  },
  {
    afterMs: 60000,
    title: 'Past one minute',
    body: 'The first run with a full tool list often lands around here.',
  },
] as const;

export const WHY_NOT_CHAT =
  'A greeting still starts a full run. The model reads every connected tool first. Expect 30–90 seconds. You may get no TOOL span.';
