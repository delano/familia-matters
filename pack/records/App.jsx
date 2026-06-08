/* records/App.jsx — admin shell (Sidebar + Topbar) hosting the Customer record
 * screens: list ⇄ detail. Mirrors the Integrity Console shell exactly. */
const RAPP_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Sidebar: RAppSidebar, Topbar: RAppTopbar, Breadcrumb: RAppCrumb, IconButton: RAppIconBtn, Badge: RAppBadge } = RAPP_DS;
const RA = window.RICONS;
const { ToastHost } = window.RLIB;

/* When embedded in the Familia Admin shell, cross-screen nav is an instant
 * postMessage (no document reload / no Babel re-transpile). Opened standalone,
 * fall back to a normal page navigation so the file still works on its own. */
const RA_EMBEDDED = window.parent !== window;
function raNavTo(screen) {
  if (RA_EMBEDDED) { window.parent.postMessage({ type: 'familia-nav', screen }, '*'); }
  else {
    const map = { integrity: 'Integrity Console.html', models: 'Models.html', records: 'Customer Records.html', migrations: 'Migrations.html', explorer: 'Raw Explorer.html' };
    window.location.href = map[screen] || 'Customer Records.html';
  }
}

function RWordmark() {
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

function RecordsApp() {
  const [dark, setDark] = React.useState(true);
  const [view, setView] = React.useState({ name: 'list' }); // {name:'list'} | {name:'detail', custid, intent}

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const open = (custid, intent) => {
    if (custid === '__integrity__') { raNavTo('integrity'); return; }
    if (custid === '__models__') { raNavTo('models'); return; }
    setView({ name: 'detail', custid, intent });
    document.querySelector('main')?.scrollTo?.({ top: 0 });
  };
  const back = () => setView({ name: 'list' });

  const navItems = [
    { id: 'models', type: 'item', label: 'Models', icon: <RA.layers />, badge: 3 },
    { id: 'records', type: 'item', label: 'Records', icon: <RA.table />, badge: null },
    { id: 'integrity', type: 'item', label: 'Integrity', icon: <RA.shield />, badge: '9' },
    { type: 'divider' },
    { type: 'group', label: 'System' },
    { id: 'migrations', type: 'item', label: 'Migrations', icon: <RA.layers />, badge: '2' },
    { id: 'raw', type: 'item', label: 'Raw explorer', icon: <RA.terminal />, badge: null },
  ];

  const onNav = (id) => { if (id === 'integrity') raNavTo('integrity'); else if (id === 'models') raNavTo('models'); else if (id === 'migrations') raNavTo('migrations'); else if (id === 'raw') raNavTo('explorer'); else if (id === 'records') back(); };

  const crumb = view.name === 'detail'
    ? [{ label: 'Customer', onClick: () => {} }, { label: 'Records', onClick: back }, { label: view.custid, mono: true }]
    : [{ label: 'Customer', onClick: () => {} }, { label: 'Records' }];

  return (
    <ToastHost>
      <div style={{ display: 'flex', height: '100vh', background: 'var(--admin-bg)', overflow: 'hidden' }}>
        <RAppSidebar logo={<RWordmark />} items={navItems} activeId="records" onNavigate={onNav} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <RAppTopbar
            breadcrumb={<RAppCrumb items={crumb} />}
            actions={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RAppIconBtn ariaLabel={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark((d) => !d)}>
                  {dark ? <RA.sun /> : <RA.moon />}
                </RAppIconBtn>
                <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)' }}>v2.10.1</span>
                <RAppBadge tone="accent">Familia</RAppBadge>
              </div>
            )}
          />
          <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {view.name === 'list'
              ? <window.RecordList onOpen={open} />
              : <window.RecordDetail custid={view.custid} intent={view.intent} onBack={back} />}
          </main>
        </div>
      </div>
    </ToastHost>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<RecordsApp />);
