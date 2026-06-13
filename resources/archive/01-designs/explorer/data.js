/* explorer/data.js — seed for the Raw explorer.
 *
 * Plain JS (no JSX) → window.RAW. Mirrors the keys the dev fixtures imply
 * (customer/api_key/session records, their datatypes, the email_lookup +
 * status_index indexes, the api_keys participation). The explorer talks to
 * the ONE shared backend (raw.*); this seed is only the offline fallback and
 * the shape-normalizer, exactly like the other screens.
 *
 * Everything here is SIMULATED — there is no real Redis/Valkey connection.
 */
(function () {
  const NOW = 1749200300;
  const DAY = 86400;

  // ── Keyspace (derived from the shared seed) ────────────────────────────────
  // type ∈ string|hash|list|set|zset|counter. A key that maps to a model carries
  // {model,id} so the inspector can bridge to the model-aware detail.
  const KEYS = [
    // customer objects (db0) — hashes that ARE Customer records
    { key: 'customer:cust_8f2a91:object', type: 'hash', ttl: 6_912_000, db: 0, memory: 312, model: 'customer', id: 'cust_8f2a91' },
    { key: 'customer:cust_4410bd:object', type: 'hash', ttl: 7_171_200, db: 0, memory: 288, model: 'customer', id: 'cust_4410bd' },
    { key: 'customer:cust_2200ee:object', type: 'hash', ttl: 6_220_800, db: 0, memory: 296, model: 'customer', id: 'cust_2200ee' },
    // cust_8f2a91 attached datatypes
    { key: 'customer:cust_8f2a91:recent_logins', type: 'list', ttl: -1, db: 0, memory: 420 },
    { key: 'customer:cust_8f2a91:feature_flags', type: 'set', ttl: -1, db: 0, memory: 200 },
    { key: 'customer:cust_8f2a91:domains', type: 'zset', ttl: -1, db: 0, memory: 264 },
    { key: 'customer:cust_8f2a91:metadata', type: 'hash', ttl: -1, db: 0, memory: 232 },
    { key: 'customer:cust_8f2a91:login_count', type: 'counter', ttl: -1, db: 0, memory: 64 },
    // unique index (db0) — a hash map field-value → identifier
    { key: 'customer:email_lookup', type: 'hash', ttl: -1, db: 0, memory: 184 },
    // multi index (db3) — one set per status bucket
    { key: 'customer:status_index:active', type: 'set', ttl: -1, db: 3, memory: 120 },
    { key: 'customer:status_index:pending', type: 'set', ttl: -1, db: 3, memory: 96 },
    { key: 'customer:status_index:inactive', type: 'set', ttl: -1, db: 3, memory: 96 },
    // api_key object (db0) + participation collection (db3)
    { key: 'api_key:key_77c3:object', type: 'hash', ttl: -1, db: 0, memory: 256, model: 'api_key', id: 'key_77c3' },
    { key: 'customer:cust_8f2a91:api_keys', type: 'zset', ttl: -1, db: 3, memory: 144 },
  ];

  // ── Per-key value payloads (the typed viewer reads these) ──────────────────
  const VALUES = {
    'customer:cust_8f2a91:object': { type: 'hash', entries: {
      custid: 'cust_8f2a91', email: 'alice@example.com', name: 'Alice Ng', status: 'active',
      created_at: '1730419200', updated_at: '1748736000', api_secret: '[CONCEALED]',
    } },
    'customer:cust_4410bd:object': { type: 'hash', entries: {
      custid: 'cust_4410bd', email: 'bob@example.com', name: 'Bob Tran', status: 'pending',
      created_at: '1733011200', updated_at: '1733011200', api_secret: '[CONCEALED]',
    } },
    'customer:cust_2200ee:object': { type: 'hash', entries: {
      custid: 'cust_2200ee', email: 'erin@example.com', name: 'Erin Diaz', status: 'inactive',
      created_at: '1727740800', updated_at: '1746057600', api_secret: '[CONCEALED]',
    } },
    'customer:cust_8f2a91:recent_logins': { type: 'list', members: [
      'login:1749081600:203.0.113.10:Firefox 128 · macOS',
      'login:1748736000:198.51.100.24:Chrome 126 · Windows',
      'login:1748390400:203.0.113.10:Firefox 128 · macOS',
      'login:1747872000:192.0.2.77:Safari 17 · iOS',
      'login:1747612800:203.0.113.10:Firefox 128 · macOS',
    ] },
    'customer:cust_8f2a91:feature_flags': { type: 'set', members: ['beta_dashboard', 'api_v2', 'sso_okta', 'audit_export'] },
    'customer:cust_8f2a91:domains': { type: 'zset', members: [
      { member: 'example.com', score: 1730419200 },
      { member: 'alice.dev', score: 1733097600 },
      { member: 'ng.consulting', score: 1744761600 },
    ] },
    'customer:cust_8f2a91:metadata': { type: 'hash', entries: { signup_source: 'referral', plan: 'team', region: 'eu-west' } },
    'customer:cust_8f2a91:login_count': { type: 'counter', value: 318 },
    'customer:email_lookup': { type: 'hash', entries: {
      'alice@example.com': 'cust_8f2a91', 'bob@example.com': 'cust_4410bd', 'erin@example.com': 'cust_2200ee',
    } },
    'customer:status_index:active': { type: 'set', members: ['cust_8f2a91'] },
    'customer:status_index:pending': { type: 'set', members: ['cust_4410bd'] },
    'customer:status_index:inactive': { type: 'set', members: ['cust_2200ee'] },
    'api_key:key_77c3:object': { type: 'hash', entries: {
      keyid: 'key_77c3', custid: 'cust_8f2a91', label: 'CI deploy token',
      created_at: '1738368000', last_used_at: '1748908800', secret: '[CONCEALED]',
    } },
    'customer:cust_8f2a91:api_keys': { type: 'zset', members: [
      { member: 'key_77c3', score: 1738368000 },
    ] },
  };

  // ── raw.info — parsed into sections ────────────────────────────────────────
  const INFO = {
    server: {
      server_name: 'valkey', server_version: '8.0.1', mode: 'standalone',
      os: 'Linux 6.8.0 x86_64', process_id: '1', run_id: '9f2c7a1be4d60934aa18',
      tcp_port: '6379', uptime_in_seconds: '1894207', uptime_in_days: '21',
    },
    memory: {
      used_memory: '41_517_184', used_memory_human: '39.6M', used_memory_peak_human: '52.1M',
      used_memory_rss_human: '48.3M', maxmemory_human: '512.0M', maxmemory_policy: 'noeviction',
      mem_fragmentation_ratio: '1.22', mem_allocator: 'jemalloc-5.3.0',
    },
    clients: {
      connected_clients: '18', cluster_connections: '0', maxclients: '10000',
      blocked_clients: '0', tracking_clients: '4', clients_in_timeout_table: '0',
    },
    stats: {
      total_connections_received: '284_119', total_commands_processed: '9_847_201',
      instantaneous_ops_per_sec: '142', total_net_input_bytes: '1_204_887_104',
      keyspace_hits: '8_120_443', keyspace_misses: '88_201',
      expired_keys: '41_882', evicted_keys: '0', rejected_connections: '0',
    },
    keyspace: {
      db0: 'keys=1330,expires=1284,avg_ttl=6411200',
      db1: 'keys=0,expires=0,avg_ttl=0',
      db3: 'keys=46,expires=0,avg_ttl=0',
    },
  };

  // ── live.commands — simulated traffic for the command feed ─────────────────
  // duration_ms over SLOW_MS is highlighted as a slow command.
  const SLOW_MS = 10;
  const FEED_SAMPLES = [
    { cmd: 'HGETALL', key: 'customer:cust_8f2a91:object', duration_ms: 0.4 },
    { cmd: 'GET', key: 'customer:cust_8f2a91:login_count', duration_ms: 0.1 },
    { cmd: 'ZRANGE', key: 'customer:cust_8f2a91:domains', duration_ms: 0.3 },
    { cmd: 'SMEMBERS', key: 'customer:status_index:active', duration_ms: 0.2 },
    { cmd: 'HGET', key: 'customer:email_lookup', duration_ms: 0.2 },
    { cmd: 'SCAN', key: 'customer:*:object', duration_ms: 14.6 },
    { cmd: 'EXPIRE', key: 'customer:cust_4410bd:object', duration_ms: 0.3 },
    { cmd: 'ZADD', key: 'customer:cust_8f2a91:api_keys', duration_ms: 0.5 },
    { cmd: 'LRANGE', key: 'customer:cust_8f2a91:recent_logins', duration_ms: 0.6 },
    { cmd: 'SMEMBERS', key: 'customer:status_index:pending', duration_ms: 0.2 },
    { cmd: 'HGETALL', key: 'api_key:key_77c3:object', duration_ms: 0.4 },
    { cmd: 'SCAN', key: 'customer:status_index:*', duration_ms: 21.3 },
    { cmd: 'INCR', key: 'customer:cust_8f2a91:login_count', duration_ms: 0.1 },
    { cmd: 'TTL', key: 'customer:cust_2200ee:object', duration_ms: 0.1 },
    { cmd: 'HSET', key: 'customer:cust_8f2a91:metadata', duration_ms: 0.4 },
    { cmd: 'ZSCORE', key: 'customer:cust_8f2a91:domains', duration_ms: 0.2 },
  ];

  // ── Command console allowlist ──────────────────────────────────────────────
  const ALLOW = ['GET', 'HGET', 'HGETALL', 'HKEYS', 'HLEN', 'TYPE', 'TTL', 'PTTL', 'SCAN', 'ZRANGE', 'ZSCORE', 'ZCARD', 'SMEMBERS', 'SCARD', 'SISMEMBER', 'LLEN', 'LRANGE', 'STRLEN', 'EXISTS', 'OBJECT', 'MEMORY', 'DBSIZE', 'INFO'];
  const BLOCK = {
    KEYS: 'Blocking O(N) scan of the entire keyspace. Use SCAN with a cursor instead.',
    FLUSHALL: 'Destroys every key in every database. Never runs from the admin.',
    FLUSHDB: 'Destroys every key in the current database.',
    CONFIG: 'Reads/writes server configuration. Out of scope for the data admin.',
    SHUTDOWN: 'Stops the server process.',
    DEBUG: 'Server-debug surface; can stall or crash the instance.',
  };

  // ── Offline simulators (used only when window.familiaBackend is absent) ────
  function scanKeys(pattern, typeFilter, cursor) {
    const start = cursor || 0;
    const pageSize = 8;
    const glob = globToRegExp(pattern || '*');
    const matched = KEYS.filter((k) => glob.test(k.key) && (!typeFilter || typeFilter === 'all' || k.type === typeFilter));
    const page = matched.slice(start, start + pageSize);
    const next = start + pageSize < matched.length ? start + pageSize : 0;
    return { keys: page, cursor: next, scanned: KEYS.length, matched: matched.length };
  }
  function globToRegExp(glob) {
    const esc = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + esc + '$', 'i');
  }
  function inspect(key) {
    const meta = KEYS.find((k) => k.key === key);
    if (!meta) return { error: 'no_such_key', key };
    const value = VALUES[key] || { type: meta.type };
    return { key, type: meta.type, ttl: meta.ttl, memory: meta.memory, db: meta.db, model: meta.model || null, id: meta.id || null, value };
  }
  function runCommandLocal(raw, tier, force) {
    const parts = String(raw || '').trim().split(/\s+/);
    const cmd = (parts[0] || '').toUpperCase();
    const args = parts.slice(1);
    if (!cmd) return { error: 'empty' };
    if (BLOCK[cmd]) {
      const allowed = tier === 'permission:raw_command' && force;
      if (!allowed) return { error: 'command_blocked', cmd, required_tier: 'permission:raw_command', reason: BLOCK[cmd], _simulated: true };
      return { cmd, args, blocked: true, forced: true, result: '(forced — refused by guardrail, no real connection)', _simulated: true };
    }
    if (!ALLOW.includes(cmd)) return { error: 'unknown_command', cmd, _simulated: true };
    return { cmd, args, result: simulateRead(cmd, args), _simulated: true };
  }
  function simulateRead(cmd, args) {
    const key = args[0];
    if (cmd === 'DBSIZE') return '(integer) 1330';
    if (cmd === 'INFO') return 'see Server info panel';
    if (cmd === 'TYPE') { const m = KEYS.find((k) => k.key === key); return m ? m.type.replace('counter', 'string') : 'none'; }
    if (cmd === 'TTL') { const m = KEYS.find((k) => k.key === key); return m ? `(integer) ${m.ttl}` : '(integer) -2'; }
    if (cmd === 'EXISTS') return `(integer) ${KEYS.some((k) => k.key === key) ? 1 : 0}`;
    const v = VALUES[key];
    if (!v) return '(nil)';
    if (cmd === 'GET' && v.type === 'counter') return `"${v.value}"`;
    if (cmd === 'HGETALL') return Object.entries(v.entries || {}).map(([k, val]) => `${k} → ${val}`).join('\n');
    if (cmd === 'HGET') { const f = args[1]; return v.entries && v.entries[f] != null ? `"${v.entries[f]}"` : '(nil)'; }
    if (cmd === 'SMEMBERS') return (v.members || []).map((m, i) => `${i + 1}) "${m}"`).join('\n');
    if (cmd === 'SCARD') return `(integer) ${(v.members || []).length}`;
    if (cmd === 'LLEN') return `(integer) ${(v.members || []).length}`;
    if (cmd === 'LRANGE') return (v.members || []).map((m, i) => `${i + 1}) "${m}"`).join('\n');
    if (cmd === 'ZRANGE') return (v.members || []).map((m, i) => `${i + 1}) "${m.member}"  ${m.score}`).join('\n');
    if (cmd === 'ZCARD') return `(integer) ${(v.members || []).length}`;
    return JSON.stringify(v);
  }

  window.RAW = {
    NOW, DAY, SLOW_MS,
    KEYS, VALUES, INFO, FEED_SAMPLES, ALLOW, BLOCK,
    scanKeys, inspect, runCommandLocal, globToRegExp,
  };
})();
