/* backend-client.js — every screen talks to the ONE shared backend through this.
 *
 * Plain JS. Exposes window.familiaBackend.request(envelope) -> Promise<json>.
 *
 * This is the single integration point: it maps each client action envelope to a
 * real REST call against the Otto admin API (same-origin; base path '' so that
 * /admin/api/* hits the serving app). Because every screen hits the same backend
 * over the same shared Redis, the old postMessage bridge to a parent frame is no
 * longer needed — request() does real HTTP directly.
 *
 * Contract: request(envelope) -> Promise<json>
 *   · 2xx                       -> resolve the parsed bare JSON (object or array)
 *   · 401 / 403                 -> resolve { error:'forbidden', required_tier }
 *                                  (do NOT reject — the gated UI states render)
 *   · other non-2xx w/ {error}  -> resolve the parsed JSON verbatim (stores read
 *                                  res.error: scan_required, command_blocked, …)
 *   · other non-2xx w/o error   -> throw (stores fall back to offline mirror)
 *   · network failure / throw   -> rethrow (stores fall back to offline mirror)
 *
 * Streaming: integrity.repair {stream:true} hits the SSE route; the body is read
 * to completion, each `data: {json}` line is parsed, and the Promise resolves
 * with the ARRAY of events (callers animate the array themselves).
 *
 * Auth: a PASETO bearer token is read fresh per request from
 * window.FAMILIA_ADMIN_TOKEN (falling back to localStorage 'familia_admin_token')
 * and sent as `Authorization: Bearer <token>`. The client-only envelope `tier`
 * is never sent to the server. window.familiaBackend.setToken(t) overrides it.
 */
