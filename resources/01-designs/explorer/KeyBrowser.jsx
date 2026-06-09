/* explorer/KeyBrowser.jsx — left key-search pane + right typed inspector.
 * Exports window.XBROWSER = { KeySearch, Inspector, typeMeta, fmt }. */
const XB_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Button: XBBtn, Badge: XBBadge, Mono: XBMono, Input: XBInput, Select: XBSelect, Banner: XBBanner, StatusDot: XBDot, IconButton: XBIconBtn } = XB_DS;
const XBI = window.XICONS;

/* ── formatting ─────────────────────────────────────────────────────────────── */
const fmt = {
  ttl(s) {
    if (s == null || s < 0) return { text: 'no expiry', raw: '-1', expires: false };
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    let text = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
    return { text, raw: String(s), expires: true };
  },
  bytes(b) {
    if (b == null) return '—';
    if (b < 1024) return `${b} B`;
    return `${(b / 1024).toFixed(1)} KB`;
  },
  time(ts) {
    return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  },
};

/* ── per-type icon + tone ────────────────────────────────────────────────────── */
const typeMeta = {
  hash:    { icon: XBI.braces,    label: 'hash',    tone: 'info' },
  list:    { icon: XBI.list,      label: 'list',    tone: 'neutral' },
  set:     { icon: XBI.layersSet, label: 'set',     tone: 'neutral' },
  zset:    { icon: XBI.sigma,     label: 'zset',    tone: 'accent' },
  string:  { icon: XBI.type,      label: 'string',  tone: 'neutral' },
  counter: { icon: XBI.hash,      label: 'counter', tone: 'info' },
};
function TypeChip({ type }) {
  const m = typeMeta[type] || typeMeta.string;
  const color = m.tone === 'accent' ? 'var(--admin-accent)' : m.tone === 'info' ? 'var(--admin-status-preview)' : 'var(--admin-text-muted)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 18, padding: '0 6px', borderRadius: 'var(--admin-radius-sm)', border: '1px solid var(--admin-border-color)', background: 'var(--admin-surface-sunken)', color, fontFamily: 'var(--admin-mono)', fontSize: 10, fontWeight: 600 }}>
      <span style={{ display: 'flex' }}><m.icon size={11} /></span>{m.label}
    </span>
  );
}

/* ── Left pane: key search ───────────────────────────────────────────────────── */
function KeySearch({ pattern, setPattern, typeFilter, setTypeFilter, keys, cursor, scanned, matched, busy, offline, selectedKey, onScan, onMore, onSelect }) {
  const onKeyDown = (e) => { if (e.key === 'Enter') onScan(); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', borderRight: '1px solid var(--admin-border-color)' }}>
      <div style={{ padding: '12px 12px 10px', display: 'grid', gap: 8, borderBottom: '1px solid var(--admin-border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--admin-text-subtle)', display: 'flex' }}><XBI.search size={13} /></span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', whiteSpace: 'nowrap' }}>Key search</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--admin-mono)', fontSize: 10, color: 'var(--admin-text-subtle)', whiteSpace: 'nowrap' }}>SCAN</span>
        </div>
        <XBInput mono prefix="MATCH" value={pattern} onChange={(e) => setPattern(e.target.value)} onKeyDown={onKeyDown} placeholder="customer:*:object" style={{ width: '100%' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <XBSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} options={[{ value: 'all', label: 'all types' }, { value: 'hash' }, { value: 'list' }, { value: 'set' }, { value: 'zset' }, { value: 'string' }, { value: 'counter' }]} />
          <XBBtn variant="primary" size="md" iconLeft={<XBI.search />} loading={busy} onClick={onScan} style={{ marginLeft: 'auto' }}>Scan</XBBtn>
        </div>
      </div>

      <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--admin-border-color)', minHeight: 30 }}>
        {(keys.length > 0 || matched != null) ? (
          <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)' }}>
            matched <span style={{ color: 'var(--admin-text)' }}>{matched != null ? matched : keys.length}</span>{scanned != null ? ` · scanned ${scanned}` : ''}
          </span>
        ) : <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>Run a scan to list keys.</span>}
        {offline && <span style={{ marginLeft: 'auto' }}><SimulatedBadge /></span>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {keys.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--admin-text-subtle)', fontSize: 12 }}>
            {busy ? 'Scanning…' : (matched != null || scanned != null) ? <React.Fragment>No keys matched. Try <code style={{ fontFamily: 'var(--admin-mono)' }}>customer:*</code></React.Fragment> : <React.Fragment>Run a scan to begin. Try <code style={{ fontFamily: 'var(--admin-mono)' }}>customer:*</code></React.Fragment>}
          </div>
        ) : keys.map((k) => {
          const active = k.key === selectedKey;
          const ttl = fmt.ttl(k.ttl);
          return (
            <button key={k.key} type="button" onClick={() => onSelect(k.key)}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--admin-border-color)', borderLeft: active ? '2px solid var(--admin-accent)' : '2px solid transparent', background: active ? 'var(--admin-selection-bg)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 90ms ease' }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--admin-surface-sunken)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
              <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{k.key}</code>
              <span style={{ gridRow: '1 / 3', alignSelf: 'center' }}><TypeChip type={k.type} /></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--admin-text-subtle)', fontFamily: 'var(--admin-mono)' }}>
                <span>db{k.db}</span>
                <span style={{ color: ttl.expires ? 'var(--admin-text-muted)' : 'var(--admin-text-subtle)' }}>{ttl.expires ? `ttl ${ttl.text}` : 'persistent'}</span>
              </span>
            </button>
          );
        })}
      </div>

      {cursor ? (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--admin-border-color)' }}>
          <XBBtn variant="secondary" size="sm" iconLeft={<XBI.chevron open />} loading={busy} onClick={onMore} style={{ width: '100%', justifyContent: 'center' }}>Load more · cursor {cursor}</XBBtn>
        </div>
      ) : null}
    </div>
  );
}

