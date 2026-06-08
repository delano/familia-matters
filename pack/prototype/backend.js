/* backend.js — the REAL backend transport (replaces the in-browser simulator).
 *
 * The prototype used to answer every request with a Claude-API call that played
 * the familia-admin server. This is the production seam described in the design
 * handoff: the same uniform envelope the screens already send is now translated
 * into HTTP calls against the real Otto endpoints (lib/familia/admin/api.rb),
 * which emit the identical JSON shapes (fixtures/*.json). It is a transport swap,
 * not a redesign — window.familiaBackend.request(envelope) keeps its signature,
 * so no screen changes.
 *
 * Config (set window.FAMILIA_ADMIN_CONFIG before this script, or rely on the
 * same-origin defaults):
 *   { baseUrl: '/admin/api',         // where Otto is mounted
 *     token: 'dev-admin',            // bearer token (Authorization header)
 *     credentials: 'same-origin' }   // fetch credentials mode
 */
(function () {
  function config() {
    var c = window.FAMILIA_ADMIN_CONFIG || {};
    return {
      baseUrl: (c.baseUrl || '/admin/api').replace(/\/$/, ''),
      token: c.token || null,
      credentials: c.credentials || 'same-origin',
    };
  }

  function qs(params) {
    if (!params) return '';
    var parts = Object.keys(params)
      .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function enc(v) { return encodeURIComponent(String(v)); }

  // Translate the uniform envelope {action, model, id, collection, index, field,
  // params, body} into an HTTP {method, path, body, query} per the routes file.
  // The action names mirror the prototype simulator's contract so the screens
  // need no changes.
  function route(env) {
    var m = env.model, id = env.id, p = env.params || {};
    switch (env.action) {
      case 'meta': return { method: 'GET', path: '/_meta' };
      case 'openapi': return { method: 'GET', path: '/_openapi' };
      case 'models': return { method: 'GET', path: '/models' };
      case 'model.describe':
      case 'describe_model': return { method: 'GET', path: '/models/' + enc(m) };

      case 'records.list': return { method: 'GET', path: '/models/' + enc(m) + '/records', query: p };
      case 'records.read': return { method: 'GET', path: '/models/' + enc(m) + '/records/' + enc(id) };
      case 'records.create': return { method: 'POST', path: '/models/' + enc(m) + '/records', body: { fields: env.fields || p.fields || p } };
      case 'records.update': return { method: 'PUT', path: '/models/' + enc(m) + '/records/' + enc(id), body: { fields: env.fields || p.fields || p } };
      case 'records.destroy': return { method: 'DELETE', path: '/models/' + enc(m) + '/records/' + enc(id) };
      case 'records.reveal': return { method: 'POST', path: '/models/' + enc(m) + '/records/' + enc(id) + '/reveal/' + enc(env.field) };

      case 'collection.read': return { method: 'GET', path: '/models/' + enc(m) + '/records/' + enc(id) + '/' + enc(env.collection), query: p };
      case 'collection.mutate': return { method: 'POST', path: '/models/' + enc(m) + '/records/' + enc(id) + '/' + enc(env.collection), body: { op: env.op, args: env.args } };

      case 'query.index': return { method: 'GET', path: '/models/' + enc(m) + '/index/' + enc(env.index), query: p };

      case 'integrity.stale': return { method: 'GET', path: '/integrity/_stale_indexes' };
      case 'integrity.check': return { method: 'GET', path: '/integrity/' + enc(m) };
      case 'integrity.repair': return { method: 'POST', path: '/integrity/' + enc(m) + '/repair', query: { dry_run: p.dry_run, scope: p.scope } };

      case 'migrations.status': return { method: 'GET', path: '/migrations' };
      case 'migrations.drift': return { method: 'GET', path: '/migrations/drift' };
      case 'migrations.run': return { method: 'POST', path: '/migrations/run', query: { dry_run: p.dry_run, limit: p.limit } };
      case 'migrations.rollback': return { method: 'POST', path: '/migrations/rollback', body: { id: env.id || p.id } };

      case 'raw.scan_keys': return { method: 'GET', path: '/raw/keys', query: p };
      case 'raw.inspect_key': return { method: 'GET', path: '/raw/key', query: { key: env.key || p.key } };
      case 'raw.info': return { method: 'GET', path: '/raw/info' };
      case 'raw.command': return { method: 'POST', path: '/raw/command', body: { cmd: env.cmd, args: env.args } };
      default: return null;
    }
  }

  function headers(cfg, hasBody) {
    var h = { Accept: 'application/json' };
    if (hasBody) h['Content-Type'] = 'application/json';
    if (cfg.token) h.Authorization = 'Bearer ' + cfg.token;
    return h;
  }

  function request(envelope) {
    var cfg = config();
    var r = route(envelope);
    if (!r) return Promise.reject(new Error('unknown_action: ' + envelope.action));

    var url = cfg.baseUrl + r.path + qs(r.query);
    var init = {
      method: r.method,
      headers: headers(cfg, !!r.body),
      credentials: cfg.credentials,
    };
    if (r.body) init.body = JSON.stringify(r.body);

    return fetch(url, init).then(function (res) {
      return res.text().then(function (text) {
        var data;
        try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { error: 'bad_json', raw: text }; }
        if (!res.ok) {
          var err = new Error((data && (data.error || data.message)) || ('http_' + res.status));
          err.status = res.status;
          err.body = data;
          throw err;
        }
        return data;
      });
    });
  }

  // Server-Sent-Events subscription for the live endpoints (GET routes). Uses
  // fetch + a streaming reader rather than EventSource so the Authorization
  // header can be sent. Returns an unsubscribe function.
  //
  //   subscribe({action:'stream.repair', model:'customer', params:{dry_run:false}},
  //             function (event) { ... }, function (err) { ... })
  function subscribe(envelope, onEvent, onError) {
    var cfg = config();
    var path, query = {};
    if (envelope.action === 'stream.commands') {
      path = '/stream/commands';
    } else if (envelope.action === 'stream.repair') {
      path = '/stream/repair/' + enc(envelope.model);
      query = envelope.params || {};
    } else {
      onError && onError(new Error('unknown_stream: ' + envelope.action));
      return function () {};
    }

    var controller = new AbortController();
    fetch(cfg.baseUrl + path + qs(query), {
      method: 'GET',
      headers: headers(cfg, false),
      credentials: cfg.credentials,
      signal: controller.signal,
    }).then(function (res) {
      if (!res.ok || !res.body) { onError && onError(new Error('stream_http_' + res.status)); return; }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) return;
          buffer += decoder.decode(chunk.value, { stream: true });
          var blocks = buffer.split('\n\n');
          buffer = blocks.pop();
          blocks.forEach(function (block) {
            var line = block.split('\n').filter(function (l) { return l.indexOf('data:') === 0; })[0];
            if (!line) return; // heartbeat/comment
            try { onEvent(JSON.parse(line.slice(5).trim())); } catch (e) { /* skip */ }
          });
          return pump();
        });
      }
      return pump();
    }).catch(function (err) { if (err.name !== 'AbortError') onError && onError(err); });

    return function unsubscribe() { controller.abort(); };
  }

  // Factory keeps the historical name/signature so backend-client.js and the
  // shell wire up unchanged.
  window.createFamiliaBackend = function createFamiliaBackend() {
    return { request: request, subscribe: subscribe };
  };

  // Also expose directly for screens that don't go through the shell bridge.
  window.familiaBackendTransport = { request: request, subscribe: subscribe };
})();
