/* sections.jsx — the collapsible issue sections + their dense table bodies,
 * plus the dry-run plan list and the repaired summary. Exports to window. */
const DS = window.FamiliaAdminDesignSystem_a9098d;
const { DataTable, StatusDot, Badge, Mono, CountPair, Banner, Button } = DS;
const SX_ICONS = window.ICONS;

/* ── Severity dot cell (paired with text elsewhere in the row) ─────────────── */
function SevDot({ sev }) {
  return <span style={{ width: 8, height: 8, borderRadius: 9999, background: `var(--admin-status-${sev})`, display: 'inline-block' }} />;
}

/* ── A collapsible audit-component card ────────────────────────────────────── */
function IssueSection({ id, icon, title, subtitle, count, sev, open, onToggle, locked, dim, children, registerRef, cleanLabel }) {
  const clean = count === 0;
  const cleanText = cleanLabel || 'Clean';
  return (
    <section
      ref={registerRef ? (el) => registerRef(id, el) : undefined}
      data-section={id}
      style={{
        border: 'var(--admin-border)',
        borderRadius: 'var(--admin-radius)',
        background: 'var(--admin-surface)',
        overflow: 'hidden',
        opacity: dim ? 0.55 : 1,
        transition: 'opacity 160ms ease',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          height: 40, padding: '0 12px', border: 'none', background: 'transparent',
          color: 'var(--admin-text)', cursor: 'pointer', textAlign: 'left',
          fontFamily: 'inherit', borderBottom: open ? '1px solid var(--admin-border-color)' : 'none',
        }}
      >
        <span style={{ color: 'var(--admin-text-subtle)', display: 'flex', width: 12, flex: 'none' }}>
          <SX_ICONS.chevron open={open} />
        </span>
        <span style={{ color: clean ? 'var(--admin-text-subtle)' : `var(--admin-status-${sev})`, display: 'flex', width: 14, flex: 'none' }}>
          {icon}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
        {subtitle && <Mono size="sm" muted>{subtitle}</Mono>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {clean
            ? <StatusDot status="healthy" label={cleanText} />
            : <Badge tone={sev}>{count} {count === 1 ? 'issue' : 'issues'}</Badge>}
        </span>
      </button>
      {open && (
        <div style={{ padding: 12, pointerEvents: locked ? 'none' : 'auto' }}>
          {clean
            ? <div style={{ padding: '10px 4px', fontSize: 12, color: 'var(--admin-text-muted)' }}>{cleanText === 'Fixed' ? 'Repaired — no remaining issues in this component.' : 'No issues found.'}</div>
            : children}
        </div>
      )}
    </section>
  );
}

/* ── 1. Instances: count-mismatch callout + phantom/missing table ──────────── */
function InstancesBody({ instances }) {
  const rows = [
    ...instances.phantoms.map((id) => ({ k: id, kind: 'phantom', sev: 'broken', detail: 'Key exists in timeline, no object on SCAN' })),
    ...instances.missing.map((id) => ({ k: id, kind: 'missing', sev: 'broken', detail: 'Object present, absent from instances index' })),
  ];
  const mismatch = instances.count_timeline !== instances.count_scan;
  const cols = [
    { key: 'sev', header: '', width: 24, render: (v, r) => <SevDot sev={r.sev} /> },
    { key: 'kind', header: 'Kind', width: 110, mono: true },
    { key: 'k', header: 'Identifier', width: 200, render: (v) => <Mono size="sm">{v}</Mono> },
    { key: 'detail', header: 'Detail', render: (v) => <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>{v}</span> },
  ];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {mismatch && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
          background: 'var(--admin-status-broken-bg)', border: '1px solid var(--admin-status-broken)40',
          borderLeft: '3px solid var(--admin-status-broken)', borderRadius: 'var(--admin-radius-sm)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-status-broken)' }}>Count mismatch</span>
          <CountPair fast={instances.count_timeline} exact={instances.count_scan} />
          <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
            timeline fast-count is inflated by {instances.count_timeline - instances.count_scan} phantom{instances.count_timeline - instances.count_scan === 1 ? '' : 's'}.
          </span>
        </div>
      )}
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.k} />
    </div>
  );
}

