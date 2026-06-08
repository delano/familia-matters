/* familia-backend.js — the real backend client.
 *
 * This REPLACES the in-browser simulator. Every screen talks to the admin
 * through window.familiaBackend.request(envelope); this module maps each
 * envelope action to the real Otto/Familia HTTP API (lib/familia/admin) and
 * returns the response in the shape the screens' stores expect.
 *
 * Transport rules:
 *   - Auth is a bearer token (Authorization header). Defaults to the dev token;
 *     set window.FAMILIA_ADMIN_TOKEN (or call setToken) for a real one.
 *   - 2xx and 4xx-with-JSON are returned as data, so a screen can read
 *     `res.error === 'forbidden'` etc. (the No-perm flow).
 *   - 5xx and network errors throw, so each screen falls back to its seed
 *     (the stores' existing offline path) and flags `simulated`.
 *   - integrity.repair {dry_run:false|stream:true} streams the SSE repair
 *     endpoint and collects the events the console animates.
 */
(function () {
  var BASE = (typeof window !== 'undefined' && window.FAMILIA_ADMIN_BASE) || '/admin/api';
  var TOKEN = (typeof window !== 'undefined' && window.FAMILIA_ADMIN_TOKEN) || 'dev-admin-token';

  function enc(v) { return encodeURIComponent(String(v == null ? '' : v)); }

  function qs(params) {
    var pairs = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v != null && v !== '') pairs.push(enc(k) + '=' + enc(v));
    });
    return pairs.length ? '?' + pairs.join('&') : '';
  }

  function headers(hasBody) {
    var h = { Authorization: 'Bearer ' + TOKEN };
    if (hasBody) h['Content-Type'] = 'application/json';
    return h;
  }

  async function http(method, path, opts) {
    opts = opts || {};
    var url = BASE + path + qs(opts.query);
    var res = await fetch(url, {
      method: method,
      headers: headers(!!opts.body),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (opts.sse) return collectSSE(res);
    var text = await res.text();
    var json;
    try { json = text ? JSON.parse(text) : {}; } catch (e) { json = {}; }
    // 5xx (and the network failures caught below) fall through to each screen's
    // seed fallback; 4xx carries a JSON error body the screens interpret.
    if (res.status >= 500) { var err = new Error('server_error'); err.status = res.status; throw err; }
    return json;
  }

  async function collectSSE(res) {
    var text = await res.text();
    return text.split('\n')
      .filter(function (l) { return l.indexOf('data:') === 0; })
      .map(function (l) { try { return JSON.parse(l.slice(5).trim()); } catch (e) { return null; } })
      .filter(Boolean);
  }

  async function request(envelope) {
    var e = envelope || {};
    var p = e.params || {};
    var model = e.model || 'customer';
    var id = e.id != null ? e.id : p.id;

    switch (e.action) {
      case 'meta':
        return http('GET', '/_meta');

      case 'records.list':
        return http('GET', '/models/' + enc(model) + '/records', { query: { offset: p.offset || 0, limit: p.limit || 50 } });
      case 'records.read':
        return http('GET', '/models/' + enc(model) + '/records/' + enc(id));
      case 'records.create':
        return http('POST', '/models/' + enc(model) + '/records', { body: { fields: e.record || {} } });
      case 'records.update':
        return http('PUT', '/models/' + enc(model) + '/records/' + enc(id), { body: { fields: e.changes || {} } });
      case 'records.destroy':
        return http('DELETE', '/models/' + enc(model) + '/records/' + enc(id));
      case 'records.reveal':
        return http('POST', '/models/' + enc(model) + '/records/' + enc(id) + '/reveal/' + enc(e.field));

      case 'query.index': {
        var index = p.index || p.field;
        return http('GET', '/models/' + enc(model) + '/index/' + enc(index), { query: { value: p.value != null ? p.value : '' } });
      }

      case 'records.collection':
        return http('GET', '/models/' + enc(model) + '/records/' + enc(id) + '/' + enc(p.collection));
      case 'records.mutate_collection':
        return http('POST', '/models/' + enc(model) + '/records/' + enc(id) + '/' + enc(p.collection), { body: { op: p.op, args: p.args || [] } });

      case 'integrity.check':
        return http('GET', '/integrity/' + enc(model));
      case 'integrity.repair':
        if (p.dry_run === false || p.stream) {
          // Apply: stream the repair; the console animates the collected events.
          return http('GET', '/stream/repair/' + enc(model), { sse: true });
        }
        return http('POST', '/integrity/' + enc(model) + '/repair', { query: { dry_run: 'true' } });

      case 'migrations.status':
        return http('GET', '/migrations');
      case 'migrations.drift': {
        var d = await http('GET', '/migrations/drift');
        // The store accepts an array of drift entries or {drift:[...]}.
        return Array.isArray(d) ? d : (d.models || d.drift || []);
      }
      case 'migrations.run':
        return http('POST', '/migrations/run', { query: { dry_run: p.dry_run ? 'true' : 'false' }, body: { id: e.id || p.id } });
      case 'migrations.rollback':
        return http('POST', '/migrations/rollback', { body: { id: e.id || p.id } });

      case 'raw.scan_keys':
        return http('GET', '/raw/keys', { query: { pattern: p.pattern, type: p.type, cursor: p.cursor } });
      case 'raw.inspect_key':
        return http('GET', '/raw/key', { query: { key: p.key } });
      case 'raw.info':
        return http('GET', '/raw/info');
      case 'raw.command':
        return http('POST', '/raw/command', { body: { cmd: p.cmd, args: p.args || [], force: !!p.force } });

      default: {
        var err = new Error('unknown_action: ' + e.action);
        throw err;
      }
    }
  }

  window.familiaBackend = {
    request: request,
    setToken: function (t) { TOKEN = t; },
    setBase: function (b) { BASE = b; },
  };
})();
