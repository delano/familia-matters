/* records/RecordList.jsx — Customer record list, wired to the shared backend
 * (window.RSTORE → familiaBackend → the shell's one StateModel).
 *
 *  · The page of rows comes from records.list.
 *  · The natural-language query bar plans the access path client-side, then runs
 *    it through query.index: indexed fields (email_lookup unique, status_index
 *    multi) resolve cheaply; an unindexed field returns scan_required and the
 *    bar surfaces the explicit full-scan cost before letting you force it.
 *  · New record → records.create, which bumps the shared instances timeline so
 *    the integrity console's next check reflects +1 (and a destroy reflects −1).
 *
 * Exports window.RecordList. */
const RLST_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Button: RLBtn, Badge: RLBadge, StatusDot: RLDot, Mono: RLMono2, CountPair: RLCount, Select: RLSelect, Input: RLInput, DataTable: RLTable } = RLST_DS;
const { Eyebrow: RLEyebrow, DualTime: RLDualTime, planQuery: RLplan, fmtTime: RLfmt, useToast: RLtoast } = window.RLIB;

const STATUS_TONE = { active: 'healthy', pending: 'preview', inactive: 'neutral' };

/* Cost pill used in the plan card. */
function CostTag({ cheap }) {
  return cheap
    ? <RLBadge tone="healthy" uppercase>cheap</RLBadge>
    : <RLBadge tone="caution" uppercase>expensive</RLBadge>;
}

