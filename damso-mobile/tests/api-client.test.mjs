import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiClient } from '../src/api/client.ts';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const token = (id, expires_in = 900) => ({ access_token: 'access-' + id, refresh_token: 'refresh-' + id, expires_in });
function setup(send, saved = null) {
  let value = saved, expired = 0;
  const client = createApiClient('http://test/api/v1', { read: async () => value, write: async next => { value = next; } }, () => { expired++; }, send);
  return { client, stored: () => value, expired: () => expired };
}

test('login is form encoded; GET, bodyless DELETE and JSON mutations preserve their HTTP methods', async () => {
  const calls = [];
  const { client, stored } = setup(async (url, init) => { calls.push({ url, ...init }); return json(url.endsWith('access-token') ? token(1) : { ok: true }); });
  await client.login('test+parent@example.com', 'safe&password');
  assert.equal(calls[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(new URLSearchParams(calls[0].body).get('password'), 'safe&password');
  assert.equal(stored(), 'refresh-1');
  await client.api('/profile'); await client.api('/families/me', undefined, 'DELETE'); await client.api('/profile', { text_scale: 1.24 }, 'PATCH');
  assert.deepEqual(calls.slice(1).map(c => c.method), ['GET', 'DELETE', 'PATCH']);
  assert.equal(calls[1].headers.Authorization, 'Bearer access-1');
  assert.equal(calls[2].body, undefined);
  assert.equal(calls[3].body, JSON.stringify({ text_scale: 1.24 }));
});

test('expired concurrent requests rotate the refresh token exactly once', async () => {
  let refreshes = 0;
  const { client, stored } = setup(async (url, init) => {
    if (url.endsWith('access-token')) return json(token(1, 0));
    if (url.endsWith('/refresh')) { refreshes++; await new Promise(r => setTimeout(r, 10)); return json(token(2)); }
    assert.equal(init.headers.Authorization, 'Bearer access-2'); return json({ ok: true });
  });
  await client.login('a@example.com', 'password');
  await Promise.all([client.api('/profile'), client.api('/library'), client.headers()]);
  assert.equal(refreshes, 1); assert.equal(stored(), 'refresh-2');
});

test('simultaneous 401 responses share one refresh and retry with the new access token', async () => {
  let refreshes = 0;
  const { client } = setup(async (url, init) => {
    if (url.endsWith('access-token')) return json(token(1));
    if (url.endsWith('/refresh')) { refreshes++; await new Promise(r => setTimeout(r, 10)); return json(token(2)); }
    return init.headers.Authorization === 'Bearer access-1' ? json({}, 401) : json({ ok: true });
  });
  await client.login('a@example.com', 'password');
  await Promise.all([client.api('/profile'), client.api('/library')]);
  assert.equal(refreshes, 1);
});

test('revoked refresh token clears the session and never returns protected data', async () => {
  const state = setup(async url => url.endsWith('access-token') ? json(token(1, 0)) : json({}, 401));
  await state.client.login('a@example.com', 'password');
  await assert.rejects(state.client.api('/profile'), error => error instanceof ApiError && error.status === 401);
  assert.equal(state.stored(), null); assert.equal(state.expired(), 1);
});

test('session restore rotates the persisted refresh token and missing sessions do not call the server', async () => {
  let calls = 0;
  const state = setup(async (url, init) => { calls++; assert.ok(url.endsWith('/refresh')); assert.deepEqual(JSON.parse(init.body), { refresh_token: 'saved-token' }); return json(token(2)); }, 'saved-token');
  assert.equal(await state.client.restore(), true); assert.equal(state.stored(), 'refresh-2');
  const empty = setup(async () => { throw new Error('Unexpected fetch'); });
  assert.equal(await empty.client.restore(), false); assert.equal(calls, 1);
});

test('logout revokes the server session, clears storage, and rejects a late in-flight response', async () => {
  let finish;
  const state = setup(async url => {
    if (url.endsWith('access-token')) return json(token(1));
    if (url.endsWith('/logout')) return json({ message: 'Logged out' });
    return new Promise(resolve => { finish = resolve; });
  });
  await state.client.login('a@example.com', 'password');
  const pending = state.client.api('/library');
  await new Promise(r => setTimeout(r, 0));
  await state.client.logout(); finish(json({ private: 'old account' }));
  await assert.rejects(pending, /계정 연결이 변경/); assert.equal(state.stored(), null);
});

test('logout during refresh cannot resurrect credentials in memory or storage', async () => {
  let finish;
  const state = setup(async url => url.endsWith('access-token') ? json(token(1, 0)) : new Promise(resolve => { finish = resolve; }));
  await state.client.login('a@example.com', 'password');
  const pending = state.client.api('/profile'); await new Promise(r => setTimeout(r, 0));
  await state.client.clear(); finish(json(token(2)));
  await assert.rejects(pending, /계정 연결이 변경/); assert.equal(state.stored(), null);
  await assert.rejects(state.client.headers(), /로그인/);
});

test('secure storage failure rolls back login instead of leaving a half-authenticated account', async () => {
  let expired = false;
  const client = createApiClient('http://test', { read: async () => null, write: async value => { if (value) throw new Error('unavailable'); } }, () => { expired = true; }, async () => json(token(1)));
  await assert.rejects(client.login('a@example.com', 'password'), /안전하게 저장/);
  assert.equal(expired, true); await assert.rejects(client.headers(), /로그인/);
});

test('malformed token responses are rejected before persisting any credentials', async () => {
  const state = setup(async () => json({ access_token: 'invalid', refresh_token: 'invalid' }));
  await assert.rejects(state.client.login('a@example.com', 'password'), /로그인 응답/);
  assert.equal(state.stored(), null);
  await assert.rejects(state.client.headers(), /로그인/);
});
