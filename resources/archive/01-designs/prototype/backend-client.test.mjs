// backend-client.test.mjs
//
// Node test for the client-only adapter behavior that NO Ruby test can reach --
// it lives entirely in backend-client.js's fetch-result handling: the verbatim
// JSON-error pass-through (#5), the stream deny shapes (#6), and the cookie-era
// auth handling (401 -> login gateway redirect, 403 stays in place, no token).
//
// Harness: the file is a browser IIFE that reads global `window` + global
// `fetch` and assigns `window.familiaBackend`. We install a location stub and a
// per-test mock fetch, evaluate the file source via `vm.runInThisContext`, then
// drive window.familiaBackend.request(envelope).
//
// Run: node resources/01-designs/prototype/backend-client.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, 'backend-client.js'), 'utf8');

// Load a FRESH backend bound to a given mock fetch. Each call rebuilds window so
// the IIFE re-runs against the supplied fetch. Auth is the HttpOnly session
// cookie (the browser attaches it; this client never sees a token), so the
// window carries no token — only a location stub recording the 401-triggered
// navigations to the login gateway.
function loadBackend(mockFetch) {
  const navigations = [];
  const win = {
    FAMILIA_ADMIN_API_BASE: '',
    location: {
      pathname: '/',
      search: '?screen=records',
      assign: (url) => void navigations.push(url),
    },
  };
  globalThis.window = win;
  globalThis.fetch = mockFetch;
  vm.runInThisContext(SRC, { filename: 'backend-client.js' });
  win.familiaBackend.__navigations = navigations;
  return win.familiaBackend;
}

// Build a mock fetch returning a single canned Response-like object, while
// recording the (url, init) it was called with so tests can assert init.redirect.
function mockFetchOnce(response) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init: init || {} });
    return response;
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse({ status = 200, ok, body = '', contentType = 'application/json', type = 'basic' } = {}) {
  return {
    status,
    ok: ok != null ? ok : status >= 200 && status < 300,
    type,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

// ── test runner ──────────────────────────────────────────────────────────────
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`ok   - ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e });
    console.log(`FAIL - ${name}`);
    console.log(`       ${e && e.message ? e.message : e}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG #5: a 403 carrying a real JSON error body must resolve THAT body verbatim,
// not the generic { error:'forbidden' }. The adapter's 401/403 branch currently
// short-circuits to forbidden before inspecting the body, so this is RED.
// ─────────────────────────────────────────────────────────────────────────────
await test('#5 403 command_blocked body resolves verbatim (not forbidden)', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({
    status: 403, ok: false,
    body: JSON.stringify({ error: 'command_blocked', required_tier: 'permission:raw_command' }),
  }));
  const backend = loadBackend(fetchMock);
  const out = await backend.request({ action: 'raw.command', params: { cmd: 'DEL' } });
  assert.equal(out.error, 'command_blocked', `expected command_blocked, got ${JSON.stringify(out)}`);
  assert.equal(out.required_tier, 'permission:raw_command');
});

// ─────────────────────────────────────────────────────────────────────────────
// Cookie-session era: 401 = no valid session -> navigate the top window to the
// login gateway (preserving location via return_to) AND resolve a stable shape
// so the UI renders calmly while the navigation lands. 403 = authorization
// denial -> stay in place. No token is ever read or sent.
// ─────────────────────────────────────────────────────────────────────────────
await test('401 redirects to /login with return_to and resolves forbidden', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({ status: 401, ok: false, body: '' }));
  const backend = loadBackend(fetchMock);
  const out = await backend.request({ action: 'records.list', model: 'customer', params: {} });
  assert.equal(out.error, 'forbidden', `expected forbidden, got ${JSON.stringify(out)}`);
  assert.equal(out.required_tier, 'role:admin');
  assert.deepEqual(backend.__navigations, ['/login?return_to=%2F%3Fscreen%3Drecords']);
});

await test('403 does NOT redirect (authorization denial renders in place)', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({ status: 403, ok: false, body: '' }));
  const backend = loadBackend(fetchMock);
  const out = await backend.request({ action: 'records.reveal', model: 'customer', id: 'x', field: 'f' });
  assert.equal(out.error, 'forbidden');
  assert.equal(out.required_tier, 'permission:reveal_secrets');
  assert.deepEqual(backend.__navigations, []);
});

