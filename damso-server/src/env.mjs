import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function readLocalEnv() {
  // Check only Damso's file, so another project's shell key is never reused silently.
  return parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
}

export function registrationStatus(env) {
  const hasKey = value => typeof value === 'string' && value.length > 0 && !/\s/.test(value);
  return [
    { name: 'OPENAI_API_KEY', ok: hasKey(env.OPENAI_API_KEY) },
    { name: 'CLOVASTUDIO_API_KEY', ok: hasKey(env.CLOVASTUDIO_API_KEY) },
    { name: 'OPENAI_STT_MODEL', ok: env.OPENAI_STT_MODEL === 'whisper-1' },
    { name: 'CLOVASTUDIO_MODEL', ok: env.CLOVASTUDIO_MODEL === 'HCX-007' },
  ];
}
