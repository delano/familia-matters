/* migrations/flows.jsx — the flow panels for the cockpit: dry-run preview,
 * irreversible confirm-with-impact, streamed running, done summary, rollback
 * confirm, partial failure, and no-perm. These reuse the EXACT dry-run-then-
 * apply + confirm-with-impact visual language of the Integrity console
 * (preview-toned panel shell, plan/impact rows, red ack checkbox). → window.MFLOWS */
const MF_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Button: MFBtn, Badge: MFBadge, Mono: MFMono, Banner: MFBanner, ProgressStream: MFStream } = MF_DS;
const MFI = window.MICONS;

function mfTime(ts) {
  if (ts == null) return '—';
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

/* Shared status-tinted panel shell (mirrors states-extra.jsx PanelShell). */
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

/* The impact / plan rows — the "confirm-with-impact" table, reused across
 * dry-run, confirm and rollback. */
function ImpactRows({ items }) {
  return (
    <div style={{ border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '7px 12px', borderTop: i ? '1px solid var(--admin-border-color)' : 'none', background: 'var(--admin-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {it.tone && <span style={{ width: 6, height: 6, borderRadius: 9999, background: `var(--admin-status-${it.tone})`, flex: 'none' }} />}
            <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>{it.label}</span>
          </div>
          <span style={{ fontFamily: it.plain ? 'inherit' : 'var(--admin-mono)', fontSize: 12, color: it.valueTone ? `var(--admin-status-${it.valueTone})` : 'var(--admin-text)', fontWeight: it.strong ? 600 : 400, textAlign: 'right', whiteSpace: 'nowrap', paddingLeft: 12 }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function planImpact(plan) {
  const rows = [
    { label: 'Operation', value: plan.operation, strong: true },
  ];
  if (plan.from != null && plan.to != null) {
    rows.push({ label: 'Change', value: `${plan.from}  →  ${plan.to}` });
  }
  rows.push({ label: 'Estimated records', value: window.MIG.fmtCount(plan.estimated_records) });
  rows.push({ label: 'Reversible', value: plan.reversible ? 'yes' : 'no', valueTone: plan.reversible ? 'healthy' : 'broken', strong: true });
  rows.push({ label: 'Backup', value: plan.backup ? 'enabled' : 'disabled', valueTone: plan.backup ? 'healthy' : 'caution' });
  return rows;
}

/* ── Dry-run preview (preview-toned, like Integrity's dryrun FlowPanel) ─────── */
function PlanPreview({ plan, model, busy, onCancel, onContinue, onApply }) {
  const irreversible = !plan.reversible;
  return (
    <div style={{ border: '1px solid var(--admin-status-preview)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--admin-status-preview-bg)', borderBottom: '1px solid color-mix(in srgb, var(--admin-status-preview) 40%, transparent)' }}>
        <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'var(--admin-status-preview)', flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Dry-run preview — {plan.operation} on {model}</div>
          <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 1 }}>What this migration would change. Nothing has been written.</div>
        </div>
        <MFBadge tone="preview" uppercase>preview</MFBadge>
      </div>
      <div style={{ padding: 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MFMono size="sm" muted>{plan.id}</MFMono>
        </div>
        <ImpactRows items={planImpact(plan)} />
        {irreversible && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: 'var(--admin-status-broken-bg)', border: '1px solid color-mix(in srgb, var(--admin-status-broken) 40%, transparent)', borderLeft: '3px solid var(--admin-status-broken)', borderRadius: 'var(--admin-radius-sm)' }}>
            <span style={{ color: 'var(--admin-status-broken)', display: 'flex', marginTop: 1 }}><MFI.alert size={14} /></span>
            <div style={{ fontSize: 12, color: 'var(--admin-text)', lineHeight: 1.5 }}>
              <strong>This migration is irreversible.</strong> There is no down-path; once applied it cannot be rolled back. A backup is written first, but recovery requires a manual restore.
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--admin-border-color)' }}>
        <MFMono size="sm" muted>{window.MIG.fmtCount(plan.estimated_records)} records · {plan.reversible ? 'reversible' : 'irreversible'} · backup {plan.backup ? 'enabled' : 'off'}</MFMono>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <MFBtn variant="secondary" onClick={onCancel} disabled={busy}>Cancel</MFBtn>
          {irreversible
            ? <MFBtn variant="primary" iconRight={<MFI.arrowRight />} onClick={onContinue} disabled={busy}>Continue</MFBtn>
            : <MFBtn variant="primary" iconLeft={<MFI.play />} loading={busy} onClick={onApply}>Apply migration</MFBtn>}
        </div>
      </div>
    </div>
  );
}

/* ── Irreversible confirm-with-impact (red ack checkbox) ────────────────────── */
function IrreversibleConfirm({ plan, model, ack, setAck, busy, onCancel, onApply }) {
  return (
    <PanelShell
      tone="broken"
      icon={<MFI.alert size={15} />}
      title={`Confirm irreversible migration — ${plan.operation}`}
      subtitle="Review the impact once more. This cannot be undone."
      badge={<MFBadge tone="broken" uppercase mono>irreversible</MFBadge>}
      footer={(
        <React.Fragment>
          <MFMono size="sm" muted>{window.MIG.fmtCount(plan.estimated_records)} records · no rollback · backup {plan.backup ? 'enabled' : 'off'}</MFMono>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <MFBtn variant="secondary" onClick={onCancel} disabled={busy}>Cancel</MFBtn>
            <MFBtn variant="danger" iconLeft={<MFI.play />} loading={busy} disabled={!ack || busy} onClick={onApply}>Apply migration</MFBtn>
          </div>
        </React.Fragment>
      )}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <ImpactRows items={planImpact(plan)} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--admin-status-broken)', background: 'var(--admin-status-broken-bg)', borderRadius: 'var(--admin-radius-sm)', cursor: 'pointer', fontSize: 12, color: 'var(--admin-text)' }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ accentColor: 'var(--admin-status-broken)' }} />
          I understand <Mono_inline>{plan.id}</Mono_inline> cannot be rolled back.
        </label>
      </div>
    </PanelShell>
  );
}
function Mono_inline({ children }) {
  return <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)', margin: '0 2px' }}>{children}</code>;
}

/* ── Running (streamed records-processed feed) ──────────────────────────────── */
function RunningPanel({ events, plan, model }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <MFBanner tone="preview" title={`Applying ${plan.operation} — controls locked`}>
        Streaming records-processed progress for <code style={{ fontFamily: 'var(--admin-mono)' }}>{plan.id}</code>. Phases commit in order.
      </MFBanner>
      <MFStream events={events} />
    </div>
  );
}

/* ── Done summary ───────────────────────────────────────────────────────────── */
function DonePanel({ plan, model, summary, onClose }) {
  const processed = (summary && (summary.records_processed != null ? summary.records_processed : summary.processed)) || plan.estimated_records;
  const cells = [
    { label: 'Records processed', value: window.MIG.fmtCount(processed), sev: 'healthy' },
    { label: 'Phases', value: (summary && summary.phases) || window.MIG.phasesFor(plan).length, sev: 'healthy' },
    { label: 'Backup', value: plan.backup ? 'written' : 'skipped', sev: plan.backup ? 'healthy' : 'caution' },
    { label: 'Reversible', value: plan.reversible ? 'yes' : 'no', sev: plan.reversible ? 'healthy' : 'broken' },
  ];
  return (
    <PanelShell
      tone="healthy"
      icon={<MFI.check size={15} />}
      title={`Migration applied — ${plan.id}`}
      subtitle={`${model} schema is now at the current digest. ${plan.reversible ? 'Rollback is available from the applied list.' : 'This migration is irreversible.'}`}
      badge={<MFBadge tone="healthy" uppercase>done</MFBadge>}
      footer={(
        <React.Fragment>
          <MFMono size="sm" muted>{window.MIG.fmtCount(processed)} records processed{plan.reversible ? ' · rollback available' : ''}</MFMono>
          <div style={{ marginLeft: 'auto' }}>
            <MFBtn variant="secondary" onClick={onClose}>Done</MFBtn>
          </div>
        </React.Fragment>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1, background: 'var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden', border: '1px solid var(--admin-border-color)' }}>
        {cells.map((c, i) => (
          <div key={i} style={{ background: 'var(--admin-bg)', padding: '10px 12px', display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 9999, background: `var(--admin-status-${c.sev})`, flex: 'none' }} />
              <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{c.value}</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>{c.label}</span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

/* ── Rollback confirm-with-impact ───────────────────────────────────────────── */
function RollbackConfirm({ mig, ack, setAck, busy, onCancel, onRollback }) {
  const rows = [
    { label: 'Migration', value: mig.id, strong: true },
    { label: 'Applied at', value: mfTime(mig.applied_at) },
    { label: 'Direction', value: 'apply  →  revert', valueTone: 'caution' },
    { label: 'Effect', value: 'reintroduces schema drift', valueTone: 'caution' },
  ];
  return (
    <PanelShell
      tone="caution"
      icon={<MFI.rollback size={15} />}
      title={`Roll back ${mig.id}`}
      subtitle="Reverts this migration. The model returns to its prior schema and its drift entry is reopened."
      badge={<MFBadge tone="caution" uppercase mono>rollback</MFBadge>}
      footer={(
        <React.Fragment>
          <MFMono size="sm" muted>down-migration · backup retained</MFMono>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <MFBtn variant="secondary" onClick={onCancel} disabled={busy}>Cancel</MFBtn>
            <MFBtn variant="danger" iconLeft={<MFI.rollback />} loading={busy} disabled={!ack || busy} onClick={onRollback}>Roll back</MFBtn>
          </div>
        </React.Fragment>
      )}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <ImpactRows items={rows} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--admin-status-caution)', background: 'var(--admin-status-caution-bg)', borderRadius: 'var(--admin-radius-sm)', cursor: 'pointer', fontSize: 12, color: 'var(--admin-text)' }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ accentColor: 'var(--admin-status-caution)' }} />
          I understand this reopens schema drift on the model.
        </label>
      </div>
    </PanelShell>
  );
}

/* ── Partial failure ────────────────────────────────────────────────────────── */
function PartialPanel({ plan, model, info, busy, onRetry, onClose }) {
  const phases = window.MIG.phasesFor(plan);
  const failIdx = phases.indexOf(info.failPhase);
  return (
    <PanelShell
      tone="broken"
      icon={<MFI.alert size={15} />}
      title={`Migration incomplete — failed in "${info.failPhase}"`}
      subtitle={`${failIdx} of ${phases.length} phases committed. The failed phase rolled itself back; its records are unchanged. Re-run is safe — committed phases are idempotent.`}
      badge={<MFBadge tone="broken" uppercase mono>{info.error_code}</MFBadge>}
      footer={(
        <React.Fragment>
          <MFMono size="sm" muted>{window.MIG.fmtCount(info.stopped)} / {window.MIG.fmtCount(info.total)} records before abort</MFMono>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <MFBtn variant="secondary" onClick={onClose} disabled={busy}>Dismiss</MFBtn>
            <MFBtn variant="primary" iconLeft={<MFI.refresh />} loading={busy} onClick={onRetry}>Retry migration</MFBtn>
          </div>
        </React.Fragment>
      )}
    >
      <div style={{ display: 'grid', gap: 1, background: 'var(--admin-border-color)', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
        {phases.map((ph, i) => {
          const failed = i === failIdx;
          const skipped = i > failIdx;
          return (
            <div key={ph} style={{ background: failed ? 'var(--admin-status-broken-bg)' : 'var(--admin-surface)', padding: '9px 12px', display: 'grid', gridTemplateColumns: '18px 130px 1fr', columnGap: 10, alignItems: 'start' }}>
              <span style={{ display: 'flex', marginTop: 1, color: failed ? 'var(--admin-status-broken)' : skipped ? 'var(--admin-text-subtle)' : 'var(--admin-status-healthy)' }}>
                {failed ? <MFI.x size={14} /> : skipped ? <MFI.lock size={13} /> : <MFI.check size={14} />}
              </span>
              <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, fontWeight: 600 }}>{ph}</span>
              <div style={{ minWidth: 0 }}>
                {failed ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--admin-text)' }}>
                      Aborted at record {window.MIG.fmtCount(info.stopped)} of {window.MIG.fmtCount(info.total)} — {info.error_code === 'KEY_UNAVAILABLE' ? 'the v2 encryption key was not reachable for this batch; the transaction rolled back and wrote nothing.' : 'a record violated a not-null constraint; the phase rolled back and wrote nothing.'}
                    </div>
                  </div>
                ) : skipped ? (
                  <span style={{ fontSize: 12, color: 'var(--admin-text-subtle)' }}>Not reached — phase did not run.</span>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>{window.MIG.fmtCount(info.total)} records processed · committed</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

/* ── No-perm ────────────────────────────────────────────────────────────────── */
function MigNoPerm({ required, held }) {
  return (
    <PanelShell
      tone="caution"
      icon={<MFI.lock size={15} />}
      title="Read-only — running migrations requires elevated permission"
      subtitle="The migration status and schema drift are readable at your tier. Applying or rolling back a migration writes to the object graph."
      badge={<MFBadge tone="caution" uppercase mono>read-only</MFBadge>}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden', width: 'fit-content' }}>
        <div style={{ padding: '8px 14px', background: 'var(--admin-bg)', display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>You hold</span>
          <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, fontWeight: 600, color: 'var(--admin-status-healthy)' }}>{held || 'permission:read'}</code>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px', color: 'var(--admin-text-subtle)', background: 'var(--admin-surface-sunken)', borderLeft: '1px solid var(--admin-border-color)', borderRight: '1px solid var(--admin-border-color)' }}>
          <MFI.arrowRight size={13} />
        </div>
        <div style={{ padding: '8px 14px', background: 'var(--admin-bg)', display: 'grid', gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>Run requires</span>
          <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, fontWeight: 600, color: 'var(--admin-text)' }}>{required || 'permission:run_migrations'}</code>
        </div>
      </div>
    </PanelShell>
  );
}

window.MFLOWS = { PanelShell, PlanPreview, IrreversibleConfirm, RunningPanel, DonePanel, RollbackConfirm, PartialPanel, MigNoPerm, mfTime };