await test('no Authorization header is sent (the session cookie is the credential)', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({ status: 200, body: '[]' }));
  const backend = loadBackend(fetchMock);
  await backend.request({ action: 'records.list', model: 'customer', params: {} });
  const headers = fetchMock.calls[0].init.headers || {};
  assert.equal(headers.Authorization, undefined,
    `no Authorization header expected, saw ${JSON.stringify(headers)}`);
});

await test('stream 401 also redirects to the login gateway', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({ status: 401, ok: false, body: '' }));
  const backend = loadBackend(fetchMock);
  const out = await backend.request({ action: 'integrity.repair', model: 'customer', params: { stream: true } });
  assert.equal(out.error, 'forbidden');
  assert.equal(backend.__navigations.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG #6: a streaming action whose fetch yields a redirect / opaque / non-event
// -stream success must resolve forbidden (the deny shape), not an empty/garbage
// event array. The fix uses redirect:'manual'; we also record that the adapter
// requests manual redirect. BEHAVIORAL assertion (resolves forbidden) is the
// red->green one. RED now: a 302 has res.ok=false and no JSON error -> throws;
// a non-event-stream 200 has res.ok=true -> parseSSE returns [] (not forbidden).
// ─────────────────────────────────────────────────────────────────────────────
await test('#6 stream 302 redirect resolves forbidden (not throw/empty) and heads to login', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({ status: 302, ok: false, type: 'opaqueredirect', body: '' }));
  const backend = loadBackend(fetchMock);
  const out = await backend.request({ action: 'integrity.repair', model: 'customer', params: { stream: true } });
  assert.ok(out && !Array.isArray(out), `expected an object, got ${JSON.stringify(out)}`);
  assert.equal(out.error, 'forbidden', `expected forbidden, got ${JSON.stringify(out)}`);
  assert.equal(out.required_tier, 'permission:repair');
  // A redirect off the stream is the legacy "not authenticated" deny shape ->
  // the operator is sent to the login gateway, same as a 401.
  assert.equal(backend.__navigations.length, 1);
});

await test('#6 stream non-event-stream 200 (html) resolves forbidden (not empty array)', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({
    status: 200, ok: true, contentType: 'text/html',
    body: '<!doctype html><html><body>login</body></html>',
  }));
  const backend = loadBackend(fetchMock);
  const out = await backend.request({ action: 'integrity.repair', model: 'customer', params: { stream: true } });
  assert.equal(out && out.error, 'forbidden',
    `expected forbidden for a non-event-stream stream response, got ${JSON.stringify(out)}`);
  // A 2xx (however malformed) is not an auth denial: no login redirect.
  assert.deepEqual(backend.__navigations, []);
});

await test('#6 stream fetch is issued with redirect:manual (after fix)', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({ status: 302, ok: false, type: 'opaqueredirect', body: '' }));
  const backend = loadBackend(fetchMock);
  await backend.request({ action: 'integrity.repair', model: 'customer', params: { stream: true } });
  const init = fetchMock.calls[0].init;
  assert.equal(init.redirect, 'manual',
    `stream fetch should pass redirect:'manual', saw ${JSON.stringify(init.redirect)}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: a genuine 2xx SSE body still parses into the events array. This is
// the happy path and must stay GREEN across the fix.
// ─────────────────────────────────────────────────────────────────────────────
await test('regression: 2xx SSE body parses to the events array', async () => {
  const sse =
    'data: {"event":"start","model":"Customer"}\n\n' +
    'data: {"phase":"instances","current":3,"total":3}\n\n' +
    'data: {"event":"done","healthy":true}\n\n';
  const fetchMock = mockFetchOnce(jsonResponse({ status: 200, ok: true, contentType: 'text/event-stream', body: sse }));
  const backend = loadBackend(fetchMock);
  const out = await backend.request({ action: 'integrity.repair', model: 'customer', params: { stream: true } });
  assert.ok(Array.isArray(out), `expected an array, got ${JSON.stringify(out)}`);
  assert.equal(out.length, 3);
  assert.equal(out[0].event, 'start');
  assert.equal(out[2].healthy, true);
});

// ── summary / exit ───────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
// Non-zero exit when any test fails (RED baseline => non-zero now, by design).
process.exit(failed.length ? 1 : 0);