/* ── 2. Unique indexes: stale + missing per index ─────────────────────────── */
function UniqueIndexBody({ indexes }) {
  const rows = (indexes || []).flatMap((ix) => [
    ...ix.stale.map((v) => ({ k: `s:${v}`, index_name: ix.index_name, kind: 'stale', sev: 'caution', value: v, detail: 'Entry resolves to a removed identifier' })),
    ...(ix.missing || []).map((v) => ({ k: `m:${v}`, index_name: ix.index_name, kind: 'missing', sev: 'broken', value: v, detail: 'Live field value has no index entry' })),
  ]);
  const cols = [
    { key: 'sev', header: '', width: 24, render: (v, r) => <SevDot sev={r.sev} /> },
    { key: 'index_name', header: 'Index', width: 140, render: (v) => <Mono size="sm">{v}</Mono> },
    { key: 'kind', header: 'State', width: 90, render: (v, r) => <Badge tone={r.sev} uppercase>{v}</Badge> },
    { key: 'value', header: 'Field value', width: 200, render: (v) => <Mono size="sm">{v}</Mono> },
    { key: 'detail', header: 'Detail', render: (v) => <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>{v}</span> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(r) => r.k} />;
}

/* ── 3. Multi indexes: stale members + orphaned keys ──────────────────────── */
function MultiIndexBody({ indexes }) {
  const rows = (indexes || []).flatMap((ix) => [
    ...ix.stale_members.map((m) => ({ k: `sm:${m}`, index_name: ix.index_name, kind: 'stale member', sev: 'caution', value: m, detail: 'Member points to a missing record' })),
    ...(ix.orphaned_keys || []).map((key) => ({ k: `ok:${key}`, index_name: ix.index_name, kind: 'orphaned key', sev: 'broken', value: key, detail: 'Index key with no live definition' })),
  ]);
  const cols = [
    { key: 'sev', header: '', width: 24, render: (v, r) => <SevDot sev={r.sev} /> },
    { key: 'index_name', header: 'Index', width: 140, render: (v) => <Mono size="sm">{v}</Mono> },
    { key: 'kind', header: 'Kind', width: 120, render: (v, r) => <Badge tone={r.sev} uppercase>{v}</Badge> },
    { key: 'value', header: 'Key / member', render: (v) => <Mono size="sm">{v}</Mono> },
    { key: 'detail', header: 'Detail', width: 240, render: (v) => <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>{v}</span> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(r) => r.k} />;
}

/* ── 4. Participations: stale member with reason ──────────────────────────── */
function ParticipationsBody({ participations }) {
  const rows = (participations || []).flatMap((p) =>
    p.stale_members.map((m) => ({ k: `p:${m.identifier}`, collection: p.collection_name, identifier: m.identifier, collection_key: m.collection_key, reason: m.reason, sev: 'caution' }))
  );
  const cols = [
    { key: 'sev', header: '', width: 24, render: (v, r) => <SevDot sev={r.sev} /> },
    { key: 'collection', header: 'Collection', width: 110, render: (v) => <Mono size="sm">{v}</Mono> },
    { key: 'identifier', header: 'Member', width: 130, render: (v) => <Mono size="sm">{v}</Mono> },
    { key: 'collection_key', header: 'Collection key', render: (v) => <Mono size="sm" muted>{v}</Mono> },
    { key: 'reason', header: 'Reason', width: 150, render: (v) => <Badge tone="caution" uppercase>{v.replace(/_/g, ' ')}</Badge> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(r) => r.k} />;
}

/* ── 5. Cross-references: missing-index list + wrong-target side-by-side ───── */
function CrossRefBody({ cross }) {
  const missingRows = (cross.in_instances_missing_unique_index || []).map((id) => ({
    k: id, identifier: id, sev: 'broken', detail: 'In instances index but absent from its unique index',
  }));
  const missingCols = [
    { key: 'sev', header: '', width: 24, render: (v, r) => <SevDot sev={r.sev} /> },
    { key: 'identifier', header: 'Identifier', width: 200, render: (v) => <Mono size="sm">{v}</Mono> },
    { key: 'detail', header: 'Detail', render: (v) => <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>{v}</span> },
  ];
  const wrong = cross.index_points_to_wrong_identifier || [];
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', marginBottom: 6 }}>In instances, missing unique index</div>
        <DataTable columns={missingCols} rows={missingRows} rowKey={(r) => r.k} />
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', marginBottom: 6 }}>Index points to wrong identifier</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {wrong.map((w, i) => (
            <div key={i} style={{
              border: 'var(--admin-border)', borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-bg)',
              padding: '10px 12px', display: 'grid', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <SevDot sev="broken" />
                <Mono size="sm">{w.index}</Mono>
                <span style={{ fontSize: 12, color: 'var(--admin-text-subtle)' }}>·</span>
                <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>field value</span>
                <Mono size="sm">{w.field_value}</Mono>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', gap: 0, alignItems: 'stretch', border: 'var(--admin-border)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
                <PointerCell label="Points to" value={w.points_to} tone="broken" struck />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--admin-text-subtle)', borderLeft: '1px solid var(--admin-border-color)', borderRight: '1px solid var(--admin-border-color)', background: 'var(--admin-surface-sunken)' }}>
                  <SX_ICONS.arrowRight size={13} />
                </div>
                <PointerCell label="Actual" value={w.actual} tone="healthy" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PointerCell({ label, value, tone, struck }) {
  return (
    <div style={{ padding: '8px 12px', background: `var(--admin-status-${tone}-bg)` }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: `var(--admin-status-${tone})`, marginBottom: 3 }}>{label}</div>
      <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, color: 'var(--admin-text)', textDecoration: struck ? 'line-through' : 'none', textDecorationColor: 'var(--admin-status-broken)', opacity: struck ? 0.8 : 1 }}>{value}</code>
    </div>
  );
}

/* ── Dry-run plan list (per-section, info-toned) ──────────────────────────── */
function PlanList({ items }) {
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '14px 64px 1fr', columnGap: 8, alignItems: 'start', lineHeight: 1.5 }}>
          <span style={{ width: 6, height: 6, borderRadius: 9999, background: `var(--admin-status-${it.tone})`, flex: 'none', marginTop: 6 }} />
          <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, fontWeight: 600, color: 'var(--admin-status-preview)', marginTop: 1 }}>{it.op}</span>
          <span style={{ fontSize: 12, color: 'var(--admin-text)' }}>
            {it.n} {it.what}
            <span style={{ color: 'var(--admin-text-subtle)' }}>{'  —  '}</span>
            <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)' }}>{it.detail}</code>
          </span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  IssueSection, InstancesBody, UniqueIndexBody, MultiIndexBody,
  ParticipationsBody, CrossRefBody, PlanList, SevDot,
});
