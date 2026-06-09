/* migrations/MigrationCockpit.jsx — the primary screen. Pending / applied /
 * schema-drift lists plus the dry-run → (confirm) → apply → done flow, rollback
 * confirm, partial failure and no-perm. All data comes from the ONE shared
 * backend via window.MSTORE; the screen degrades to the seed when it is
 * unreachable. Exports window.MigrationCockpit. Props: { state, setState }. */
const MC_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Button: MCBtn, StatusDot: MCDot, Badge: MCBadge, Mono: MCMono, Banner: MCBanner, DataTable: MCTable } = MC_DS;
const MCI = window.MICONS;
const MFL = window.MFLOWS;
const ST = window.MSTORE;
const MIGD = window.MIG;

function MigrationCockpit({ state, setState, offline, onOfflineChange }) {
  const setOffline = onOfflineChange;
  const [data, setData] = React.useState({ applied: ST.mirror.applied.slice(), pending: ST.mirror.pending.slice(), drift: ST.mirror.drift.slice() });
  const [focus, setFocus] = React.useState(null);        // focused migration object
  const [plan, setPlan] = React.useState(null);
  const [events, setEvents] = React.useState([]);
  const [doneSummary, setDoneSummary] = React.useState(null);
  const [partialInfo, setPartialInfo] = React.useState(null);
  const [ack, setAck] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [noPerm, setNoPerm] = React.useState(null);
  const [draftedFor, setDraftedFor] = React.useState(null);

  const intentRef = React.useRef('status');
  const timers = React.useRef([]);
  const partialRef = React.useRef(false);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const go = (next) => { intentRef.current = next; setState(next); };

  // ── Loaders ────────────────────────────────────────────────────────────────
  async function reload() {
    const s = await ST.status();
    const d = await ST.drift();
    setData({ applied: s.applied, pending: s.pending, drift: d.drift });
    setOffline(s.offline || d.offline);
  }
  React.useEffect(() => { reload(); /* initial */ }, []); // eslint-disable-line
  React.useEffect(() => clearTimers, []); // eslint-disable-line

  const pendingReversible = () => data.pending.find((p) => p.reversible) || data.pending[0];
  const pendingIrreversible = () => data.pending.find((p) => !p.reversible) || data.pending[0];
  const appliedReversible = () => data.applied.find((a) => a.reversible) || data.applied[0];
  const migById = (id) => data.pending.concat(data.applied).find((m) => m.id === id) || MIGD.PENDING.concat(MIGD.APPLIED).find((m) => m.id === id);
  const modelOf = (mig) => { const m = ((mig && mig.description) || '').match(/\b(Customer|Session|ApiKey)\b/); return m ? m[1] : 'Customer'; };

  // ── Actions ────────────────────────────────────────────────────────────────
  async function startDryRun(mig, toConfirm) {
    if (!mig) return;
    setBusy('run'); setAck(false); clearTimers();
    setFocus(mig);
    const res = await ST.dryRun(mig.id, ST.RUN_TIER);
    setBusy(null);
    setOffline(res.offline);
    if (res.forbidden) { setNoPerm({ required: res.required, held: res.held }); go('noperm'); return; }
    setPlan(res.plan);
    go(toConfirm ? 'confirm' : 'dryrun');
  }

  function animate(evtList, { partial }) {
    clearTimers();
    setEvents([evtList[0]]);
    go('running');
    let committed = false;
    const finishDone = (summary) => {
      if (committed) return;
      committed = true;
      setDoneSummary(summary || null);
      const target = focusRef.current || focus;
      const result = target ? ST.commitApply(target.id) : null;
      timers.current.push(setTimeout(() => {
        if (result) setData((d) => ({ ...d, applied: result.applied, pending: result.pending, drift: result.drift }));
        go('done');
      }, 700));
    };
    let i = 0;
    const tick = () => {
      i += 1;
      if (i >= evtList.length) {
        // Backend stream ended without an explicit done/failed event — settle anyway.
        if (!partial) finishDone(null);
        return;
      }
      const e = evtList[i];
      setEvents((p) => [...p, e]);
      if (e.event === 'done') {
        finishDone(e.summary);
      } else if (e.event === 'failed') {
        setPartialInfo({ failPhase: e.failed_phase, stopped: e.processed, total: e.total, error_code: e.error_code });
        timers.current.push(setTimeout(() => go('partial'), 600));
      } else {
        timers.current.push(setTimeout(tick, 360));
      }
    };
    timers.current.push(setTimeout(tick, 360));
  }

  // keep a ref so the async animate closure sees the current focus
  const focusRef = React.useRef(null);
  React.useEffect(() => { focusRef.current = focus; }, [focus]);

  async function applyMig(partial) {
    if (!focus || !plan) return;
    setBusy('apply'); clearTimers();
    partialRef.current = !!partial;
    const res = await ST.apply(focus.id, plan, ST.RUN_TIER);
    setBusy(null);
    setOffline(res.offline);
    if (res.forbidden) { setNoPerm({ required: res.required, held: res.held }); go('noperm'); return; }
    if (partial) {
      const p = MIGD.derivePartialStream(plan, modelOf(focus));
      animate(p.events, { partial: true });
    } else {
      animate(res.events, { partial: false });
    }
  }

  async function startRollback(mig) {
    if (!mig) return;
    clearTimers(); setAck(false); setFocus(mig); go('rollback');
  }
  async function confirmRollback() {
    if (!focus) return;
    setBusy('rollback');
    const res = await ST.rollback(focus.id, ST.RUN_TIER);
    setBusy(null);
    setOffline(res.offline);
    if (res.forbidden) { setNoPerm({ required: res.required, held: res.held }); go('noperm'); return; }
    setData((d) => ({ ...d, applied: res.applied, pending: res.pending, drift: res.drift }));
    go('status');
  }

  function draftMigration(driftEntry) {
    const res = ST.draftMigration(driftEntry);
    setDraftedFor(driftEntry.model);
    const mig = migById(res.suggested_id) || { id: res.suggested_id, description: res.plan.description, reversible: true, dependencies: [] };
    setFocus(mig);
    setPlan(res.plan);
    go('dryrun');
  }

  function cancelFlow() { clearTimers(); setPlan(null); setEvents([]); setDoneSummary(null); setPartialInfo(null); setAck(false); go('status'); }

  // ── Scenario routing for the topbar "Preview" switcher ─────────────────────
  function enterScenario(target) {
    clearTimers();
    if (target === 'status') { reload(); setNoPerm(null); }
    else if (target === 'dryrun') { startDryRun(pendingReversible(), false); }
    else if (target === 'confirm') { startDryRun(pendingIrreversible(), true); }
    else if (target === 'running' || target === 'done') {
      const mig = pendingReversible();
      setFocus(mig);
      ST.dryRun(mig.id, ST.RUN_TIER).then((r) => {
        if (r.forbidden) { setNoPerm({ required: r.required, held: r.held }); go('noperm'); return; }
        setPlan(r.plan);
        ST.apply(mig.id, r.plan, ST.RUN_TIER).then((res) => {
          if (res.forbidden) { setNoPerm({ required: res.required, held: res.held }); go('noperm'); return; }
          focusRef.current = mig;
          animate(res.events, { partial: false });
        });
      });
    }
    else if (target === 'partial') {
      const mig = pendingIrreversible();
      setFocus(mig); focusRef.current = mig;
      ST.dryRun(mig.id, ST.RUN_TIER).then((r) => {
        const pl = r.plan || MIGD.planFor(mig);
        setPlan(pl);
        const p = MIGD.derivePartialStream(pl, modelOf(mig));
        animate(p.events, { partial: true });
      });
    }
    else if (target === 'rollback') { startRollback(appliedReversible()); }
    else if (target === 'noperm') {
      setFocus(pendingReversible());
      ST.dryRun((pendingReversible() || {}).id, ST.READ_TIER).then((r) => {
        if (r.forbidden) setNoPerm({ required: r.required, held: r.held });
        else setNoPerm({ required: ST.RUN_TIER, held: ST.READ_TIER });
        go('noperm');
      }).catch(() => { setNoPerm({ required: ST.RUN_TIER, held: ST.READ_TIER }); go('noperm'); });
    }
  }

  React.useEffect(() => {
    if (intentRef.current === state) return;
    intentRef.current = state;
    enterScenario(state);
    // eslint-disable-line
  }, [state]); // eslint-disable-line

  // ── Derived header status ──────────────────────────────────────────────────
  const appliedCount = data.applied.length;
  const pendingCount = data.pending.length;
  const driftCount = data.drift.filter((d) => d.changed).length;
  const statusMap = {
    status: { status: pendingCount ? 'caution' : 'healthy', label: pendingCount ? `${pendingCount} pending` : 'All applied' },
    dryrun: { status: 'preview', label: 'Dry-run preview' },
    confirm: { status: 'broken', label: 'Confirm irreversible' },
    running: { status: 'preview', label: 'Applying…' },
    done: { status: 'healthy', label: 'Applied' },
    rollback: { status: 'caution', label: 'Rollback confirm' },
    partial: { status: 'broken', label: 'Migration incomplete' },
    noperm: { status: 'caution', label: 'Read-only' },
  }[state] || { status: 'healthy', label: 'Migrations' };

  const flowActive = ['dryrun', 'confirm', 'running', 'done', 'rollback', 'partial', 'noperm'].includes(state);
  const model = focus ? modelOf(focus) : 'Customer';
  const locked = state === 'running';

  // ── Run pending (gated) ─────────────────────────────────────────────────────
  const runPending = () => { if (pendingCount) startDryRun(data.pending[0], !data.pending[0].reversible); };

  return (
    <div style={{ position: 'relative', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 64px', display: 'grid', gap: 16 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><MCI.layers size={18} /></span>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Migrations</h1>
              <MCDot status={statusMap.status} label={statusMap.label} />
              {offline && <SimulatedBadge />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Summary label="Applied" value={appliedCount} tone="healthy" />
              <Summary label="Pending" value={pendingCount} tone={pendingCount ? 'caution' : 'healthy'} />
              <Summary label="Schema drift" value={driftCount} tone={driftCount ? 'broken' : 'healthy'} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MCBtn variant="secondary" size="md" iconLeft={<MCI.refresh />} onClick={() => reload()} disabled={locked}>Refresh</MCBtn>
            {state === 'noperm' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Requires permission:run_migrations">
                <MCBtn variant="primary" size="md" iconLeft={<MCI.lock />} disabled>Run pending</MCBtn>
              </span>
            ) : (
              <MCBtn variant="primary" size="md" iconLeft={<MCI.play />} disabled={!pendingCount || locked || flowActive} onClick={runPending}>Run pending</MCBtn>
            )}
          </div>
        </div>

        {/* Flow panel */}
        {flowActive && (
          <FlowArea
            state={state} plan={plan} focus={focus} model={model} events={events}
            doneSummary={doneSummary} partialInfo={partialInfo} ack={ack} setAck={setAck}
            busy={busy} noPerm={noPerm}
            onCancel={cancelFlow}
            onContinue={() => go('confirm')}
            onApply={() => applyMig(false)}
            onRollback={confirmRollback}
            onRetry={() => applyMig(false)}
          />
        )}

        {/* Pending */}
        <Section title="Pending" eyebrow={`${pendingCount} not yet applied`}>
          {data.pending.length === 0
            ? <Empty>No pending migrations. The schema is fully migrated.</Empty>
            : (
              <div style={{ display: 'grid', gap: 8 }}>
                {data.pending.map((m) => (
                  <PendingCard key={m.id} mig={m} applied={data.applied} disabled={locked || flowActive}
                    active={focus && focus.id === m.id && (state === 'dryrun' || state === 'confirm')}
                    onDryRun={() => startDryRun(m, !m.reversible)} />
                ))}
              </div>
            )}
        </Section>

        {/* Applied */}
        <Section title="Applied" eyebrow={`${appliedCount} in history`}>
          <AppliedTable applied={data.applied} disabled={locked || flowActive} onRollback={startRollback} />
        </Section>

        {/* Schema drift */}
        <Section title="Schema drift" eyebrow={`${driftCount} model${driftCount === 1 ? '' : 's'} drifted`}>
          <div style={{ display: 'grid', gap: 8 }}>
            {data.drift.map((d) => (
              <DriftCard key={d.model} drift={d} migById={migById} drafted={draftedFor === d.model}
                disabled={locked || flowActive}
                onDraft={() => draftMigration(d)}
                onOpenSuggested={() => { const mig = migById(d.suggested_migration); if (mig) startDryRun(mig, !mig.reversible); }} />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ── Flow area: routes the high-level state to the right panel ──────────────── */
function FlowArea({ state, plan, focus, model, events, doneSummary, partialInfo, ack, setAck, busy, noPerm, onCancel, onContinue, onApply, onRollback, onRetry }) {
  if (state === 'noperm') return <MFL.MigNoPerm required={noPerm && noPerm.required} held={noPerm && noPerm.held} />;
  if (state === 'rollback' && focus) return <MFL.RollbackConfirm mig={focus} ack={ack} setAck={setAck} busy={busy === 'rollback'} onCancel={onCancel} onRollback={onRollback} />;
  if (!plan) return null;
  if (state === 'dryrun') return <MFL.PlanPreview plan={plan} model={model} busy={busy === 'apply'} onCancel={onCancel} onContinue={onContinue} onApply={onApply} />;
  if (state === 'confirm') return <MFL.IrreversibleConfirm plan={plan} model={model} ack={ack} setAck={setAck} busy={busy === 'apply'} onCancel={onCancel} onApply={onApply} />;
  if (state === 'running') return <MFL.RunningPanel events={events} plan={plan} model={model} />;
  if (state === 'done') return <MFL.DonePanel plan={plan} model={model} summary={doneSummary} onClose={onCancel} />;
  if (state === 'partial' && partialInfo) return <MFL.PartialPanel plan={plan} model={model} info={partialInfo} busy={busy === 'apply'} onRetry={onRetry} onClose={onCancel} />;
  return null;
}

/* ── Small pieces ───────────────────────────────────────────────────────────── */
function Summary({ label, value, tone }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 9999, background: `var(--admin-status-${tone})`, alignSelf: 'center', flex: 'none' }} />
      <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>{label}</span>
    </span>
  );
}

function Section({ title, eyebrow, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', whiteSpace: 'nowrap' }}>{title}</span>
        {eyebrow && <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)', whiteSpace: 'nowrap' }}>{eyebrow}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <div style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', padding: '16px', fontSize: 12, color: 'var(--admin-text-muted)' }}>{children}</div>;
}

function DepChip({ id, satisfied }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 9999, border: '1px solid var(--admin-border-color)', background: 'var(--admin-bg)', fontSize: 10 }}>
      <span style={{ color: satisfied ? 'var(--admin-status-healthy)' : 'var(--admin-status-caution)', display: 'flex' }}>{satisfied ? <MCI.check size={10} /> : <MCI.clock size={10} />}</span>
      <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 10, color: 'var(--admin-text-muted)' }}>{id}</code>
    </span>
  );
}

