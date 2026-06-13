/* models/App.jsx — admin shell (Sidebar + Topbar) hosting the model registry:
 * list ⇄ detail. Mirrors the records / integrity shells exactly. The descriptor
 * is fetched from the shared backend (meta); record counts come from the same
 * StateModel (records.list), so a create on the records screen shows up here.
 * Falls back to the seed when the backend is unreachable. */
const MAPP_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Sidebar: MAppSidebar, Topbar: MAppTopbar, Breadcrumb: MAppCrumb, IconButton: MAppIconBtn, Badge: MAppBadge } = MAPP_DS;
const MA = window.RICONS;
const { ToastHost: MAppToastHost } = window.RLIB;

const MA_EMBEDDED = window.parent !== window;
function maNavTo(screen) {
  if (MA_EMBEDDED) { window.parent.postMessage({ type: 'familia-nav', screen }, '*'); }
  else {
    const map = { integrity: 'Integrity Console.html', records: 'Customer Records.html', models: 'Models.html', migrations: 'Migrations.html', explorer: 'Raw Explorer.html' };
    window.location.href = map[screen] || 'Models.html';
  }
}

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

function seedDescriptor() {
  const d = (window.FAMILIA_SEED && window.FAMILIA_SEED.descriptor) || { models: [], familia_version: '2.10.1' };
  return { models: d.models || [], version: d.familia_version || '2.10.1', generatedAt: d.generated_at || null };
}
function seedCounts() {
  const r = (window.FAMILIA_SEED && window.FAMILIA_SEED.records) || {};
  const m = {};
  Object.keys(r).forEach((k) => { if (r[k] && r[k].count_fast != null) m[k] = r[k].count_fast; });
  return m;
}

async function loadDescriptor() {
  try {
    const res = await window.familiaBackend.request({ action: 'meta', tier: 'permission:read' });
    const src = res && (res.descriptor || res);
    const models = src && src.models;
    if (Array.isArray(models) && models.length) {
      return { models, version: src.familia_version || '2.10.1', generatedAt: src.generated_at || null, offline: false };
    }
    throw new Error('bad_meta');
  } catch (e) {
    return { ...seedDescriptor(), offline: true };
  }
}

// Best-effort refresh of the customer record count off the shared StateModel.
async function refreshCustomerCount() {
  try {
    const res = await window.familiaBackend.request({ action: 'records.list', model: 'customer', params: { offset: 0, limit: 1 }, tier: 'permission:read' });
    if (res && res.count_fast != null) return res.count_fast;
  } catch (e) { /* fall through */ }
  return null;
}

function ModelsApp() {
  const [dark, setDark] = React.useState(true);
  const [descriptor, setDescriptor] = React.useState(() => ({ ...seedDescriptor(), offline: false }));
  const [counts, setCounts] = React.useState(() => seedCounts());
  const [offline, setOffline] = React.useState(false);
  const demo = !!(window.familiaBackend && window.familiaBackend.isDemoMode());

  const [refreshing, setRefreshing] = React.useState(false);
  const [selected, setSelected] = React.useState(null); // model key or null

  React.useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); }, [dark]);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    const d = await loadDescriptor();
    setDescriptor(d);
    setOffline(d.offline);
    const cc = await refreshCustomerCount();
    if (cc != null) setCounts((m) => ({ ...m, customer: cc }));
    setRefreshing(false);
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const models = descriptor.models;
  const selectedModel = selected ? models.find((m) => m.model === selected) : null;

  const open = (key) => { setSelected(key); document.querySelector('main')?.scrollTo?.({ top: 0 }); };
  const back = () => setSelected(null);

  const navItems = [
    { id: 'models', type: 'item', label: 'Models', icon: <MA.layers />, badge: models.length || null },
    { id: 'records', type: 'item', label: 'Records', icon: <MA.table />, badge: null },
    { id: 'integrity', type: 'item', label: 'Integrity', icon: <MA.shield />, badge: '9' },
    { type: 'divider' },
    { type: 'group', label: 'System' },
    { id: 'migrations', type: 'item', label: 'Migrations', icon: <MA.layers />, badge: '2' },
    { id: 'raw', type: 'item', label: 'Raw explorer', icon: <MA.terminal />, badge: null },
  ];

  const onNav = (id) => { if (id === 'records') maNavTo('records'); else if (id === 'integrity') maNavTo('integrity'); else if (id === 'migrations') maNavTo('migrations'); else if (id === 'raw') maNavTo('explorer'); else if (id === 'models') back(); };
  const detailNav = (screen) => maNavTo(screen);

  const crumb = selectedModel
    ? [{ label: 'Models', onClick: back }, { label: selectedModel.class, mono: true }]
    : [{ label: 'Models' }];

  return (
    <MAppToastHost>
      <div style={{ display: 'flex', height: '100vh', background: 'var(--admin-bg)', overflow: 'hidden', boxShadow: demo ? 'inset 0 0 0 3px var(--admin-status-preview)' : offline ? 'inset 0 0 0 3px var(--admin-status-caution)' : 'none', transition: 'box-shadow 0.3s ease' }}>
        <MAppSidebar logo={<MWordmark />} items={navItems} activeId="models" onNavigate={onNav} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <MAppTopbar
            breadcrumb={<MAppCrumb items={crumb} />}
            actions={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MAppIconBtn ariaLabel={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark((d) => !d)}>
                  {dark ? <MA.sun /> : <MA.moon />}
                </MAppIconBtn>
                <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)' }}>v{descriptor.version}</span>
                <MAppBadge tone="accent">Familia</MAppBadge>
              </div>
            )}
          />
          <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {selectedModel
              ? <window.ModelDetail model={selectedModel} count={counts[selectedModel.model]} onBack={back} onNav={detailNav} />
              : <window.ModelList models={models} version={descriptor.version} generatedAt={descriptor.generatedAt} counts={counts} offline={offline} onOpen={open} onRefresh={load} refreshing={refreshing} />}
          </main>
        </div>
      </div>
    </MAppToastHost>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ModelsApp />);
