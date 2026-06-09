/* models/ModelList.jsx — the model registry, reflected from the descriptor.
 * "The descriptor IS the frontend's source of truth": every column here is read
 * straight off the reflection contract (meta), never hardcoded. Click a row to
 * open its detail. Exports window.ModelList. */
const ML_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Button: MLBtn, Badge: MLBadge, StatusDot: MLDot, Mono: MLMono, DataTable: MLTable } = ML_DS;
const { Eyebrow: MLEyebrow, fmtTime: MLfmt } = window.RLIB;

function ttlLabel(exp) {
  if (!exp || exp.policy !== 'ttl') return 'none';
  const d = Math.floor(exp.default_seconds / 86400);
  if (d >= 1) return `${d}d`;
  return `${Math.floor(exp.default_seconds / 3600)}h`;
}

function ModelList({ models, version, generatedAt, counts, offline, onOpen, onRefresh, refreshing }) {
  const RI = window.RICONS;

  const columns = [
    { key: 'class', header: 'Model', width: 168, render: (v, r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><RI.layers size={13} /></span>
        <MLMono size="md">{v}</MLMono>
        {r.logical_database != null && <MLBadge tone="neutral" uppercase>db{r.logical_database}</MLBadge>}
      </span>
    ) },
    { key: 'key_pattern', header: 'key_pattern', render: (v) => <MLMono size="sm" muted>{v}</MLMono> },
    { key: 'identifier_field', header: 'identifier', width: 120, render: (v) => <MLMono size="sm">{v}</MLMono> },
    { key: '_fields', header: 'fields', width: 70, align: 'right', render: (v, r) => <MLMono size="sm">{r.fields.length}</MLMono> },
    { key: '_idx', header: 'indexes', width: 78, align: 'right', render: (v, r) => <MLMono size="sm">{r.indexes.length}</MLMono> },
    { key: '_count', header: 'records', width: 110, align: 'right', render: (v, r) => {
      const c = counts[r.model];
      return c == null
        ? <MLMono size="sm" muted>—</MLMono>
        : <MLMono size="sm">{c.toLocaleString()}</MLMono>;
    } },
    { key: '_ttl', header: 'ttl', width: 70, align: 'right', render: (v, r) => <MLMono size="sm" muted>{ttlLabel(r.expiration)}</MLMono> },
    { key: '_a', header: '', width: 90, align: 'right', render: (v, r) => (
      <span style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r.model); }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 8px', background: 'transparent', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', color: 'var(--admin-text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--admin-border-strong)'; e.currentTarget.style.color = 'var(--admin-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--admin-border-color)'; e.currentTarget.style.color = 'var(--admin-text-muted)'; }}
        >Detail <RI.arrowRight size={12} /></button>
      </span>
    ) },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 64px', display: 'grid', gap: 16 }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><RI.layers size={18} /></span>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Models</h1>
              <MLDot status="healthy" label="Reflected" />
              {offline && <window.SimulatedBadge />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
                <MLEyebrow>Registered</MLEyebrow>
                <MLMono size="sm">{models.length}</MLMono>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
                <MLEyebrow>Familia</MLEyebrow>
                <MLMono size="sm">v{version}</MLMono>
              </span>
              {generatedAt && (
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
                  <MLEyebrow>Descriptor</MLEyebrow>
                  <MLMono size="sm" muted>{MLfmt(generatedAt)}</MLMono>
                </span>
              )}
            </div>
          </div>
          <MLBtn variant="secondary" size="md" iconLeft={<RI.refresh />} loading={refreshing} onClick={onRefresh}>Refresh descriptor</MLBtn>
        </div>

        {/* ── Context line ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--admin-surface)', border: 'var(--admin-border)', borderRadius: 'var(--admin-radius-sm)' }}>
          <span style={{ color: 'var(--admin-text-subtle)', display: 'flex' }}><RI.braces size={14} /></span>
          <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
            Every column is read straight off the reflection contract — <MLMono size="sm" muted>meta</MLMono>. The descriptor is the frontend's source of truth.
          </span>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <ModelClickTable columns={columns} rows={models} onOpen={onOpen} />
      </div>
    </div>
  );
}

function ModelClickTable({ columns, rows, onOpen }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const bodyRows = root.querySelectorAll('tbody tr');
    bodyRows.forEach((tr, i) => {
      tr.style.cursor = 'pointer';
      tr.onclick = () => { if (rows[i]) onOpen(rows[i].model); };
      tr.onmouseenter = () => { tr.style.background = 'var(--admin-surface-sunken)'; };
      tr.onmouseleave = () => { tr.style.background = 'transparent'; };
    });
    return () => { bodyRows.forEach((tr) => { tr.onclick = null; tr.onmouseenter = null; tr.onmouseleave = null; }); };
  }, [rows, onOpen]);
  return <div ref={ref}><MLTable columns={columns} rows={rows} rowKey={(r) => r.model} /></div>;
}

window.ModelList = ModelList;
