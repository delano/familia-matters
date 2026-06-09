/* explorer/Console.jsx — server info panel, live command feed, command console.
 * Exports window.XCONSOLE = { ServerInfo, LiveFeed, CommandConsole }. */
const XC_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Button: XCBtn, Badge: XCBadge, Mono: XCMono, Input: XCInput, Banner: XCBanner, Switch: XCSwitch, StatusDot: XCDot } = XC_DS;
const XCI = window.XICONS;
const XF = window.XBROWSER.fmt;

function cleanNum(s) {
  const raw = String(s == null ? '' : s).replace(/_/g, '');
  if (/^\d+$/.test(raw) && raw.length > 3) return Number(raw).toLocaleString();
  return raw;
}

/* ── Server info ─────────────────────────────────────────────────────────────── */
const INFO_SECTIONS = [
  { id: 'server', label: 'Server', icon: XCI.server },
  { id: 'memory', label: 'Memory', icon: XCI.database },
  { id: 'clients', label: 'Clients', icon: XCI.activity },
  { id: 'stats', label: 'Stats', icon: XCI.bolt },
  { id: 'keyspace', label: 'Keyspace', icon: XCI.key },
];
function ServerInfo({ sections, offline, busy, onRefresh }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--admin-text-subtle)', display: 'flex' }}><XCI.server size={15} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Server info</div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Parsed <code style={{ fontFamily: 'var(--admin-mono)' }}>INFO</code> — simulated, no live connection.</div>
          </div>
          {offline && <SimulatedBadge />}
          <XCBtn variant="secondary" size="sm" iconLeft={<XCI.refresh />} loading={busy} onClick={onRefresh}>Refresh</XCBtn>
        </div>
        {INFO_SECTIONS.map((s) => {
          const data = (sections && sections[s.id]) || {};
          const rows = Object.entries(data);
          return (
            <div key={s.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <span style={{ color: 'var(--admin-text-subtle)', display: 'flex' }}><s.icon size={12} /></span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)' }}>{s.label}</span>
              </div>
              <div style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
                {rows.map(([k, v], i) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, padding: '6px 12px', borderTop: i ? '1px solid var(--admin-border-color)' : 'none', background: 'var(--admin-bg)', alignItems: 'baseline' }}>
                    <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k}</code>
                    <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)', textAlign: 'right', whiteSpace: 'nowrap' }}>{cleanNum(v)}</code>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Live command feed ───────────────────────────────────────────────────────── */
function LiveFeed({ events, running, onToggle, onClear, slowMs }) {
  const scrollRef = React.useRef(null);
  const slowCount = events.filter((e) => e.duration_ms >= slowMs).length;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--admin-border-color)' }}>
        <span style={{ color: running ? 'var(--admin-status-healthy)' : 'var(--admin-text-subtle)', display: 'flex' }}><XCI.activity size={15} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Live command feed</div>
          <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}><code style={{ fontFamily: 'var(--admin-mono)' }}>live.commands</code> · {events.length} events · {slowCount} slow</div>
        </div>
        <XCDot status={running ? 'healthy' : 'caution'} label={running ? 'streaming' : 'paused'} />
        <XCBtn variant="secondary" size="sm" iconLeft={running ? <XCI.lock /> : <XCI.play />} onClick={onToggle}>{running ? 'Pause' : 'Resume'}</XCBtn>
        <XCBtn variant="ghost" size="sm" iconLeft={<XCI.x />} onClick={onClear}>Clear</XCBtn>
      </div>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', fontFamily: 'var(--admin-mono)' }}>
        {events.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--admin-text-subtle)', fontSize: 12 }}>Feed paused — resume to stream simulated traffic.</div>
        ) : events.map((e, i) => {
          const slow = e.duration_ms >= slowMs;
          return (
            <div key={e._id || i} style={{ display: 'grid', gridTemplateColumns: '88px 78px 1fr 64px', gap: 10, padding: '5px 16px', borderBottom: '1px solid var(--admin-border-color)', background: slow ? 'var(--admin-status-caution-bg)' : 'transparent', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{e.clock}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: slow ? 'var(--admin-status-caution)' : 'var(--admin-text)' }}>{e.cmd}</span>
              <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.key}</span>
              <span style={{ fontSize: 11, textAlign: 'right', color: slow ? 'var(--admin-status-caution)' : 'var(--admin-text-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                {slow && <XCI.alert size={10} />}{e.duration_ms.toFixed(1)}ms
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Command console ─────────────────────────────────────────────────────────── */
function CommandConsole({ history, input, setInput, busy, onRun, tierHeld, onToggleTier }) {
  const onKeyDown = (e) => { if (e.key === 'Enter') onRun(false); };
  const scrollRef = React.useRef(null);
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [history.length]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--admin-border-color)', background: 'var(--admin-surface)' }}>
      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--admin-border-color)' }}>
        <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><XCI.terminal size={14} /></span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', whiteSpace: 'nowrap', flex: 'none' }}>Command console</span>
        <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: '0 1 auto', marginRight: 'auto' }}>read-allowlisted · destructive commands blocked</span>
        <label style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 }} title="Elevate to permission:raw_command to force blocked commands">
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tierHeld ? 'var(--admin-accent)' : 'var(--admin-text-subtle)', whiteSpace: 'nowrap' }}>raw_command</span>
          <XCSwitch checked={tierHeld} onChange={onToggleTier} />
        </label>
      </div>

      {history.length > 0 && (
        <div ref={scrollRef} style={{ maxHeight: 188, overflowY: 'auto', padding: '8px 16px', display: 'grid', gap: 8 }}>
          {history.map((h, i) => <ConsoleEntry key={i} entry={h} />)}
        </div>
      )}

      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, display: 'inline-flex', alignItems: 'center', height: 32, background: 'var(--admin-bg)', border: '1px solid var(--admin-border-strong)', borderRadius: 'var(--admin-radius-sm)', paddingLeft: 10 }}>
          <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, color: 'var(--admin-accent)', marginRight: 8 }}>›</span>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown} placeholder="HGETALL customer:cust_8f2a91:object" spellCheck={false}
            style={{ flex: 1, height: '100%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--admin-mono)', fontSize: 13, color: 'var(--admin-text)' }} />
        </div>
        <XCBtn variant="primary" size="lg" iconLeft={<XCI.play />} loading={busy} onClick={() => onRun(false)}>Run</XCBtn>
      </div>
    </div>
  );
}

