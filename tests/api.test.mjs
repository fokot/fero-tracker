import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader, deferred } from './load-module.mjs';

function setup(fetch) {
  let expired = false, version = 0;
  const auth = {
    getValidAccessToken: () => 'memory-token', getAuthVersion: () => version,
    expireSession() { expired = true; }, SessionExpiredError: class extends Error {},
  };
  const { googleRequest } = createLoader({ locale: 'en', globals: { fetch }, mocks: { './googleOAuth': auth } })('src/lib/googleApi.ts');
  return { googleRequest, get expired() { return expired; }, changeAccount() { version++; } };
}
test('API sends bearer authorization and surfaces Google errors', async () => {
  let headers;
  const env = setup(async (url, options) => { headers = options.headers; return { status: 403, ok: false, json: async () => ({ error: { message: 'Enable Google Drive API' } }) }; });
  await assert.rejects(env.googleRequest('https://example.test'), /Enable Google Drive API/);
  assert.equal(headers.Authorization, 'Bearer memory-token');
});
test('401 expires the session even when the response is not JSON', async () => {
  const env = setup(async () => ({ status: 401, ok: false, json: async () => { throw new Error('not JSON'); } }));
  await assert.rejects(env.googleRequest('https://example.test'));
  assert.equal(env.expired, true);
});
test('old-account responses cannot expire or update the new account', async () => {
  const response = deferred();
  const env = setup(() => response.promise);
  const pending = env.googleRequest('https://example.test');
  env.changeAccount();
  response.resolve({ status: 401, ok: false });
  await assert.rejects(pending);
  assert.equal(env.expired, false);
});
test('network failures become actionable messages', async () => {
  const env = setup(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(env.googleRequest('https://example.test'), /connection/);
});
