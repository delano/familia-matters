/* explorer/store.jsx — the raw-explorer data layer, wired to the ONE shared
 * backend (window.familiaBackend → the Familia Admin shell's single StateModel).
 *
 * Contract actions used here:
 *   raw.scan_keys   {pattern, type, cursor}  → SCAN page + next cursor (never KEYS)
 *   raw.inspect_key {key}                    → {type, ttl, memory, value, model?, id?}
 *   raw.info                                 → server INFO sections
 *   raw.command     {cmd, args, force}       → allowlisted read result, or
 *                                              {error:'command_blocked', …}
 *
 * Responses are normalized to fixed shapes and the screen degrades to the
 * window.RAW seed when the backend is unreachable. The live command feed is
 * simulated traffic (the live.commands subscription) generated client-side.
 *
 * Exports window.XSTORE.
 */
(function () {
  const RAW = window.RAW;
  const READ = 'permission:read';
  const RAWCMD = 'permission:raw_command';

  async function call(envelope) {
    if (!window.familiaBackend || typeof window.familiaBackend.request !== 'function') throw new Error('no_backend');
    return window.familiaBackend.request(envelope);
  }
  const isErr = (res, name) => res && typeof res === 'object' && (name ? res.error === name : !!res.error);

  function normKey(k) {
    if (!k || typeof k !== 'object') {
      const key = String(k || '');
      const seed = RAW.KEYS.find((x) => x.key === key);
      return seed ? { ...seed } : { key, type: 'string', ttl: -1, db: 0, memory: null };
    }
    const seed = RAW.KEYS.find((x) => x.key === k.key) || {};
    return {
      key: k.key,
      type: k.type || seed.type || 'string',
      ttl: k.ttl != null ? k.ttl : (seed.ttl != null ? seed.ttl : -1),
      db: k.db != null ? k.db : (seed.db != null ? seed.db : 0),
      memory: k.memory != null ? k.memory : (seed.memory != null ? seed.memory : null),
      model: k.model || seed.model || null,
      id: k.id || seed.id || null,
    };
  }

  // ── scan_keys (SCAN-based; cursor paging) ──────────────────────────────────
  async function scan(pattern, type, cursor) {
    try {
      const res = await call({ action: 'raw.scan_keys', params: { pattern: pattern || '*', type: type || 'all', cursor: cursor || 0 }, tier: READ });
      if (isErr(res)) throw new Error(res.error);
      const arr = Array.isArray(res) ? res : (res && Array.isArray(res.keys) ? res.keys : null);
      if (!arr) throw new Error('shape');
      return {
        keys: arr.map(normKey),
        cursor: res && res.cursor != null ? res.cursor : 0,
        scanned: res && res.scanned != null ? res.scanned : null,
        matched: res && res.matched != null ? res.matched : null,
        offline: false,
      };
    } catch (e) {
      const r = RAW.scanKeys(pattern, type, cursor);
      return { keys: r.keys.map(normKey), cursor: r.cursor, scanned: r.scanned, matched: r.matched, offline: true };
    }
  }

  // ── inspect_key ────────────────────────────────────────────────────────────
  async function inspect(key) {
    try {
      const res = await call({ action: 'raw.inspect_key', params: { key }, tier: READ });
      if (isErr(res, 'no_such_key')) return { error: 'no_such_key', key, offline: false };
      if (isErr(res)) throw new Error(res.error);
      const meta = normKey({ key, type: res.type, ttl: res.ttl, db: res.db, memory: res.memory, model: res.model, id: res.id });
      const value = normValue(res.value, meta.type, key);
      return { ...meta, value, offline: false };
    } catch (e) {
      const r = RAW.inspect(key);
      if (r.error) return { error: r.error, key, offline: true };
      return { key: r.key, type: r.type, ttl: r.ttl, db: r.db, memory: r.memory, model: r.model, id: r.id, value: normValue(r.value, r.type, key), offline: true };
    }
  }

  // Coerce a backend value into the typed shape the viewer expects.
  function normValue(value, type, key) {
    const seed = RAW.VALUES[key];
    if (value && typeof value === 'object') {
      if (value.type) return value;
      if (Array.isArray(value)) {
        if (type === 'zset') return { type: 'zset', members: value };
        return { type: type === 'list' ? 'list' : 'set', members: value };
      }
      if (value.entries) return { type: 'hash', entries: value.entries };
      if (value.members) return { type: type === 'zset' ? 'zset' : (type === 'list' ? 'list' : 'set'), members: value.members };
      if (value.value != null) return { type: 'counter', value: value.value };
      // a bare object → treat as hash entries
      return { type: 'hash', entries: value };
    }
    if (value != null && (type === 'counter' || type === 'string')) return { type: type, value: value };
    return seed || { type };
  }

  // ── info ────────────────────────────────────────────────────────────────────
  async function info() {
    try {
      const res = await call({ action: 'raw.info', tier: READ });
      if (isErr(res)) throw new Error(res.error);
      const sections = {};
      ['server', 'memory', 'clients', 'stats', 'keyspace'].forEach((s) => {
        sections[s] = (res && res[s] && typeof res[s] === 'object') ? res[s] : RAW.INFO[s];
      });
      return { sections, offline: false };
    } catch (e) {
      return { sections: RAW.INFO, offline: true };
    }
  }

  // ── command ──────────────────────────────────────────────────────────────────
  async function command(line, opts) {
    const o = opts || {};
    const parts = String(line || '').trim().split(/\s+/);
    const cmd = (parts[0] || '').toUpperCase();
    const args = parts.slice(1);
    const tier = o.force ? RAWCMD : READ;
    try {
      const res = await call({ action: 'raw.command', params: { cmd, args, force: !!o.force }, tier });
      if (isErr(res, 'command_blocked')) {
        return { blocked: true, cmd, required_tier: res.required_tier || RAWCMD, reason: res.reason || (RAW.BLOCK[cmd] || 'This command is not permitted from the admin.'), offline: false };
      }
      if (isErr(res, 'unknown_command')) return { unknown: true, cmd, offline: false };
      if (isErr(res, 'empty')) return { empty: true, offline: false };
      if (isErr(res)) throw new Error(res.error);
      return { cmd, args, result: stringifyResult(res), simulated: res.simulated !== false, forced: !!res.forced, offline: false };
    } catch (e) {
      const r = RAW.runCommandLocal(line, tier, !!o.force);
      if (r.error === 'command_blocked') return { blocked: true, cmd: r.cmd, required_tier: r.required_tier, reason: r.reason, offline: true };
      if (r.error === 'unknown_command') return { unknown: true, cmd: r.cmd, offline: true };
      if (r.error === 'empty') return { empty: true, offline: true };
      return { cmd: r.cmd, args: r.args, result: r.result, simulated: true, forced: !!r.forced, offline: true };
    }
  }
  function stringifyResult(res) {
    if (res == null) return '(nil)';
    if (typeof res.result === 'string') return res.result;
    if (res.result != null) return typeof res.result === 'object' ? JSON.stringify(res.result, null, 2) : String(res.result);
    if (typeof res === 'string') return res;
    const { _simulated, simulated, cmd, args, forced, ...rest } = res;
    return Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '(ok)';
  }

  window.XSTORE = {
    READ, RAWCMD,
    scan, inspect, info, command,
    isBlocked: (cmd) => !!RAW.BLOCK[String(cmd || '').toUpperCase()],
  };
})();
