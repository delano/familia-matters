// backend-client.test.mjs
//
// Node test for the client-only adapter bugs (#5 and #6) that NO Ruby test can
// reach -- they live entirely in backend-client.js's fetch-result handling.
//
// Harness: the file is a browser IIFE that reads global `window` + global
// `fetch` and assigns `window.familiaBackend`. We install an in-memory
// localStorage shim and a per-test mock fetch, evaluate the file source via
// `vm.runInThisContext`, then drive window.familiaBackend.request(envelope).
//
// Run: node resources/01-designs/prototype/backend-client.test.mjs
// RED now (adapter unfixed). The fixer makes #5/#6 green.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, 'backend-client.js'), 'utf8');

// ── in-memory localStorage shim ──────────────────────────────────────────────
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

// Load a FRESH backend bound to a given mock fetch. Each call rebuilds window so
// the IIFE re-runs against the supplied fetch and a clean token.
function loadBackend(mockFetch) {
  const win = {
    localStorage: makeStorage(),
    FAMILIA_ADMIN_TOKEN: 'test-token',
    FAMILIA_ADMIN_API_BASE: '',
  };
  globalThis.window = win;
  globalThis.fetch = mockFetch;
  vm.runInThisContext(SRC, { filename: 'backend-client.js' });
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

// Generic-auth regression: a 401 with an empty/unparseable body still resolves
// the generic forbidden envelope. This stays GREEN across the fix.
await test('generic-auth: 401 empty body resolves forbidden envelope', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({ status: 401, ok: false, body: '' }));
  const backend = loadBackend(fetchMock);
  const out = await backend.request({ action: 'records.list', model: 'customer', params: {} });
  assert.equal(out.error, 'forbidden', `expected forbidden, got ${JSON.stringify(out)}`);
  assert.equal(out.required_tier, 'role:admin');
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG #6: a streaming action whose fetch yields a redirect / opaque / non-event
// -stream success must resolve forbidden (the deny shape), not an empty/garbage
// event array. The fix uses redirect:'manual'; we also record that the adapter
// requests manual redirect. BEHAVIORAL assertion (resolves forbidden) is the
// red->green one. RED now: a 302 has res.ok=false and no JSON error -> throws;
// a non-event-stream 200 has res.ok=true -> parseSSE returns [] (not forbidden).
// ─────────────────────────────────────────────────────────────────────────────
await test('#6 stream 302 redirect resolves forbidden (not throw/empty)', async () => {
  const fetchMock = mockFetchOnce(jsonResponse({ status: 302, ok: false, type: 'opaqueredirect', body: '' }));
  const backend = loadBackend(fetchMock);
  const out = await backend.request({ action: 'integrity.repair', model: 'customer', params: { stream: true } });
  assert.ok(out && !Array.isArray(out), `expected an object, got ${JSON.stringify(out)}`);
  assert.equal(out.error, 'forbidden', `expected forbidden, got ${JSON.stringify(out)}`);
  assert.equal(out.required_tier, 'permission:repair');
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
