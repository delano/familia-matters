/* migrations/App.jsx — admin shell (Sidebar + Topbar) with the review state
 * switcher, mounts the Migration cockpit. Mirrors the Integrity console shell. */
const MAPP_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Sidebar: MAppSidebar, Topbar: MAppTopbar, Breadcrumb: MAppCrumb, IconButton: MAppIconBtn, Badge: MAppBadge } = MAPP_DS;
const MA = window.MICONS;

const MAPP_EMBEDDED = window.parent !== window;
function mappNavTo(screen) {
  if (MAPP_EMBEDDED) { window.parent.postMessage({ type: 'familia-nav', screen }, '*'); }
  else {
    const map = { integrity: 'Integrity Console.html', models: 'Models.html', records: 'Customer Records.html', explorer: 'Raw Explorer.html', migrations: 'Migrations.html' };
    window.location.href = map[screen] || 'Migrations.html';
  }
}

const MSTATES = [
  { id: 'status', label: 'Status' },
  { id: 'dryrun', label: 'Dry-run' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'running', label: 'Running' },
  { id: 'done', label: 'Applied' },
  { id: 'rollback', label: 'Rollback' },
  { id: 'partial', label: 'Partial fail' },
  { id: 'noperm', label: 'No-perm' },
];

function MWordmark() {
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

function MStateSwitcher({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>Preview</span>
      <div style={{ display: 'flex', background: 'var(--admin-surface-sunken)', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', padding: 2, gap: 2 }}>
        {MSTATES.map((s) => {
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

function MigrationsApp() {
  const [dark, setDark] = React.useState(true);
  const [cockpitState, setCockpitState] = React.useState('status');

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const navItems = [
    { id: 'models', type: 'item', label: 'Models', icon: <MA.layers />, badge: 3 },
    { id: 'records', type: 'item', label: 'Records', icon: <MA.table />, badge: null },
    { id: 'integrity', type: 'item', label: 'Integrity', icon: <MA.shield />, badge: '9' },
    { type: 'divider' },
    { type: 'group', label: 'System' },
    { id: 'migrations', type: 'item', label: 'Migrations', icon: <MA.layers />, badge: '2' },
    { id: 'raw', type: 'item', label: 'Raw explorer', icon: <MA.terminal />, badge: null },
  ];

  const onNav = (id) => {
    if (id === 'migrations') return;
    if (id === 'raw') mappNavTo('explorer');
    else mappNavTo(id);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--admin-bg)', overflow: 'hidden' }}>
      <MAppSidebar logo={<MWordmark />} items={navItems} activeId="migrations" onNavigate={onNav} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <MAppTopbar
          breadcrumb={<MAppCrumb items={[{ label: 'System', onClick: () => {} }, { label: 'Migrations' }]} />}
          center={<MStateSwitcher value={cockpitState} onChange={setCockpitState} />}
          actions={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MAppIconBtn ariaLabel={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark((d) => !d)}>
                {dark ? <MA.sun /> : <MA.moon />}
              </MAppIconBtn>
              <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)' }}>v2.10.1</span>
              <MAppBadge tone="accent">Familia</MAppBadge>
            </div>
          )}
        />
        <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <window.MigrationCockpit state={cockpitState} setState={setCockpitState} />
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<MigrationsApp />);
