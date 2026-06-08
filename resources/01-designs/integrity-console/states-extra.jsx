/* states-extra.jsx — the three trust-earning states the spec flags as
 * usually-missed: partial-stage failure (9), cross-database refused (11),
 * insufficient permission (12). Exports panels to window. */
const XDS = window.FamiliaAdminDesignSystem_a9098d;
const { Button: XBtn, Badge: XBadge, Mono: XMono, Banner: XBanner, StatusDot: XDot } = XDS;
const XI = window.ICONS;

/* A bordered, status-tinted panel shell shared by these states. */
function PanelShell({ tone, icon, title, subtitle, badge, children, footer }) {
  return (
    <div style={{ border: `1px solid var(--admin-status-${tone})`, borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: `var(--admin-status-${tone}-bg)`, borderBottom: `1px solid color-mix(in srgb, var(--admin-status-${tone}) 40%, transparent)` }}>
        {icon && <span style={{ color: `var(--admin-status-${tone})`, display: 'flex', flex: 'none' }}>{icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        {badge}
      </div>
      {children && <div style={{ padding: 14 }}>{children}</div>}
      {footer && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--admin-border-color)' }}>{footer}</div>}
    </div>
  );
}

/* ── State 9: partial-stage failure ───────────────────────────────────────── */
function PartialFailurePanel({ onRetry, onRecheck, stages: stagesProp }) {
  const stages = stagesProp || window.ADMIN.PARTIAL_STAGES;
  const okCount = stages.filter((s) => s.status === 'ok').length;
  const failed = stages.find((s) => s.status === 'failed');
  return (
    <PanelShell
      tone="broken"
      icon={<XI.wrench size={15} />}
      title="Repair incomplete — 1 stage failed"
      subtitle={`${okCount} of ${stages.length} stages applied. Committed stages are already written; only the failed stage can be retried.`}
      badge={<XBadge tone="broken" uppercase>1 failed</XBadge>}
      footer={(
        <React.Fragment>
          <XMono size="sm" muted>{okCount}/{stages.length} stages applied · rollback available for committed stages</XMono>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <XBtn variant="secondary" iconLeft={<XI.refresh />} onClick={onRecheck}>Re-run check</XBtn>
            <XBtn variant="primary" iconLeft={<XI.wrench />} onClick={onRetry}>Retry failed stage</XBtn>
          </div>
        </React.Fragment>
      )}
    >
      <div style={{ display: 'grid', gap: 1, background: 'var(--admin-border-color)', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
        {stages.map((s) => {
          const isFail = s.status === 'failed';
          return (
            <div key={s.phase} style={{ background: isFail ? 'var(--admin-status-broken-bg)' : 'var(--admin-surface)', padding: '10px 12px', display: 'grid', gridTemplateColumns: '18px 150px 1fr', columnGap: 10, alignItems: 'start' }}>
              <span style={{ display: 'flex', marginTop: 1, color: isFail ? 'var(--admin-status-broken)' : 'var(--admin-status-healthy)' }}>
                {isFail ? <XI.x size={14} /> : <XI.check size={14} />}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
              <div style={{ minWidth: 0 }}>
                {isFail ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <XBadge tone="broken" uppercase mono>{s.error_code}</XBadge>
                      <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>{s.remaining} issues still outstanding in this stage</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--admin-text)', lineHeight: 1.5 }}>{s.error}</div>
                    <div>
                      <XBtn variant="secondary" size="sm" iconLeft={<XI.refresh />} onClick={onRetry}>Retry stage</XBtn>
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>{s.result}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

/* ── State 11: refused (cross-database) ───────────────────────────────────── */
function RefusedPanel({ data }) {
  const r = data || window.ADMIN.REFUSED;
  return (
    <PanelShell
      tone="caution"
      icon={<XI.slash size={15} />}
      title={`Repair refused — ${r.headline}`}
      subtitle="The report is readable. No destructive action is offered while the fix set crosses logical databases."
      badge={<XBadge tone="caution" uppercase mono>{r.error}</XBadge>}
      footer={(
        <React.Fragment>
          <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', flex: 'none' }}>Remedy</span>
          <XMono size="sm" style={{ lineHeight: 1.5 }}>{r.remedy}</XMono>
        </React.Fragment>
      )}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--admin-text)', lineHeight: 1.55, maxWidth: 720 }}>{r.detail}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', alignItems: 'stretch', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
          <DbSpan span={r.spans[0]} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--admin-text-subtle)', background: 'var(--admin-surface-sunken)', borderLeft: '1px solid var(--admin-border-color)', borderRight: '1px solid var(--admin-border-color)', fontFamily: 'var(--admin-mono)', fontSize: 12 }}>≠</div>
          <DbSpan span={r.spans[1]} />
        </div>
      </div>
    </PanelShell>
  );
}

function DbSpan({ span }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--admin-bg)', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', color: 'var(--admin-text-subtle)' }}><window.ICONS.database size={13} /></span>
        <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>logical db {span.db}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>{span.scope}</div>
      <div style={{ display: 'grid', gap: 3 }}>
        {span.keys.map((k) => <code key={k} style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text)' }}>{k}</code>)}
      </div>
    </div>
  );
}

/* ── State 12: insufficient permission ────────────────────────────────────── */
function NoPermPanel({ data }) {
  const a = data || window.ADMIN.AUTH;
  return (
    <PanelShell
      tone="caution"
      icon={<XI.lock size={15} />}
      title="Read-only — repair requires elevated permission"
      subtitle={a.note}
      badge={<XBadge tone="caution" uppercase mono>read-only</XBadge>}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden', width: 'fit-content' }}>
        <TierCell label="You hold" value={a.held} ok />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', color: 'var(--admin-text-subtle)', background: 'var(--admin-surface-sunken)', borderLeft: '1px solid var(--admin-border-color)', borderRight: '1px solid var(--admin-border-color)' }}>
          <window.ICONS.arrowRight size={13} />
        </div>
        <TierCell label="Repair requires" value={a.required} />
      </div>
    </PanelShell>
  );
}

function TierCell({ label, value, ok }) {
  return (
    <div style={{ padding: '8px 14px', background: 'var(--admin-bg)', display: 'grid', gap: 3 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>{label}</span>
      <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, fontWeight: 600, color: ok ? 'var(--admin-status-healthy)' : 'var(--admin-text)' }}>{value}</code>
    </div>
  );
}

Object.assign(window, { PartialFailurePanel, RefusedPanel, NoPermPanel });