/* The query-plan card that appears beneath the query bar. */
function QueryPlan({ plan, ran, busy, counts, scanInfo, onRun, onAddIndex }) {
  const RI = window.RICONS;
  const accent = plan.cheap ? 'preview' : 'caution';
  const pathIcon = plan.kind === 'key' ? <RI.key /> : plan.kind === 'index' ? <RI.bolt /> : plan.kind === 'scan' ? <RI.alert /> : <RI.list />;
  const estimate = (plan.kind === 'scan' && scanInfo && scanInfo.estimatedRows != null) ? scanInfo.estimatedRows : plan.estimate;
  const approx = plan.approx || (plan.kind === 'scan');
  return (
    <div style={{
      border: `1px solid var(--admin-status-${accent})`, borderRadius: 'var(--admin-radius)',
      background: 'var(--admin-surface)', overflow: 'hidden',
    }}>
      {/* head */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
        background: `var(--admin-status-${accent}-bg)`, borderBottom: `1px solid var(--admin-status-${accent})40`,
      }}>
        <span style={{ color: `var(--admin-status-${accent})`, display: 'flex' }}>{pathIcon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            Query plan — {plan.summary}
          </div>
          <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', marginTop: 1 }}>
            {plan.kind === 'scan'
              ? 'Ad-hoc filtering on an unindexed field is explicitly expensive. Confirm before running.'
              : plan.kind === 'list'
                ? 'Reads a page off the instances timeline. Reconciled by the integrity console.'
                : 'Runs against a maintained index — bounded cost.'}
          </div>
        </div>
        <CostTag cheap={plan.cheap} />
      </div>

      {/* body — plan facts in a dense grid */}
      <div style={{ padding: '12px 14px', display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, background: 'var(--admin-border-color)', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
          <PlanCell label="Access path">
            {plan.index
              ? <RLMono2 size="sm">{plan.path}</RLMono2>
              : <RLMono2 size="sm" muted>{plan.path}</RLMono2>}
          </PlanCell>
          <PlanCell label="Index">
            {plan.index
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RLMono2 size="sm">{plan.index}</RLMono2><RLBadge tone="neutral" uppercase>{plan.cardinality}</RLBadge></span>
              : <span style={{ fontSize: 12, color: 'var(--admin-status-caution)' }}>none</span>}
          </PlanCell>
          <PlanCell label="Complexity">
            <RLMono2 size="sm">{plan.complexity}</RLMono2>
          </PlanCell>
          <PlanCell label="Est. rows">
            <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 13, fontWeight: 700, color: plan.cheap ? 'var(--admin-text)' : 'var(--admin-status-caution)' }}>
              {approx ? '≈ ' : ''}{estimate.toLocaleString()}
            </span>
          </PlanCell>
        </div>

        {plan.predicate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <RLEyebrow>Predicate</RLEyebrow>
            <RLMono2 size="sm">{plan.predicate}</RLMono2>
          </div>
        )}

        {plan.kind === 'scan' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            background: 'var(--admin-status-caution-bg)', border: '1px solid var(--admin-status-caution)40',
            borderLeft: '3px solid var(--admin-status-caution)', borderRadius: 'var(--admin-radius-sm)',
          }}>
            <RI.alert size={14} />
            <span style={{ fontSize: 12, color: 'var(--admin-text-muted)', flex: 1 }}>
              {scanInfo
                ? <><RLMono2 size="sm">query.index</RLMono2> returned <RLMono2 size="sm">scan_required</RLMono2> — </>
                : null}
              Full scan of <RLMono2 size="sm">≈ {estimate.toLocaleString()}</RLMono2> keys.
              {plan.missingIndex && <> No index on <RLMono2 size="sm">{plan.missingIndex}</RLMono2>.</>}
            </span>
          </div>
        )}
      </div>

      {/* footer actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--admin-border-color)' }}>
        <RLMono2 size="sm" muted>
          {plan.kind === 'list' ? 'limit 50 · offset 0' : plan.cheap ? 'bounded · index-backed' : 'unbounded · O(N) keyspace walk'}
        </RLMono2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {plan.kind === 'scan' && (
            <RLBtn variant="secondary" size="md" iconLeft={<RI.plus />} onClick={onAddIndex} disabled={busy}>Add an index</RLBtn>
          )}
          {plan.kind === 'scan'
            ? <RLBtn variant="secondary" size="md" loading={busy} iconLeft={<RI.alert />} onClick={onRun} style={{ borderColor: 'var(--admin-status-caution)', color: 'var(--admin-status-caution)' }}>{ran ? 'Re-run full scan' : 'Run full scan anyway'}</RLBtn>
            : <RLBtn variant="primary" size="md" loading={busy} iconLeft={<RI.search />} onClick={onRun}>{ran ? 'Re-run' : 'Run query'}</RLBtn>}
        </div>
      </div>
    </div>
  );
}

function PlanCell({ label, children }) {
  return (
    <div style={{ background: 'var(--admin-bg)', padding: '8px 12px', display: 'grid', gap: 4 }}>
      <RLEyebrow style={{ color: 'var(--admin-text-muted)' }}>{label}</RLEyebrow>
      <div>{children}</div>
    </div>
  );
}

/* ── New record — atomic create that bumps the shared timeline ─────────────── */
function CreateRecord({ onClose, onCreated }) {
  const RI = window.RICONS;
  const toast = RLtoast();
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [status, setStatus] = React.useState('pending');
  const [busy, setBusy] = React.useState(false);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const nameOk = name.trim().length >= 1;
  const valid = emailOk && nameOk;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const res = await window.RSTORE.create({ email: email.trim(), name: name.trim(), status });
    setBusy(false);
    toast({
      tone: 'healthy', title: `Created ${res.record.custid}`,
      detail: `records.create · timeline +1 → ${res.countFast.toLocaleString()}${res.offline ? ' · simulated' : ''}`, mono: true,
    });
    onCreated(res);
    onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} />
      <div role="dialog" aria-label="New customer record" style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 101, width: 460, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--admin-surface)', border: '1px solid var(--admin-border-strong)', borderRadius: 'var(--admin-radius)', boxShadow: 'var(--otto-shadow-lg)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--admin-border-color)' }}>
          <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><RI.plus size={15} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>New Customer</div>
            <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}><RLMono2 size="sm" muted>HSET customer:{'{custid}'}:object</RLMono2></div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, border: '1px solid transparent', background: 'transparent', color: 'var(--admin-text-muted)', cursor: 'pointer', borderRadius: 'var(--admin-radius-sm)' }}><RI.x size={13} /></button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <Field label="email" hint="json_schema · format: email" invalid={email.length > 0 && !emailOk} msg="Must be a valid email.">
            <RLInput mono size="md" value={email} placeholder="new@example.com" invalid={email.length > 0 && !emailOk} style={{ width: '100%' }} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="name" hint="string · 1–255" invalid={name.length > 0 && !nameOk} msg="Required.">
            <RLInput size="md" value={name} placeholder="Full name" invalid={name.length > 0 && !nameOk} style={{ width: '100%' }} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="status" hint="enum · default pending">
            <RLSelect value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'pending' }, { value: 'active' }, { value: 'inactive' }]} />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--admin-surface-sunken)', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 9999, background: 'var(--admin-accent)', flex: 'none' }} />
            <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>custid is server-assigned · created_at / updated_at stamped · adds <RLMono2 size="sm">+1</RLMono2> to the instances timeline.</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--admin-border-color)', justifyContent: 'flex-end' }}>
          <RLBtn variant="secondary" size="md" onClick={onClose} disabled={busy}>Cancel</RLBtn>
          <RLBtn variant="primary" size="md" iconLeft={<RI.plus />} disabled={!valid} loading={busy} onClick={submit}>Create record</RLBtn>
        </div>
      </div>
    </>
  );
}

