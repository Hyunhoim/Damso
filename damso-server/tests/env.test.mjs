import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { registrationStatus } from '../src/env.mjs';

test('blank keys fail and status never contains the secret values', () => {
  const secret = 'unit-test-only-secret';
  const env = parseEnv(`OPENAI_API_KEY="${secret}"\nCLOVASTUDIO_API_KEY=\nOPENAI_STT_MODEL=whisper-1\nCLOVASTUDIO_MODEL=HCX-007`);
  const status = registrationStatus(env);
  assert.deepEqual(status.map(item => item.ok), [true, false, true, true]);
  assert.ok(!JSON.stringify(status).includes(secret));
  assert.equal(registrationStatus({ ...env, OPENAI_API_KEY: '' })[0].ok, false);
  assert.equal(registrationStatus({ ...env, OPENAI_API_KEY: 'Bearer test-key' })[0].ok, false);
  assert.equal(registrationStatus({ ...env, CLOVASTUDIO_MODEL: 'HCX-005' })[3].ok, false);
});

test('configured model names and nonempty key values pass the local-only check', () => {
  const status = registrationStatus({ OPENAI_API_KEY: 'test-openai', CLOVASTUDIO_API_KEY: 'test-clova', OPENAI_STT_MODEL: 'whisper-1', CLOVASTUDIO_MODEL: 'HCX-007' });
  assert.ok(status.every(item => item.ok));
});