function PendingCard({ mig, applied, onDryRun, disabled, active }) {
  const deps = mig.dependencies || [];
  return (
    <div style={{ border: active ? '1px solid var(--admin-status-preview)' : 'var(--admin-border)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 14, transition: 'border-color 120ms ease' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, fontWeight: 600, color: 'var(--admin-text)' }}>{mig.id}</code>
          {mig.reversible
            ? <MCBadge tone="healthy" uppercase>reversible</MCBadge>
            : <MCBadge tone="broken" uppercase>irreversible</MCBadge>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>{mig.description}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)', whiteSpace: 'nowrap' }}>Depends on</span>
          {deps.length === 0
            ? <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>none</span>
            : deps.map((d) => <DepChip key={d} id={d} satisfied={applied.some((a) => a.id === d)} />)}
        </div>
      </div>
      <MCBtn variant={active ? 'primary' : 'secondary'} iconLeft={<MCI.diff />} onClick={onDryRun} disabled={disabled}>Dry-run</MCBtn>
    </div>
  );
}

function AppliedTable({ applied, onRollback, disabled }) {
  const cols = [
    { key: 'id', header: 'Migration', render: (v, r) => (
      <div style={{ display: 'grid', gap: 1 }}>
        <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)' }}>{v}</code>
        <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{r.description}</span>
      </div>
    ) },
    { key: 'applied_at', header: 'Applied at', width: 230, render: (v) => (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
        <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text-muted)' }}>{MFL.mfTime(v)}</code>
      </span>
    ) },
    { key: 'reversible', header: 'Reversible', width: 110, render: (v) => v
      ? <MCBadge tone="healthy" uppercase>yes</MCBadge>
      : <MCBadge tone="neutral" uppercase>no</MCBadge> },
    { key: 'action', header: '', width: 120, align: 'right', render: (v, r) => r.reversible
      ? <MCBtn variant="secondary" size="sm" iconLeft={<MCI.rollback />} onClick={() => onRollback(r)} disabled={disabled}>Rollback</MCBtn>
      : <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>—</span> },
  ];
  return <MCTable columns={cols} rows={applied} rowKey={(r) => r.id} emptyMessage="No migrations applied yet." />;
}

