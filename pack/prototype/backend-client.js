/* backend-client.js — every screen talks to the ONE shared backend through this.
 *
 * Plain JS. Exposes window.familiaBackend.request(envelope) -> Promise<json>.
 *
 * - Embedded in the Familia Admin shell: requests are forwarded to the parent,
 *   which hosts the single backend instance, so all screens share one StateModel.
 * - Opened standalone: falls back to a local backend instance (createFamiliaBackend).
 *
 * Requires: window.createFamiliaBackend (backend.js) for the local fallback.
 */
(function () {
  var EMBEDDED = window.parent && window.parent !== window;
  var mode = null;            // 'bridge' | 'local'
  var local = null;
  var pending = new Map();
  var seq = 0;

  function ensureLocal() {
    if (!local) local = window.createFamiliaBackend();
    return local;
  }

  // Resolve which transport to use. When embedded we ping the parent and wait
  // briefly for a pong; if the parent has no backend (or isn't ours) we fall
  // back to a local instance so the screen still works on its own.
  var ready;
  if (EMBEDDED) {
    ready = new Promise(function (resolve) {
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; mode = 'local'; resolve(); } }, 1200);
      function onPong(e) {
        var d = e.data || {};
        if (d.type === 'familia-backend-pong') {
          if (done) return;
          done = true; clearTimeout(to); mode = 'bridge';
          window.removeEventListener('message', onPong);
          resolve();
        }
      }
      window.addEventListener('message', onPong);
      try { window.parent.postMessage({ type: 'familia-backend-ping' }, '*'); } catch (e) {}
    });
  } else {
    mode = 'local';
    ready = Promise.resolve();
  }

  // Bridge responses from the parent.
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'familia-backend-res' && pending.has(d.id)) {
      var slot = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) slot.reject(new Error(d.error));
      else slot.resolve(d.result);
    }
  });

  async function request(envelope) {
    await ready;
    if (mode === 'bridge') {
      var id = ++seq;
      return new Promise(function (resolve, reject) {
        pending.set(id, { resolve: resolve, reject: reject });
        try { window.parent.postMessage({ type: 'familia-backend-req', id: id, envelope: envelope }, '*'); }
        catch (err) { pending.delete(id); reject(err); return; }
        setTimeout(function () {
          if (pending.has(id)) { pending.delete(id); reject(new Error('backend_timeout')); }
        }, 60000);
      });
    }
    return ensureLocal().request(envelope);
  }

  // Live SSE subscriptions (stream.commands / stream.repair) go DIRECT to the
  // backend via a local transport rather than over the postMessage bridge —
  // streaming a long-lived connection through postMessage adds no value and the
  // screens are same-origin with the Otto mount. Returns an unsubscribe fn.
  function subscribe(envelope, onEvent, onError) {
    return ensureLocal().subscribe(envelope, onEvent, onError);
  }

  window.familiaBackend = { request: request, subscribe: subscribe };
})();