/* ── Right pane: typed inspector ─────────────────────────────────────────────── */
function Inspector({ data, busy, onOpenModel, onClose }) {
  if (busy && !data) return <Centered>Loading key…</Centered>;
  if (!data) return (
    <Centered>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
        <span style={{ color: 'var(--admin-text-subtle)' }}><XBI.key size={22} /></span>
        <div style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Select a key to inspect it.</div>
        <div style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>TYPE · TTL · MEMORY and a typed value viewer.</div>
      </div>
    </Centered>
  );
  if (data.error === 'no_such_key') return (
    <div style={{ padding: 16 }}><XBBanner tone="broken" title="No such key">The key <code style={{ fontFamily: 'var(--admin-mono)' }}>{data.key}</code> does not exist or has expired.</XBBanner></div>
  );

  const ttl = fmt.ttl(data.ttl);
  const m = typeMeta[data.type] || typeMeta.string;
  const modelLabel = data.model ? (data.model === 'api_key' ? 'ApiKey' : data.model.charAt(0).toUpperCase() + data.model.slice(1)) : null;

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ color: m.tone === 'accent' ? 'var(--admin-accent)' : 'var(--admin-status-preview)', display: 'flex', marginTop: 2 }}><m.icon size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 14, fontWeight: 600, color: 'var(--admin-text)', wordBreak: 'break-all' }}>{data.key}</code>
          </div>
          <TypeChip type={data.type} />
        </div>

        {/* TYPE / TTL / MEMORY */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--admin-border-color)', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
          <StatCell label="Type" value={m.label} />
          <StatCell label="TTL" value={ttl.expires ? ttl.text : 'persistent'} sub={ttl.raw} tone={ttl.expires ? 'caution' : null} />
          <StatCell label="Memory" value={fmt.bytes(data.memory)} />
          <StatCell label="Database" value={`db${data.db}`} />
        </div>

        {/* model bridge banner */}
        {modelLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(232,121,249,0.10)', border: '1px solid rgba(232,121,249,0.30)', borderRadius: 'var(--admin-radius-sm)' }}>
            <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><XBI.layers size={14} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--admin-text)' }}>This key is a <strong>{modelLabel}</strong> record — <code style={{ fontFamily: 'var(--admin-mono)' }}>{data.id}</code>.</div>
              <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 1 }}>The raw hash is the same object the model-aware detail renders with its schema.</div>
            </div>
            <XBBtn variant="secondary" size="sm" iconRight={<XBI.external />} onClick={() => onOpenModel(data.model, data.id)}>Open {modelLabel}</XBBtn>
          </div>
        )}

        {/* typed viewer */}
        <ValueViewer data={data} />
      </div>
    </div>
  );
}

