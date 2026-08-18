const PLACEHOLDERS = [
  'your-env.scalekit.com',
  'your-test-identifier-here',
  'skc_...',
  'skcs_...',
  'sk-...',
];

export const REQUIRED_ENV = [
  'SCALEKIT_ENV_URL',
  'SCALEKIT_CLIENT_ID',
  'SCALEKIT_CLIENT_SECRET',
  'TEST_IDENTIFIER',
] as const;

function isUnset(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return true;
  return PLACEHOLDERS.some((token) => trimmed.includes(token));
}

export function missingEnvNames(): string[] {
  const missing: string[] = REQUIRED_ENV.filter((name) => isUnset(process.env[name]));
  const hasModelKey = !isUnset(process.env.OPENAI_API_KEY) || !isUnset(process.env.LITELLM_API_KEY);
  if (!hasModelKey) missing.push('OPENAI_API_KEY');
  return missing;
}

export function setupStatus() {
  const missing = missingEnvNames();
  return {
    setupRequired: missing.length > 0,
    missing,
  };
}
