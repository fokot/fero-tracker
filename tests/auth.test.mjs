import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './load-module.mjs';

const scope = 'https://www.googleapis.com/auth/drive.file';
function setup({ loaded = true } = {}) {
  const scripts = [], timers = new Map(), events = [];
  let timerId = 0, tokenConfig, requested, tokenRequests = 0;
  // Deliberately provide only OAuth: sign-in must not depend on the separate
  // google.accounts.id flow or a second user gesture.
  const google = { accounts: {
    oauth2: { initTokenClient(config) { tokenConfig = config; return { requestAccessToken(config) { tokenRequests++; requested = config; } }; } },
  } };
  const window = { google: loaded ? google : undefined, dispatchEvent(event) { events.push(event.type); } };
  const load = createLoader({ locale: 'en', globals: { window, document: { createElement() { return { remove() {} }; }, head: { appendChild(script) { scripts.push(script); } } },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } } });
  const auth = load('src/lib/googleOAuth.ts');
  return { auth, window, google, scripts, timers, events,
    get tokenRequests() { return tokenRequests; },
    get tokenConfig() { return tokenConfig; }, get requested() { return requested; } };
}

test('concurrent initialization loads Google once without starting sign-in', async () => {
  const env = setup({ loaded: false });
  const first = env.auth.initGoogleAuth(), second = env.auth.initGoogleAuth();
  assert.equal(first, second);
  assert.equal(env.scripts.length, 1);
  env.window.google = env.google;
  env.scripts[0].onload();
  await Promise.all([first, second]);
  await env.auth.initGoogleAuth();
  assert.equal(env.scripts.length, 1);
  assert.equal(env.tokenRequests, 0);
});
test('an already loaded OAuth library needs no ID-token client or extra script', async () => {
  const env = setup();
  await env.auth.initGoogleAuth();
  assert.equal(env.scripts.length, 0);
  assert.equal(env.tokenRequests, 0);
});
test('script load errors can be retried', async () => {
  const env = setup({ loaded: false });
  const failed = env.auth.initGoogleAuth();
  env.scripts[0].onerror();
  await assert.rejects(failed, /Could not load/);
  const retry = env.auth.initGoogleAuth();
  env.window.google = env.google;
  env.scripts[1].onload();
  await retry;
  assert.equal(env.scripts.length, 2);
});
test('a library load timeout can recover without opening a popup', async () => {
  const env = setup({ loaded: false });
  const failed = env.auth.initGoogleAuth();
  [...env.timers.values()][0]();
  await assert.rejects(failed, /too long/);
  env.window.google = env.google;
  env.scripts[0].onload();
  await env.auth.initGoogleAuth();
  assert.equal(env.tokenRequests, 0);
});
test('one synchronous OAuth request covers sign-in and file access without forcing repeat consent', async () => {
  const env = setup();
  await env.auth.initGoogleAuth();
  const granted = env.auth.signInWithGoogle();
  assert.equal(env.tokenRequests, 1);
  assert.equal(env.requested.prompt, '');
  assert.equal('login_hint' in env.tokenConfig, false);
  assert.deepEqual(env.tokenConfig.scope.split(' '), ['openid', 'email', 'profile', scope]);
  env.tokenConfig.callback({ access_token: 'token', expires_in: 3600, scope });
  await granted;
  assert.equal(env.auth.getValidAccessToken(), 'token');
  [...env.timers.values()][0]();
  assert.throws(() => env.auth.getValidAccessToken(), /expired/);
  assert.deepEqual(env.events, ['google-session-expired']);
});
test('a repeated click does not open a second OAuth request', async () => {
  const env = setup();
  const first = env.auth.signInWithGoogle();
  await assert.rejects(env.auth.signInWithGoogle(), /already in progress/);
  assert.equal(env.tokenRequests, 1);
  env.tokenConfig.callback({ access_token: 'token', expires_in: 3600, scope });
  await first;
  env.auth.signOut();
});
test('popup close and denied/missing permission reject instead of hanging', async () => {
  for (const outcome of ['close', 'deny', 'scope']) {
    const env = setup();
    const pending = env.auth.signInWithGoogle();
    if (outcome === 'close') env.tokenConfig.error_callback({ type: 'popup_closed' });
    if (outcome === 'deny') env.tokenConfig.callback({ error: 'access_denied' });
    if (outcome === 'scope') env.tokenConfig.callback({ access_token: 'token', expires_in: 3600, scope: 'openid' });
    await assert.rejects(pending);
    assert.throws(() => env.auth.getValidAccessToken(), /expired/);
  }
});
test('failed authorization can be retried with the same sign-in button', async () => {
  const env = setup();
  const first = env.auth.signInWithGoogle();
  env.tokenConfig.error_callback({ type: 'popup_failed_to_open' });
  await assert.rejects(first, /Allow popups/);
  const retry = env.auth.signInWithGoogle();
  env.tokenConfig.callback({ access_token: 'token', expires_in: 3600, scope });
  await retry;
  assert.equal(env.tokenRequests, 2);
  env.auth.signOut();
});
test('sign-out cancels pending authorization and ignores a late token', async () => {
  const env = setup();
  const pending = env.auth.signInWithGoogle();
  env.auth.signOut();
  await assert.rejects(pending, /cancelled/);
  env.tokenConfig.callback({ access_token: 'late-token', expires_in: 3600, scope });
  assert.throws(() => env.auth.getValidAccessToken(), /expired/);
});
test('an OAuth timeout ignores late responses and leaves retry available', async () => {
  const env = setup();
  const pending = env.auth.signInWithGoogle();
  const oldCallback = env.tokenConfig.callback;
  [...env.timers.values()][0]();
  await assert.rejects(pending, /timed out/);
  const retry = env.auth.signInWithGoogle();
  oldCallback({ access_token: 'old-token', expires_in: 3600, scope });
  assert.throws(() => env.auth.getValidAccessToken(), /expired/);
  env.tokenConfig.callback({ access_token: 'new-token', expires_in: 3600, scope });
  await retry;
  assert.equal(env.auth.getValidAccessToken(), 'new-token');
  env.auth.signOut();
});
test('starting sign-in before the Google library is ready fails explicitly', async () => {
  const env = setup({ loaded: false });
  await assert.rejects(env.auth.signInWithGoogle(), /not ready/);
  assert.equal(env.tokenRequests, 0);
});
