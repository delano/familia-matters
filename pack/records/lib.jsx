/* records/lib.jsx — shared helpers: time formatting, the natural-language query
 * planner, and small UI primitives (Eyebrow, Divider, Toast host). → window.RLIB */
const RL_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Mono: RLMono } = RL_DS;

/* ── Time ─────────────────────────────────────────────────────────────────── */
function fmtTime(ts) {
  if (ts == null) return '—';
  const d = new Date(ts * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
function fmtDate(ts) {
  if (ts == null) return '—';
  return new Date(ts * 1000).toISOString().slice(0, 10);
}
function relTime(ts) {
  const now = window.REC.NOW;
  const s = Math.max(0, now - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/* ── Eyebrow + small bits ───────────────────────────────────────────────── */
function Eyebrow({ children, style }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)', ...style }}>
      {children}
    </span>
  );
}
function DualTime({ ts, size = 'sm' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap' }}>
      <RLMono size={size}>{fmtTime(ts)}</RLMono>
      <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{relTime(ts)}</span>
    </span>
  );
}

/* ── Query planner ──────────────────────────────────────────────────────────
 * Parses a free-text query into a plan describing which access path Familia
 * would take. Indexed fields (email_lookup unique, status_index multi) and the
 * identifier are cheap; everything else is an explicit full SCAN. */
const STATUS_VALUES = ['active', 'inactive', 'pending'];

function planQuery(raw) {
  const q = (raw || '').trim();
  const total = window.REC.COUNT_FAST;
  if (!q) {
    return { kind: 'list', cost: 'cheap', cheap: true, summary: 'Timeline listing — newest first',
      path: 'instances timeline', complexity: 'O(limit)', estimate: total, approx: true,
      predicate: null, run: () => () => true };
  }
  const lower = q.toLowerCase();

  // field:value / field=value / field value
  const m = lower.match(/^\s*([a-z_]+)\s*[:=]?\s*(.+?)\s*$/);
  let field = m && m[1];
  let value = m && m[2];

  // identifier — direct key lookup
  if (/^cust_[0-9a-f]+$/.test(lower) || field === 'custid' || field === 'id') {
    const id = /^cust_/.test(lower) ? lower : value;
    return { kind: 'key', cost: 'cheap', cheap: true, summary: 'Direct key lookup',
      path: `customer:${id}:object`, complexity: 'O(1)', estimate: 1, approx: false,
      predicate: `custid = ${id}`, field: 'custid',
      run: () => (r) => r.custid === id };
  }

  // contains an @ → treat as email lookup (unique index)
  const looksEmail = lower.includes('@') || field === 'email';
  if (looksEmail) {
    const ev = (field === 'email' ? value : lower).trim();
    return { kind: 'index', index: 'email_lookup', cardinality: 'unique', cost: 'cheap', cheap: true,
      summary: 'Resolves through unique index', path: 'Customer.email_lookup', complexity: 'O(1)',
      estimate: 1, approx: false, predicate: `email = ${ev}`, field: 'email',
      run: () => (r) => r.email.toLowerCase() === ev };
  }

  // status (multi index)
  const sv = STATUS_VALUES.find((s) => lower === s || value === s || lower.endsWith(s));
  if (field === 'status' || sv) {
    const val = (field === 'status' ? value : sv) || sv;
    const est = window.REC.RECORDS.filter((r) => r.status === val).length;
    // scale the estimate to the full timeline count to feel production-sized
    const scaled = Math.round(window.REC.COUNT_FAST * (est / window.REC.RECORDS.length));
    return { kind: 'index', index: 'status_index', cardinality: 'multi', cost: 'cheap', cheap: true,
      summary: 'Reads members from multi index', path: 'Customer.status_index', complexity: 'O(members)',
      estimate: scaled, approx: true, predicate: `status = ${val}`, field: 'status',
      run: () => (r) => r.status === val };
  }

  // name — NOT indexed → full scan
  if (field === 'name' || /name|contains/.test(lower)) {
    const needle = (field === 'name' ? value : lower.replace(/^(name|contains)\s*/, '')).trim();
    return { kind: 'scan', cost: 'expensive', cheap: false, summary: 'No index on this field',
      path: 'SCAN customer:*:object', complexity: 'O(N)', estimate: total, approx: true,
      predicate: `name ~ "${needle}"`, field: 'name', missingIndex: 'name',
      run: () => (r) => r.name.toLowerCase().includes(needle) };
  }

  // created_at range — NOT indexed → full scan
  if (field === 'created_at' || /created|after|before|since/.test(lower)) {
    return { kind: 'scan', cost: 'expensive', cheap: false, summary: 'No index on this field',
      path: 'SCAN customer:*:object', complexity: 'O(N)', estimate: total, approx: true,
      predicate: `created_at ⟂ "${q}"`, field: 'created_at', missingIndex: 'created_at',
      run: () => () => true };
  }

  // unknown field → full scan across safe-dump fields
  return { kind: 'scan', cost: 'expensive', cheap: false, summary: 'No matching index — substring scan',
    path: 'SCAN customer:*:object', complexity: 'O(N)', estimate: total, approx: true,
    predicate: `* ~ "${q}"`, field: null, missingIndex: null,
    run: () => (r) => Object.values(r).some((v) => String(v).toLowerCase().includes(lower)) };
}

/* ── Toast host (no Toast in the bundle) ─────────────────────────────────── */
const ToastCtx = React.createContext(() => {});
function useToast() { return React.useContext(ToastCtx); }

function ToastHost({ children }) {
  const [toasts, setToasts] = React.useState([]);
  const push = React.useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { id, tone: 'healthy', ttl: 4200, ...t }]);
    setTimeout(() => setToasts((p) => p.filter((x) => x.id !== id)), (t.ttl || 4200));
  }, []);
  const RI = window.RICONS;
  const toneIcon = { healthy: <RI.check />, preview: <RI.shield />, caution: <RI.alert />, broken: <RI.alert /> };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{ position: 'fixed', bottom: 16, right: 16, display: 'grid', gap: 8, zIndex: 80, width: 360, maxWidth: 'calc(100vw - 32px)' }}>
        {toasts.map((t) => (
          <div key={t.id} role="status" style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
            background: 'var(--admin-surface-raised)', border: '1px solid var(--admin-border-strong)',
            borderLeft: `3px solid var(--admin-status-${t.tone})`, borderRadius: 'var(--admin-radius)',
            boxShadow: 'var(--otto-shadow-lg)',
          }}>
            <span style={{ color: `var(--admin-status-${t.tone})`, display: 'flex', marginTop: 1 }}>{toneIcon[t.tone]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--admin-text)' }}>{t.title}</div>
              {t.detail && <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 2, fontFamily: t.mono ? 'var(--admin-mono)' : 'inherit' }}>{t.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

window.RLIB = { fmtTime, fmtDate, relTime, Eyebrow, DualTime, planQuery, ToastHost, useToast };