(function () {
  // ── Base path: same-origin by default; overridable for embedding ───────────
  function apiBase() {
    var b = window.FAMILIA_ADMIN_API_BASE;
    return typeof b === 'string' ? b : '';
  }

  // ── Auth token: window var wins, else localStorage, read fresh per request ──
  var tokenOverride = null;
  function currentToken() {
    if (tokenOverride != null) return tokenOverride;
    if (window.FAMILIA_ADMIN_TOKEN != null) return window.FAMILIA_ADMIN_TOKEN;
    try { return window.localStorage.getItem('familia_admin_token'); }
    catch (e) { return null; }
  }
  function setToken(t) {
    tokenOverride = (t == null ? null : String(t));
    try {
      if (t == null) window.localStorage.removeItem('familia_admin_token');
      else window.localStorage.setItem('familia_admin_token', String(t));
    } catch (e) {}
  }

  // ── required_tier for the elevated actions; default role:admin otherwise ────
  var REQUIRED_TIER = {
    'records.reveal': 'permission:reveal_secrets',
    'integrity.repair': 'permission:repair',
    'migrations.run': 'permission:run_migrations',
    'migrations.rollback': 'permission:run_migrations',
    'raw.command': 'permission:raw_command',
  };
  function requiredTier(action) {
    return REQUIRED_TIER[action] || 'role:admin';
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  function enc(v) { return encodeURIComponent(String(v == null ? '' : v)); }

  function qs(params) {
    var pairs = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v == null || v === '') return;
      pairs.push(enc(k) + '=' + enc(v));
    });
    return pairs.length ? '?' + pairs.join('&') : '';
  }

  function truthy(v) { return v === true || v === 'true' || v === 1 || v === '1'; }

  // Map an action envelope to { method, path, query, body, stream }.
  function planRequest(env) {
    var action = env.action;
    var model = env.model;
    var p = env.params || {};
    var M = function () { return 'models/' + enc(model); };

    switch (action) {
      // ── discovery ──
      case 'meta':
        return { method: 'GET', path: '_meta' };

      // ── records ──
      case 'records.list':
        return { method: 'GET', path: M() + '/records', query: { offset: p.offset, limit: p.limit } };
      case 'records.read':
        return { method: 'GET', path: M() + '/records/' + enc(env.id) };
      case 'records.create':
        return { method: 'POST', path: M() + '/records', body: { fields: env.record } };
      case 'records.update':
        return { method: 'PUT', path: M() + '/records/' + enc(env.id), body: { fields: env.changes } };
      case 'records.destroy':
        return { method: 'DELETE', path: M() + '/records/' + enc(env.id) };
      case 'records.reveal':
        return { method: 'POST', path: M() + '/records/' + enc(env.id) + '/reveal/' + enc(env.field) };

      // ── query ──
      case 'query.index':
        return {
          method: 'GET',
          path: M() + '/index/' + enc(p.index || p.field),
          query: { value: p.value, force: p.force ? 'true' : null },
        };

      // ── integrity ──
      case 'integrity.check':
        return { method: 'GET', path: 'integrity/' + enc(model) };
      case 'integrity.repair':
        if (truthy(p.stream)) {
          return { method: 'GET', path: 'stream/repair/' + enc(model), stream: true };
        }
        if (truthy(p.dry_run)) {
          return { method: 'POST', path: 'integrity/' + enc(model) + '/repair', query: { dry_run: 'true' } };
        }
        return { method: 'POST', path: 'integrity/' + enc(model) + '/repair' };

      // ── migrations ──
      case 'migrations.status':
        return { method: 'GET', path: 'migrations' };
      case 'migrations.drift':
        return { method: 'GET', path: 'migrations/drift' };
      case 'migrations.run':
        // stream:true here is NOT SSE — there is no migrations stream route; the
        // response body is already the events array the store reads.
        return {
          method: 'POST', path: 'migrations/run',
          query: { dry_run: p.dry_run ? 'true' : null, limit: p.limit },
          body: { id: p.id != null ? p.id : env.id },
        };
      case 'migrations.rollback':
        return {
          method: 'POST', path: 'migrations/rollback',
          body: { id: p.id != null ? p.id : env.id },
        };

      // ── raw explorer ──
      case 'raw.scan_keys':
        return { method: 'GET', path: 'raw/keys', query: { pattern: p.pattern, type: p.type, cursor: p.cursor } };
      case 'raw.inspect_key':
        return { method: 'GET', path: 'raw/key', query: { key: p.key } };
      case 'raw.info':
        return { method: 'GET', path: 'raw/info' };
      case 'raw.command':
        return { method: 'POST', path: 'raw/command', body: { cmd: p.cmd, args: p.args, force: !!p.force } };

      default:
        return null;
    }
  }

  function buildUrl(plan) {
    return apiBase() + '/admin/api/' + plan.path + qs(plan.query);
  }

  function buildHeaders(plan) {
    var h = {};
    var token = currentToken();
    if (token) h['Authorization'] = 'Bearer ' + token;
    if (plan.stream) h['Accept'] = 'text/event-stream';
    else h['Accept'] = 'application/json';
    if (plan.body !== undefined) h['Content-Type'] = 'application/json';
    return h;
  }

  // Parse an SSE text/event-stream body into the array of event objects. Each
  // event is one or more `data: {json}` lines; blank lines separate events.
  function parseSSE(text) {
    var events = [];
    String(text || '').split(/\r?\n\r?\n/).forEach(function (block) {
      var dataLines = [];
      block.split(/\r?\n/).forEach(function (line) {
        var m = /^data:\s?(.*)$/.exec(line);
        if (m) dataLines.push(m[1]);
      });
      if (!dataLines.length) return;
      var payload = dataLines.join('\n').trim();
      if (!payload) return;
      try { events.push(JSON.parse(payload)); }
      catch (e) { /* skip non-JSON keepalive/comment frames */ }
    });
    return events;
  }

  async function parseJsonSafe(res) {
    var txt = await res.text();
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
  }

  async function request(envelope) {
    var env = envelope || {};
    var plan = planRequest(env);
    if (!plan) throw new Error('unknown_action:' + env.action);

    var url = buildUrl(plan);
    var init = { method: plan.method, headers: buildHeaders(plan) };
    if (plan.body !== undefined) init.body = JSON.stringify(plan.body);
    // Stream denials are 302 -> /signin; don't follow the redirect and swallow
    // the signin page. redirect:'manual' surfaces the 3xx (or an opaqueredirect)
    // so the stream branch can map it to the forbidden deny shape (Bug #6).
    if (plan.stream) init.redirect = 'manual';

    // fetch throwing (network failure) propagates to the caller (offline mirror).
    var res = await fetch(url, init);

    // Streaming repair: only a genuine 2xx text/event-stream body is the event
    // array. A 3xx redirect, an opaque redirect (res.type==='opaqueredirect',
    // status 0), any non-2xx, or a non-event-stream content-type means the route
    // denied us (302 -> /signin) -> resolve the forbidden deny shape (Bug #6).
    if (plan.stream) {
      var streamCT = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
      var isEventStream = res.ok && res.status >= 200 && res.status < 300 &&
        res.type !== 'opaqueredirect' && /text\/event-stream/i.test(streamCT);
      if (isEventStream) {
        var body = await res.text();
        return parseSSE(body);
      }
      return { error: 'forbidden', required_tier: requiredTier('integrity.repair') };
    }

    // 401/403 → parse the body first. A real JSON error code (command_blocked,
    // scan_required, or any {error:...}) is resolved verbatim (Bug #5); only a
    // generic/empty/unparseable auth failure synthesizes the forbidden envelope.
    if (res.status === 401 || res.status === 403) {
      var authBody = await parseJsonSafe(res);
      if (authBody && typeof authBody === 'object' && authBody.error) return authBody;
      return { error: 'forbidden', required_tier: requiredTier(env.action) };
    }

    if (res.ok) {
      // 2xx → bare object/array.
      return await parseJsonSafe(res);
    }

    // Other non-2xx: pass through a JSON error body verbatim (scan_required,
    // command_blocked, no_such_key, CrossDatabaseError, …); else throw → offline.
    var data = await parseJsonSafe(res);
    if (data && typeof data === 'object' && data.error) return data;
    throw new Error('http_' + res.status);
  }

  window.familiaBackend = { request: request, setToken: setToken };
})();
