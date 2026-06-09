/* explorer/App.jsx — admin shell (Sidebar + Topbar) with the review state
 * switcher, mounts the Raw explorer. Mirrors the other screen shells. */
const XAPP_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Sidebar: XAppSidebar, Topbar: XAppTopbar, Breadcrumb: XAppCrumb, IconButton: XAppIconBtn, Badge: XAppBadge } = XAPP_DS;
const XA = window.XICONS;

const XAPP_EMBEDDED = window.parent !== window;
function xappNavTo(screen) {
  if (XAPP_EMBEDDED) { window.parent.postMessage({ type: 'familia-nav', screen }, '*'); }
  else {
    const map = { integrity: 'Integrity Console.html', models: 'Models.html', records: 'Customer Records.html', migrations: 'Migrations.html', explorer: 'Raw Explorer.html' };
    window.location.href = map[screen] || 'Raw Explorer.html';
  }
}

const XSTATES = [
  { id: 'idle', label: 'Idle' },
  { id: 'results', label: 'Results' },
  { id: 'selected', label: 'Selected' },
  { id: 'info', label: 'Server info' },
  { id: 'feed', label: 'Live feed' },
  { id: 'command', label: 'Command' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'noperm', label: 'No-perm' },
];

function XWordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: 'var(--admin-text)' }}>
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
        <path d="M6 4L4 4L4 28L6 28" /><path d="M26 4L28 4L28 28L26 28" />
        <path d="M10 9L10 23" /><path d="M22 9L22 23" />
        <circle cx="16" cy="16" r="2.25" fill="var(--otto-primary)" stroke="none" />
      </svg>
      familia<span style={{ color: 'var(--admin-accent)' }}>/</span>admin
    </div>
  );
}

function XStateSwitcher({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>Preview</span>
      <div style={{ display: 'flex', background: 'var(--admin-surface-sunken)', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', padding: 2, gap: 2 }}>
        {XSTATES.map((s) => {
          const active = s.id === value;
          return (
            <button
              key={s.id} type="button" onClick={() => onChange(s.id)} aria-pressed={active}
              style={{
                height: 24, padding: '0 10px', border: 'none', borderRadius: 4, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 11, fontWeight: active ? 600 : 400,
                background: active ? 'var(--admin-accent)' : 'transparent',
                color: active ? 'var(--admin-accent-on)' : 'var(--admin-text-muted)',
                transition: 'color 90ms ease', whiteSpace: 'nowrap',
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RawExplorerApp() {
  const [dark, setDark] = React.useState(true);
  const [screenState, setScreenState] = React.useState('idle');
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const navItems = [
    { id: 'models', type: 'item', label: 'Models', icon: <XA.layers />, badge: 3 },
    { id: 'records', type: 'item', label: 'Records', icon: <XA.table />, badge: null },
    { id: 'integrity', type: 'item', label: 'Integrity', icon: <XA.shield />, badge: '9' },
    { type: 'divider' },
    { type: 'group', label: 'System' },
    { id: 'migrations', type: 'item', label: 'Migrations', icon: <XA.layers />, badge: '2' },
    { id: 'raw', type: 'item', label: 'Raw explorer', icon: <XA.terminal />, badge: null },
  ];

  const onNav = (id) => {
    if (id === 'raw') return;
    if (id === 'migrations') xappNavTo('migrations');
    else xappNavTo(id);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--admin-bg)', overflow: 'hidden', boxShadow: offline ? 'inset 0 0 0 3px var(--admin-status-caution)' : 'none', transition: 'box-shadow 0.3s ease' }}>
      <XAppSidebar logo={<XWordmark />} items={navItems} activeId="raw" onNavigate={onNav} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <XAppTopbar
          breadcrumb={<XAppCrumb items={[{ label: 'System', onClick: () => {} }, { label: 'Raw explorer' }]} />}
          center={<XStateSwitcher value={screenState} onChange={setScreenState} />}
          actions={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <XAppIconBtn ariaLabel={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark((d) => !d)}>
                {dark ? <XA.sun /> : <XA.moon />}
              </XAppIconBtn>
              <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)' }}>v2.10.1</span>
              <XAppBadge tone="accent">Familia</XAppBadge>
            </div>
          )}
        />
        <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <window.RawExplorer state={screenState} setState={setScreenState} offline={offline} onOfflineChange={setOffline} />
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<RawExplorerApp />);