function DiffLine({ field, change }) {
  const added = change === 'added';
  const removed = change === 'removed';
  const sign = added ? '+' : removed ? '−' : '~';
  const tone = added ? 'healthy' : removed ? 'broken' : 'caution';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: `var(--admin-status-${tone}-bg)`, borderLeft: `2px solid var(--admin-status-${tone})`, borderRadius: 2 }}>
      <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, fontWeight: 700, color: `var(--admin-status-${tone})`, width: 10 }}>{sign}</span>
      <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)' }}>{field}</code>
      <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{change}</span>
    </div>
  );
}

function DriftCard({ drift, migById, onDraft, onOpenSuggested, drafted, disabled }) {
  if (!drift.changed) {
    return (
      <div style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <MCDot status="healthy" label={`${drift.model} in sync`} />
        <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-subtle)', marginLeft: 'auto' }}>{drift.stored_digest}</code>
      </div>
    );
  }
  const suggested = migById(drift.suggested_migration);
  return (
    <div style={{ border: '1px solid color-mix(in srgb, var(--admin-status-broken) 35%, var(--admin-border-color))', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--admin-border-color)' }}>
        <span style={{ color: 'var(--admin-status-broken)', display: 'flex' }}><MCI.diff size={15} /></span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{drift.model}</span>
        <MCBadge tone="broken" uppercase>{drift.differences.length} field{drift.differences.length === 1 ? '' : 's'} drifted</MCBadge>
        <div style={{ marginLeft: 'auto' }}>
          <MCBtn variant="primary" size="sm" iconLeft={<MCI.filePlus />} onClick={onDraft} disabled={disabled}>Draft migration</MCBtn>
        </div>
      </div>
      <div style={{ padding: 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', alignItems: 'center', gap: 0, border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
          <DigestCell label="Stored digest" value={drift.stored_digest} tone="broken" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--admin-text-subtle)', background: 'var(--admin-surface-sunken)', alignSelf: 'stretch', borderLeft: '1px solid var(--admin-border-color)', borderRight: '1px solid var(--admin-border-color)' }}><MCI.arrowRight size={13} /></div>
          <DigestCell label="Current digest" value={drift.current_digest} tone="healthy" />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)' }}>Field diff</span>
          {drift.differences.map((d) => <DiffLine key={d.field} field={d.field} change={d.change} />)}
        </div>
        {drift.suggested_migration && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>Suggested</span>
            <button type="button" onClick={onOpenSuggested} disabled={disabled || !suggested} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 9999, border: '1px solid var(--admin-status-preview)', background: 'var(--admin-status-preview-bg)', cursor: (disabled || !suggested) ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              <span style={{ color: 'var(--admin-status-preview)', display: 'flex' }}><MCI.link size={11} /></span>
              <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text)' }}>{drift.suggested_migration}</code>
            </button>
            {suggested ? <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>in pending list</span> : <span style={{ fontSize: 11, color: 'var(--admin-status-caution)' }}>not yet drafted</span>}
            {drafted && <MCBadge tone="preview" uppercase>drafted</MCBadge>}
          </div>
        )}
      </div>
    </div>
  );
}

function DigestCell({ label, value, tone }) {
  return (
    <div style={{ padding: '8px 12px', background: 'var(--admin-bg)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: `var(--admin-status-${tone})`, marginBottom: 3 }}>{label}</div>
      <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)' }}>{value}</code>
    </div>
  );
}

window.MigrationCockpit = MigrationCockpit;