function ConsoleEntry({ entry }) {
  if (entry.kind === 'blocked') {
    return (
      <div style={{ border: '1px solid var(--admin-status-broken)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--admin-status-broken-bg)' }}>
          <span style={{ color: 'var(--admin-status-broken)', display: 'flex' }}><XCI.slash size={13} /></span>
          <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, fontWeight: 600 }}>{entry.cmd}</code>
          <XCBadge tone="broken" uppercase mono>command_blocked</XCBadge>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--admin-mono)', color: 'var(--admin-text-subtle)' }}>needs {entry.required_tier}</span>
        </div>
        <div style={{ padding: '8px 12px', display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--admin-text)' }}>{entry.reason}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <XCBtn variant="secondary" size="sm" iconLeft={<XCI.lock />} onClick={entry.onForce} disabled={!entry.onForce}>Force as raw_command</XCBtn>
            <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>requires the elevated tier and an explicit confirm</span>
          </div>
        </div>
      </div>
    );
  }
  if (entry.kind === 'noperm') {
    return (
      <div style={{ border: '1px solid var(--admin-status-caution)', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-status-caution-bg)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--admin-status-caution)', display: 'flex' }}><XCI.lock size={13} /></span>
        <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, fontWeight: 600 }}>{entry.cmd}</code>
        <span style={{ fontSize: 12, color: 'var(--admin-text)' }}>Forcing needs <code style={{ fontFamily: 'var(--admin-mono)' }}>{entry.required}</code> — enable raw_command above first.</span>
      </div>
    );
  }
  if (entry.kind === 'unknown') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
        <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text-muted)' }}>› {entry.cmd}</code>
        <span style={{ fontSize: 11, color: 'var(--admin-status-caution)' }}>not on the read allowlist</span>
      </div>
    );
  }
  // result / forced
  const forced = entry.kind === 'forced';
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-accent)' }}>›</code>
        <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)' }}>{entry.cmd}{entry.args && entry.args.length ? ' ' + entry.args.join(' ') : ''}</code>
        {forced && <XCBadge tone="caution" uppercase mono>forced</XCBadge>}
        {entry.simulated && <span style={{ marginLeft: 'auto' }}><SimulatedBadge /></span>}
      </div>
      <pre style={{ margin: 0, padding: '8px 12px', background: 'var(--admin-bg)', border: 'var(--admin-border)', borderRadius: 'var(--admin-radius-sm)', fontFamily: 'var(--admin-mono)', fontSize: 12, color: forced ? 'var(--admin-status-caution)' : 'var(--admin-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>{entry.result}</pre>
    </div>
  );
}

window.XCONSOLE = { ServerInfo, LiveFeed, CommandConsole, cleanNum };