function Field({ label, hint, invalid, msg, children }) {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <RLMono2 size="md">{label}</RLMono2>
        {hint && <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 10, color: 'var(--admin-text-subtle)' }}>{hint}</span>}
      </div>
      {children}
      {invalid && <span style={{ fontSize: 11, color: 'var(--admin-status-broken)' }}>{msg}</span>}
    </div>
  );
}

/* Per-row action cluster, gated by descriptor.actions. */
function RowActions({ rec, actions, onOpen }) {
  const RI = window.RICONS;
  const [menu, setMenu] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const iconBtn = (icon, title, onClick, danger) => (
    <button type="button" title={title} aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24,
        border: '1px solid transparent', borderRadius: 'var(--admin-radius-sm)', background: 'transparent',
        color: danger ? 'var(--admin-status-broken)' : 'var(--admin-text-muted)', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--admin-surface-raised)'; e.currentTarget.style.borderColor = 'var(--admin-border-strong)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
    >{icon}</button>
  );

  const overflow = [];
  if (actions.includes('reveal')) overflow.push({ label: 'Reveal api_secret', icon: <RI.eye />, onClick: () => onOpen(rec.custid, 'reveal') });
  if (actions.includes('rebuild_index')) overflow.push({ label: 'Rebuild index entry', icon: <RI.refresh />, onClick: () => onOpen(rec.custid) });
  if (actions.includes('destroy')) overflow.push({ label: 'Destroy record', icon: <RI.trash />, danger: true, onClick: () => onOpen(rec.custid, 'destroy') });

  return (
    <div ref={ref} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, position: 'relative' }}>
      {actions.includes('read') && iconBtn(<RI.external size={13} />, 'Open record', () => onOpen(rec.custid))}
      {actions.includes('update') && iconBtn(<RI.edit size={13} />, 'Edit record', () => onOpen(rec.custid, 'edit'))}
      {overflow.length > 0 && iconBtn(<RI.more size={14} />, 'More actions', () => setMenu((m) => !m))}
      {menu && (
        <div style={{
          position: 'absolute', top: 26, right: 0, zIndex: 50, minWidth: 200,
          background: 'var(--admin-surface-raised)', border: '1px solid var(--admin-border-strong)',
          borderRadius: 'var(--admin-radius)', boxShadow: 'var(--otto-shadow-md)', padding: 4,
        }}>
          {overflow.map((o, i) => (
            <button key={i} type="button" onClick={(e) => { e.stopPropagation(); setMenu(false); o.onClick(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 28, padding: '0 8px',
                border: 'none', background: 'transparent', borderRadius: 'var(--admin-radius-sm)', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, textAlign: 'left',
                color: o.danger ? 'var(--admin-status-broken)' : 'var(--admin-text)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--admin-surface-sunken)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ display: 'flex', width: 14, color: o.danger ? 'var(--admin-status-broken)' : 'var(--admin-text-subtle)' }}>{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordList({ onOpen, offline, onOfflineChange }) {
  const RI = window.RICONS;
  const toast = RLtoast();
  const model = window.REC.CUSTOMER;

  const [all, setAll] = React.useState(() => window.REC.RECORDS.map((r) => ({ ...r })));
  const [counts, setCounts] = React.useState({ fast: window.REC.COUNT_FAST, scan: window.REC.COUNT_SCAN });
  const [loading, setLoading] = React.useState(true);

  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(null);   // the applied filter {plan, label, predicate}
  const [ranScan, setRanScan] = React.useState(false);
  const [scanInfo, setScanInfo] = React.useState(null); // backend scan_required confirmation
  const [busy, setBusy] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  const livePlan = React.useMemo(() => RLplan(query), [query]);

  // Load the page off the shared backend (records.list).
  const reload = React.useCallback(async () => {
    const res = await window.RSTORE.list();
    setAll(res.records);
    setCounts({ fast: res.countFast, scan: res.countScan });
    onOfflineChange(res.offline);
    setLoading(false);
  }, []);
  React.useEffect(() => { reload(); }, [reload]);

  // When the query is a scan, ask the backend to confirm scan_required + estimate.
  React.useEffect(() => {
    if (!query.trim() || livePlan.kind !== 'scan') { setScanInfo(null); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      const value = livePlan.predicate || query;
      const res = await window.RSTORE.query(livePlan, query.trim(), false);
      if (!alive) return;
      if (res.scanRequired) setScanInfo({ estimatedRows: res.estimatedRows, hint: res.hint });
      else setScanInfo(null);
    }, 380);
    return () => { alive = false; clearTimeout(t); };
  }, [query, livePlan]);

  // Rows: newest first, with the applied filter (if any).
  const rows = React.useMemo(() => {
    let list = [...all].sort((a, b) => b.created_at - a.created_at);
    if (active) list = list.filter(active.predicate);
    return list;
  }, [all, active]);

  const runQuery = async () => {
    const plan = RLplan(query);
    if (!query.trim()) { setActive(null); setRanScan(false); return; }
    setBusy(true);
    const force = plan.kind === 'scan';
    const res = await window.RSTORE.query(plan, query.trim(), force);
    setBusy(false);
    setActive({ predicate: plan.run(), label: plan.predicate, plan });
    if (plan.kind === 'scan') {
      setRanScan(true);
      toast({ tone: 'caution', title: 'Full scan executed', detail: `${plan.predicate} · walked ≈ ${(res.estimatedRows || counts.fast).toLocaleString()} keys${res.offline ? ' · simulated' : ''}`, mono: true });
    } else {
      toast({ tone: 'preview', title: plan.kind === 'key' ? 'Key lookup' : 'Index resolved', detail: `${plan.predicate} · ${plan.path}`, mono: true });
    }
  };
  const clearFilter = () => { setQuery(''); setActive(null); setRanScan(false); setScanInfo(null); };
  const addIndex = () => toast({ tone: 'preview', title: 'Index proposal queued', detail: `add_index :${livePlan.missingIndex || 'field'} → rebuild on next migration`, mono: true });

  const onCreated = (res) => {
    setAll((prev) => [res.record, ...prev.filter((r) => r.custid !== res.record.custid)]);
    setCounts({ fast: res.countFast, scan: res.countScan });
    clearFilter();
  };

  const showPlan = query.trim().length > 0;
  const pageCount = Math.max(1, Math.ceil(counts.scan / 50));

  // ── Table columns: the plain persisted fields, newest first ──────────────
  const columns = [
    { key: 'custid', header: 'custid', width: 150, render: (v) => <RLMono2 size="sm">{v}</RLMono2> },
    { key: 'email', header: 'email', width: 220, render: (v) => <RLMono2 size="sm" muted>{v}</RLMono2> },
    { key: 'name', header: 'name', render: (v) => <span style={{ fontSize: 13 }}>{v}</span> },
    { key: 'status', header: 'status', width: 120, render: (v) => <RLDot status={STATUS_TONE[v]} label={v} /> },
    { key: 'created_at', header: 'created_at', width: 210, align: 'left', render: (v) => (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
        <RLMono2 size="sm">{RLfmt(v).slice(0, 10)}</RLMono2>
        <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{window.RLIB.relTime(v)}</span>
      </span>
    ) },
    { key: '_a', header: '', width: 92, align: 'right', render: (v, r) => <RowActions rec={r} actions={model.actions} onOpen={onOpen} /> },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 64px', display: 'grid', gap: 16 }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><RI.table size={18} /></span>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Customer records</h1>
              <RLMono2 size="sm" muted>{model.key_pattern}</RLMono2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => onOpen('__models__')} title="Open the model definition" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                <RLEyebrow>Model</RLEyebrow>
                <RLSelect value="Customer" onChange={() => {}} options={[{ value: 'Customer' }, { value: 'Session' }, { value: 'ApiKey' }]} />
              </button>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
                <RLEyebrow>Records</RLEyebrow>
                <RLCount fast={counts.fast} exact={counts.scan} />
              </span>
              <button type="button" onClick={() => onOpen('__integrity__')} title="Reconcile counts in the integrity console"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 20, padding: '0 8px', background: 'transparent', border: '1px solid var(--admin-border-color)', borderRadius: 9999, cursor: 'pointer', color: 'var(--admin-text-muted)', fontFamily: 'inherit', fontSize: 11 }}>
                <span style={{ color: 'var(--admin-status-caution)', display: 'flex' }}><RI.shield size={12} /></span>
                {Math.max(0, counts.fast - counts.scan)} phantoms — reconcile
              </button>
            </div>
          </div>
          <RLBtn variant="primary" size="md" iconLeft={<RI.plus />} onClick={() => setCreateOpen(true)}>New record</RLBtn>
        </div>

        {/* ── Query bar ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 8px 0 12px',
            background: 'var(--admin-bg)', border: '1px solid var(--admin-border-strong)', borderRadius: 'var(--admin-radius)',
          }}>
            <span style={{ color: 'var(--admin-text-subtle)', display: 'flex' }}><RI.search size={15} /></span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runQuery(); }}
              placeholder="Filter — e.g. status active · alice@example.com · name Diaz · created after 2025-01"
              style={{ flex: 1, height: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--admin-text)', fontFamily: 'inherit', fontSize: 13 }}
            />
            {query && (
              <button type="button" onClick={clearFilter} aria-label="Clear" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', color: 'var(--admin-text-subtle)', cursor: 'pointer', borderRadius: 4 }}><RI.x size={13} /></button>
            )}
            <span style={{ width: 1, height: 18, background: 'var(--admin-border-color)' }} />
            <RLBtn variant={livePlan.cheap ? 'primary' : 'secondary'} size="md" onClick={runQuery} disabled={!query.trim() || busy} loading={busy} iconLeft={<RI.arrowRight />}>Run</RLBtn>
          </div>

          {showPlan && <QueryPlan plan={livePlan} ran={ranScan} busy={busy} counts={counts} scanInfo={scanInfo} onRun={runQuery} onAddIndex={addIndex} />}
        </div>

        {/* ── Result toolbar ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <RLEyebrow>{active ? 'Filtered' : 'All records'}</RLEyebrow>
          <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-text)' }}>{rows.length.toLocaleString()} {rows.length === 1 ? 'row' : 'rows'}</span>
          {active && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 22, padding: '0 6px 0 10px', background: `var(--admin-status-${active.plan.cheap ? 'preview' : 'caution'}-bg)`, border: `1px solid var(--admin-status-${active.plan.cheap ? 'preview' : 'caution'})40`, borderRadius: 9999 }}>
              <RLMono2 size="sm">{active.label}</RLMono2>
              <button type="button" onClick={clearFilter} aria-label="Clear filter" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, border: 'none', background: 'transparent', color: 'var(--admin-text-muted)', cursor: 'pointer', borderRadius: 9999 }}><RI.x size={11} /></button>
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--admin-text-subtle)' }}>Sorted by <RLMono2 size="sm" muted>created_at</RLMono2> desc · page 1 of {pageCount.toLocaleString()}</span>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <ClickableTable columns={columns} rows={rows} onOpen={onOpen} />
      </div>

      {createOpen && <CreateRecord onClose={() => setCreateOpen(false)} onCreated={onCreated} />}
    </div>
  );
}

/* DataTable doesn't expose row-click; wrap it and delegate clicks to the row's
 * custid via a data attribute, keeping the dense DS table styling intact. */
function ClickableTable({ columns, rows, onOpen }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const bodyRows = root.querySelectorAll('tbody tr');
    bodyRows.forEach((tr, i) => {
      tr.style.cursor = 'pointer';
      tr.onclick = () => { if (rows[i]) onOpen(rows[i].custid); };
      tr.onmouseenter = () => { tr.style.background = 'var(--admin-surface-sunken)'; };
      tr.onmouseleave = () => { tr.style.background = 'transparent'; };
    });
    return () => { bodyRows.forEach((tr) => { tr.onclick = null; tr.onmouseenter = null; tr.onmouseleave = null; }); };
  }, [rows, onOpen]);
  return <div ref={ref}><RLTable columns={columns} rows={rows} rowKey={(r) => r.custid} /></div>;
}

window.RecordList = RecordList;