function StatCell({ label, value, sub, tone }) {
  return (
    <div style={{ background: 'var(--admin-bg)', padding: '8px 12px', display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, fontWeight: 600, color: tone ? `var(--admin-status-${tone})` : 'var(--admin-text)' }}>{value}</span>
      {sub && <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 10, color: 'var(--admin-text-subtle)' }}>{sub}</span>}
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: 'var(--admin-text-muted)', fontSize: 13 }}>{children}</div>;
}

/* ── typed value viewers ─────────────────────────────────────────────────────── */
function ValueViewer({ data }) {
  const v = data.value || { type: data.type };
  const t = v.type || data.type;
  const ViewerHeader = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', marginBottom: 8 }}>{children}</div>
  );
  if (t === 'counter' || (t === 'string' && v.value != null && (v.members == null && v.entries == null))) {
    return (
      <div>
        <ViewerHeader>{t === 'counter' ? 'Counter' : 'String'} value</ViewerHeader>
        <div style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)', padding: '16px', display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 28, fontWeight: 700, color: 'var(--admin-text)' }}>{v.value != null ? Number(v.value).toLocaleString() : '—'}</span>
          {t === 'counter' && <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>monotonic counter · INCR/DECR</span>}
        </div>
      </div>
    );
  }
  if (t === 'hash') return <HashView entries={v.entries || {}} isRecord={!!data.model} />;
  if (t === 'list') return <ListView members={v.members || []} />;
  if (t === 'set') return <SetView members={v.members || []} />;
  if (t === 'zset') return <ZSetView members={v.members || []} />;
  return <div style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>No value preview for this type.</div>;
}

function HashView({ entries, isRecord }) {
  const rows = Object.entries(entries);
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', marginBottom: 8 }}>Hash · {rows.length} field{rows.length === 1 ? '' : 's'}</div>
      <div style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
        {rows.map(([k, val], i) => {
          const concealed = val === '[CONCEALED]';
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '7px 12px', borderTop: i ? '1px solid var(--admin-border-color)' : 'none', background: 'var(--admin-bg)' }}>
              <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text-muted)' }}>{k}</code>
              <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: concealed ? 'var(--admin-field-encrypted)' : 'var(--admin-text)', wordBreak: 'break-all' }}>{val}</code>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ members }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', marginBottom: 8 }}>List · {members.length} element{members.length === 1 ? '' : 's'} · head → tail</div>
      <div style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
        {members.map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 10, padding: '7px 12px', borderTop: i ? '1px solid var(--admin-border-color)' : 'none', background: 'var(--admin-bg)' }}>
            <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-subtle)', textAlign: 'right' }}>{i}</span>
            <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)', wordBreak: 'break-all' }}>{m}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetView({ members }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', marginBottom: 8 }}>Set · {members.length} member{members.length === 1 ? '' : 's'} · unordered</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {members.map((m, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 9999, border: '1px solid var(--admin-border-strong)', background: 'var(--admin-surface-sunken)', fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)' }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

function ZSetView({ members }) {
  const [timeView, setTimeView] = React.useState(true);
  const looksTime = members.length && members.every((m) => m.score > 1_000_000_000 && m.score < 4_000_000_000);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)' }}>Sorted set · {members.length} member{members.length === 1 ? '' : 's'} · by score</span>
        {looksTime && (
          <button type="button" onClick={() => setTimeView((t) => !t)} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 9999, border: '1px solid var(--admin-border-strong)', background: timeView ? 'var(--admin-status-preview-bg)' : 'transparent', color: timeView ? 'var(--admin-status-preview)' : 'var(--admin-text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 600 }}>
            <XBI.clock size={11} /> score as time
          </button>
        )}
      </div>
      <div style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
        {members.map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '7px 12px', borderTop: i ? '1px solid var(--admin-border-color)' : 'none', background: 'var(--admin-bg)', alignItems: 'center' }}>
            <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)', wordBreak: 'break-all' }}>{m.member}</code>
            <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: looksTime && timeView ? 'var(--admin-status-preview)' : 'var(--admin-text-muted)', whiteSpace: 'nowrap' }}>
              {looksTime && timeView ? fmt.time(m.score) : Number(m.score).toLocaleString()}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

window.XBROWSER = { KeySearch, Inspector, TypeChip, typeMeta, fmt };
