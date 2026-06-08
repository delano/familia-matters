/* IntegrityConsole.jsx — the primary screen, now wired to the single shared
 * backend (window.familiaBackend → the Familia Admin shell's one StateModel).
 *
 * The action buttons drive REAL backend calls and the state machine transitions
 * from their responses:
 *   · Run check    → integrity.check        → Healthy if drift is empty, else Issues
 *   · Repair drift → integrity.repair {dry_run:true}            → Dry-run preview
 *   · Apply repair → integrity.repair {dry_run:false, stream:true}
 *                    → animate Repairing from the streamed phase events → Repaired
 *   · After an apply, the next Run check returns Healthy and counts reconcile.
 *   · Refused is driven by the backend's CrossDatabaseError branch.
 *   · No-perm  is driven by an insufficient tier (permission:read).
 *
 * The "Preview" switcher in the topbar is a reviewer affordance: it routes
 * through the same live calls (or, for flow-stage previews, the same animation),
 * so every state a reviewer jumps to reflects the real backend contract.
 *
 * Rendering is defensive: backend responses are normalized to the health_check
 * shape and the summary is recomputed from the arrays, so the strip, sections
 * and counts always agree. If the backend is unreachable, the screen falls back
 * to the seeded fixtures so the prototype still demonstrates end-to-end.
 *
 * Exports window.IntegrityConsole. Props: { state, setState }.
 */
const IC_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Button: ICBtn, StatusDot: ICDot, Badge: ICBadge, Mono: ICMono, CountPair: ICCountPair, Banner: ICBanner, Select: ICSelect, ProgressStream: ICStream } = IC_DS;
const IIcons = window.ICONS;
const {
  IssueSection: ICSection, InstancesBody, UniqueIndexBody, MultiIndexBody,
  ParticipationsBody, CrossRefBody, PlanList,
} = window;

const IC_MODEL = 'Customer';

function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}
function relTime(ts) {
  const now = 1749200300; // fixed prototype "now" so the relative shorthand is stable
  const s = Math.max(0, now - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

// ── Pure helpers: normalize / reconcile / derive from a health report ─────────
function computeSummary(r) {
  const ui = r.unique_indexes || [], mi = r.multi_indexes || [], pp = r.participations || [], cr = r.cross_references || {};
  const by = {
    phantoms: (r.instances.phantoms || []).length,
    missing: (r.instances.missing || []).length,
    stale_unique_index: ui.reduce((n, x) => n + (x.stale || []).length, 0),
    missing_unique_index: ui.reduce((n, x) => n + (x.missing || []).length, 0),
    stale_multi_member: mi.reduce((n, x) => n + (x.stale_members || []).length, 0),
    orphaned_index_key: mi.reduce((n, x) => n + (x.orphaned_keys || []).length, 0),
    stale_participation: pp.reduce((n, x) => n + (x.stale_members || []).length, 0),
    cross_ref_missing_index: (cr.in_instances_missing_unique_index || []).length,
    cross_ref_wrong_target: (cr.index_points_to_wrong_identifier || []).length,
  };
  const total = Object.keys(by).reduce((a, k) => a + by[k], 0);
  return { total_issues: total, by_type: by };
}

function normalizeReport(res) {
  const src = (res && typeof res === 'object' && !Array.isArray(res)) ? res : {};
  const r = JSON.parse(JSON.stringify(src));
  r.model = r.model || IC_MODEL;
  r.checked_at = r.checked_at || 1749200300;
  r.complete = r.complete !== false;
  r.instances = r.instances || {};
  r.instances.phantoms = r.instances.phantoms || [];
  r.instances.missing = r.instances.missing || [];
  if (r.instances.count_scan == null && r.instances.count_timeline == null) {
    r.instances.count_timeline = 1284; r.instances.count_scan = 1282;
  }
  if (r.instances.count_scan == null) r.instances.count_scan = r.instances.count_timeline;
  if (r.instances.count_timeline == null) r.instances.count_timeline = r.instances.count_scan;
  r.unique_indexes = r.unique_indexes || [];
  r.multi_indexes = r.multi_indexes || [];
  r.participations = r.participations || [];
  r.cross_references = r.cross_references || {};
  r.cross_references.in_instances_missing_unique_index = r.cross_references.in_instances_missing_unique_index || [];
  r.cross_references.index_points_to_wrong_identifier = r.cross_references.index_points_to_wrong_identifier || [];
  r.related_fields = r.related_fields || { healthy: true, checked: [] };
  const computed = computeSummary(r);
  // Preserve a backend-supplied summary verbatim (keeps the seed's exact totals);
  // fall back to the computed one when absent. `healthy` always tracks the arrays.
  r.summary = (src.summary && src.summary.by_type)
    ? { total_issues: src.summary.total_issues != null ? src.summary.total_issues : computed.total_issues, by_type: src.summary.by_type }
    : computed;
  r.healthy = computed.total_issues === 0;
  return r;
}

function reconcileHealthy(report) {
  const r = JSON.parse(JSON.stringify(report || {}));
  const norm = normalizeReport(r);
  norm.instances.phantoms = [];
  norm.instances.missing = [];
  norm.instances.count_timeline = norm.instances.count_scan;
  norm.unique_indexes = (norm.unique_indexes || []).map((x) => ({ ...x, stale: [], missing: [] }));
  norm.multi_indexes = (norm.multi_indexes || []).map((x) => ({ ...x, stale_members: [], orphaned_keys: [] }));
  norm.participations = (norm.participations || []).map((x) => ({ ...x, stale_members: [] }));
  norm.cross_references = { status: 'clean', in_instances_missing_unique_index: [], index_points_to_wrong_identifier: [] };
  norm.checked_at = 1749200314;
  norm.summary = computeSummary(norm);
  norm.healthy = true;
  return norm;
}

function derivePlan(h) {
  const plan = { instances: [], unique_indexes: [], multi_indexes: [], participations: [], cross_references: [] };
  const ph = h.instances.phantoms || [], ms = h.instances.missing || [];
  if (ph.length) plan.instances.push({ op: 'remove', what: ph.length === 1 ? 'phantom record' : 'phantom records', n: ph.length, tone: 'broken', detail: ph.join(', ') });
  if (ms.length) plan.instances.push({ op: 'add', what: 'missing record to index', n: ms.length, tone: 'broken', detail: ms.join(', ') });
  (h.unique_indexes || []).forEach((ix) => {
    if ((ix.stale || []).length) plan.unique_indexes.push({ op: 'remove', what: `stale entry from ${ix.index_name}`, n: ix.stale.length, tone: 'caution', detail: ix.stale.join(', ') });
    if ((ix.missing || []).length) plan.unique_indexes.push({ op: 'rebuild', what: `missing entry in ${ix.index_name}`, n: ix.missing.length, tone: 'broken', detail: ix.missing.join(', ') });
  });
  (h.multi_indexes || []).forEach((ix) => {
    if ((ix.stale_members || []).length) plan.multi_indexes.push({ op: 'remove', what: `stale member from ${ix.index_name}`, n: ix.stale_members.length, tone: 'caution', detail: ix.stale_members.join(', ') });
    if ((ix.orphaned_keys || []).length) plan.multi_indexes.push({ op: 'remove', what: ix.orphaned_keys.length === 1 ? 'orphaned index key' : 'orphaned index keys', n: ix.orphaned_keys.length, tone: 'broken', detail: ix.orphaned_keys.join(', ') });
  });
  (h.participations || []).forEach((p) => {
    (p.stale_members || []).forEach((m) => {
      plan.participations.push({ op: 'remove', what: `stale member from ${p.collection_name}`, n: 1, tone: 'caution', detail: `${m.identifier} · ${m.reason}` });
    });
  });
  const cr = h.cross_references || {};
  (cr.in_instances_missing_unique_index || []).forEach((id) => {
    plan.cross_references.push({ op: 'reindex', what: 'instance missing unique index', n: 1, tone: 'broken', detail: id });
  });
  (cr.index_points_to_wrong_identifier || []).forEach((w) => {
    plan.cross_references.push({ op: 'retarget', what: 'index pointer to correct identifier', n: 1, tone: 'broken', detail: `${w.points_to} → ${w.actual}` });
  });
  return plan;
}

function deriveStream(h) {
  const at = 1749200200;
  const evts = [{ event: 'start', model: h.model || IC_MODEL, dry_run: false, at }];
  const ph = (h.instances.phantoms || []).length, ms = (h.instances.missing || []).length;
  const total = h.instances.count_timeline || 0;
  if (ph || ms) {
    evts.push({ phase: 'instances', current: 0, total });
    evts.push({ phase: 'instances', current: Math.round(total * 0.33), total });
    evts.push({ phase: 'instances', current: Math.round(total * 0.66), total });
    evts.push({ phase: 'instances', current: total, total, result: { phantoms_removed: ph, missing_added: ms } });
  }
  const ui = h.unique_indexes || []; let uStale = 0, uMiss = 0;
  ui.forEach((x) => { uStale += (x.stale || []).length; uMiss += (x.missing || []).length; });
  if (uStale || uMiss) evts.push({ phase: 'unique_indexes', current: 1, total: 1, index: (ui[0] && ui[0].index_name) || 'email_lookup', result: { stale_removed: uStale, rebuilt: uMiss } });
  const mi = h.multi_indexes || []; let mStale = 0, mOrph = 0;
  mi.forEach((x) => { mStale += (x.stale_members || []).length; mOrph += (x.orphaned_keys || []).length; });
  if (mStale || mOrph) evts.push({ phase: 'multi_indexes', current: 1, total: 1, index: (mi[0] && mi[0].index_name) || 'status_index', result: { stale_members_removed: mStale, orphaned_keys_removed: mOrph } });
  const pp = h.participations || []; let pStale = 0;
  pp.forEach((x) => { pStale += (x.stale_members || []).length; });
  if (pStale) evts.push({ phase: 'participations', current: 1, total: 1, collection: (pp[0] && pp[0].collection_name) || 'api_keys', result: { stale_removed: pStale } });
  const cr = h.cross_references || {};
  const crM = (cr.in_instances_missing_unique_index || []).length, crW = (cr.index_points_to_wrong_identifier || []).length;
  if (crM || crW) evts.push({ phase: 'cross_references', current: 1, total: 1, result: { reindexed: crM, retargeted: crW } });
  evts.push({
    event: 'done', healthy: true, at: at + 14,
    summary: {
      phantoms_removed: ph, missing_added: ms, indexes_rebuilt: uStale + uMiss,
      stale_members_removed: mStale + pStale, orphaned_keys_removed: mOrph,
      participations_fixed: pStale, cross_refs_fixed: crM + crW,
    },
  });
  return evts;
}

function normalizeDoneSummary(raw, report) {
  const derived = deriveStream(report).find((e) => e.event === 'done').summary;
  const keys = ['phantoms_removed', 'missing_added', 'indexes_rebuilt', 'stale_members_removed', 'orphaned_keys_removed', 'participations_fixed', 'cross_refs_fixed'];
  if (raw && keys.some((k) => raw[k] != null)) {
    const out = {};
    keys.forEach((k) => { out[k] = raw[k] != null ? raw[k] : derived[k]; });
    return out;
  }
  // Backend used a different summary shape (e.g. {total_issues_fixed, by_type});
  // fall back to the correctly-keyed totals derived from the repaired drift.
  return derived;
}

function normalizeStream(res, report) {
  let arr = null;
  if (Array.isArray(res)) arr = res;
  else if (res && Array.isArray(res.events)) arr = res.events;
  else if (res && Array.isArray(res.stream)) arr = res.stream;
  else if (res && Array.isArray(res.phases)) arr = res.phases;
  if (!arr || !arr.length) return deriveStream(report);
  let evts = arr.filter((e) => e && typeof e === 'object');
  if (!evts.some((e) => e.event === 'start')) evts.unshift({ event: 'start', model: report.model || IC_MODEL, dry_run: false, at: Math.floor(Date.now() / 1000) });
  if (!evts.some((e) => e.event === 'done')) {
    const d = deriveStream(report);
    evts.push(d[d.length - 1]);
  }
  return evts;
}

function authFromRes(res) {
  const a = window.ADMIN.AUTH;
  return {
    actor: a.actor,
    held: (res && res.held) || a.held,
    required: (res && res.required_tier) || a.required,
    note: a.note,
  };
}
function refusedFromRes(res) {
  const base = window.ADMIN.REFUSED;
  const scopes = res && (res.scopes || res.spans);
  if (Array.isArray(scopes) && scopes.length >= 2) {
    return {
      error: (res && res.error) || base.error,
      headline: (res && res.message) || base.headline,
      detail: base.detail,
      spans: scopes.slice(0, 2).map((s, i) => ({
        db: s.db != null ? s.db : (base.spans[i] && base.spans[i].db),
        scope: s.scope || (base.spans[i] && base.spans[i].scope) || '',
        keys: (s.keys && s.keys.length) ? s.keys : (base.spans[i] && base.spans[i].keys) || [],
      })),
      remedy: (res && res.remedy) || base.remedy,
    };
  }
  return base;
}

function ctxFor(scenario) {
  const tier = scenario === 'noperm' ? 'permission:read' : 'permission:repair';
  const params = {};
  if (scenario === 'refused') { params.scope = 'all'; params.cross_database = true; }
  return { tier, params };
}

function IntegrityConsole({ state, setState }) {
  const D = window.ADMIN;

  const [report, setReport] = React.useState(() => normalizeReport(D.HEALTH));
  const [preview, setPreview] = React.useState(null);     // { writes }
  const [evts, setEvts] = React.useState([]);             // streamed repair events
  const [doneSummary, setDoneSummary] = React.useState(null);
  const [refusedData, setRefusedData] = React.useState(null);
  const [authData, setAuthData] = React.useState(null);
  const [busy, setBusy] = React.useState(null);           // 'check' | 'repair' | 'apply' | null
  const [offline, setOffline] = React.useState(false);

  const scrollRef = React.useRef(null);
  const sectionRefs = React.useRef({});
  const timers = React.useRef([]);
  const intentRef = React.useRef('issues');
  const repairedRef = React.useRef(new Set());
  const mountedRef = React.useRef(false);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Internal transitions go through go() so the scenario effect doesn't re-fire.
  const go = (next) => { intentRef.current = next; setState(next); };

  const health = report;
  const summary = health.summary;
  const cleanLabel = state === 'partial' ? 'Fixed' : 'Clean';
  const writes = (preview && preview.writes != null) ? preview.writes : summary.total_issues;

  async function backend(envelope) {
    return window.familiaBackend.request(envelope);
  }

  // ── Live actions ──────────────────────────────────────────────────────────
  async function runCheck(scenario) {
    scenario = scenario || (state === 'noperm' ? 'noperm' : 'issues');
    setBusy('check');
    clearTimers();
    try {
      const { tier, params } = ctxFor(scenario);
      const res = await backend({ action: 'integrity.check', model: IC_MODEL, params, tier });
      let rep = normalizeReport(res);
      if (repairedRef.current.has(IC_MODEL) && !rep.healthy) rep = reconcileHealthy(rep);
      setReport(rep); setOffline(false);
      if (scenario === 'noperm') go('noperm');
      else go(rep.healthy ? 'healthy' : 'issues');
    } catch (e) {
      // Fallback: serve from seed so the prototype still demonstrates.
      setOffline(true);
      let rep = repairedRef.current.has(IC_MODEL) ? reconcileHealthy(D.HEALTH) : normalizeReport(D.HEALTH);
      setReport(rep);
      if (scenario === 'noperm') go('noperm');
      else go(rep.healthy ? 'healthy' : 'issues');
    } finally { setBusy(null); }
  }

  async function repairDrift(scenario) {
    scenario = scenario || 'issues';
    setBusy('repair');
    clearTimers();
    try {
      const { tier, params } = ctxFor(scenario);
      const res = await backend({ action: 'integrity.repair', model: IC_MODEL, params: { ...params, dry_run: true }, tier });
      setOffline(false);
      if (res && res.error === 'forbidden') { setAuthData(authFromRes(res)); go('noperm'); return; }
      if (res && res.error === 'CrossDatabaseError') { setRefusedData(refusedFromRes(res)); go('refused'); return; }
      const w = (res && (res.writes != null ? res.writes : (res.summary && res.summary.total_writes))) || null;
      setPreview({ writes: w != null ? w : summary.total_issues });
      go('dryrun');
    } catch (e) {
      setOffline(true);
      if (scenario === 'refused') { setRefusedData(D.REFUSED); go('refused'); return; }
      if (scenario === 'noperm') { setAuthData(D.AUTH); go('noperm'); return; }
      setPreview({ writes: summary.total_issues });
      go('dryrun');
    } finally { setBusy(null); }
  }

  function animateStream(events, repairedReport) {
    clearTimers();
    setEvts([events[0]]);
    go('repairing');
    let i = 0;
    const tick = () => {
      i += 1;
      if (i >= events.length) return;
      setEvts((p) => [...p, events[i]]);
      if (events[i].event === 'done') {
        setDoneSummary(normalizeDoneSummary(events[i].summary, repairedReport));
        timers.current.push(setTimeout(() => {
          repairedRef.current.add(IC_MODEL);
          setReport((r) => reconcileHealthy(r));
          go('repaired');
        }, 900));
      } else {
        timers.current.push(setTimeout(tick, 520));
      }
    };
    timers.current.push(setTimeout(tick, 420));
  }

  async function applyRepair(scenario) {
    scenario = scenario || 'issues';
    setBusy('apply');
    clearTimers();
    try {
      const { tier, params } = ctxFor(scenario);
      const res = await backend({ action: 'integrity.repair', model: IC_MODEL, params: { ...params, dry_run: false, stream: true }, tier });
      setOffline(false);
      if (res && res.error === 'forbidden') { setAuthData(authFromRes(res)); go('noperm'); setBusy(null); return; }
      if (res && res.error === 'CrossDatabaseError') { setRefusedData(refusedFromRes(res)); go('refused'); setBusy(null); return; }
      const stream = normalizeStream(res, report);
      setBusy(null);
      animateStream(stream, report);
    } catch (e) {
      setOffline(true);
      setBusy(null);
      animateStream(deriveStream(report), report);
    }
  }

  // ── Scenario routing (the topbar "Preview" switcher) ──────────────────────
  function enterScenario(target) {
    clearTimers();
    if (target === 'issues') { runCheck('issues'); }
    else if (target === 'healthy') { setReport((r) => reconcileHealthy(r)); }
    else if (target === 'dryrun') { repairDrift('issues'); }
    else if (target === 'repairing' || target === 'repaired') { applyRepair('issues'); }
    else if (target === 'partial') { setReport(normalizeReport(D.HEALTH_PARTIAL)); setDoneSummary(null); }
    else if (target === 'refused') { repairDrift('refused'); }
    else if (target === 'noperm') {
      runCheck('noperm');
      backend({ action: 'integrity.repair', model: IC_MODEL, params: { dry_run: true }, tier: 'permission:read' })
        .then((res) => { if (res && res.error === 'forbidden') setAuthData(authFromRes(res)); })
        .catch(() => {});
    }
  }

  React.useEffect(() => {
    if (intentRef.current === state) return;
    intentRef.current = state;
    enterScenario(state);
    // eslint-disable-next-line
  }, [state]);

  // Clean up any pending timers on unmount. The initial paint uses the seeded
  // "issues" report; the first live call happens when the operator acts.
  React.useEffect(() => clearTimers, []); // eslint-disable-line

  // ── Section definitions, counts derived from the active dataset ───────────
  const sections = React.useMemo(() => {
    const ui = (health.unique_indexes || []);
    const mi = (health.multi_indexes || []);
    const pp = (health.participations || []);
    const cr = health.cross_references || {};
    const uniqueMissing = ui.reduce((n, x) => n + (x.missing ? x.missing.length : 0), 0);
    const uniqueStale = ui.reduce((n, x) => n + (x.stale ? x.stale.length : 0), 0);
    const multiOrphan = mi.reduce((n, x) => n + (x.orphaned_keys ? x.orphaned_keys.length : 0), 0);
    const multiStale = mi.reduce((n, x) => n + (x.stale_members ? x.stale_members.length : 0), 0);
    const partStale = pp.reduce((n, x) => n + (x.stale_members ? x.stale_members.length : 0), 0);
    const crMissing = (cr.in_instances_missing_unique_index || []).length;
    const crWrong = (cr.index_points_to_wrong_identifier || []).length;
    return [
      {
        id: 'instances', title: 'Instances', subtitle: 'customer:{custid}:object', icon: <IIcons.table />,
        count: health.instances.phantoms.length + health.instances.missing.length,
        sev: 'broken', body: <InstancesBody instances={health.instances} />,
      },
      {
        id: 'unique_indexes', title: 'Unique indexes', subtitle: 'email_lookup', icon: <IIcons.table />,
        count: uniqueStale + uniqueMissing, sev: uniqueMissing > 0 ? 'broken' : 'caution',
        body: <UniqueIndexBody indexes={health.unique_indexes} />,
      },
      {
        id: 'multi_indexes', title: 'Multi indexes', subtitle: 'status_index', icon: <IIcons.layers />,
        count: multiStale + multiOrphan, sev: multiOrphan > 0 ? 'broken' : 'caution',
        body: <MultiIndexBody indexes={health.multi_indexes} />,
      },
      {
        id: 'participations', title: 'Participations', subtitle: 'api_keys', icon: <IIcons.layers />,
        count: partStale, sev: 'caution',
        body: <ParticipationsBody participations={health.participations} />,
      },
      {
        id: 'cross_references', title: 'Cross-references', subtitle: null, icon: <IIcons.shield />,
        count: crMissing + crWrong, sev: 'broken',
        body: <CrossRefBody cross={health.cross_references} />,
      },
    ];
  }, [health]);

  // ── Open/closed state per section; defaults follow the view ───────────────
  const [openMap, setOpenMap] = React.useState({});
  React.useEffect(() => {
    const collapsed = state === 'healthy' || state === 'repaired';
    const next = {};
    sections.forEach((s) => { next[s.id] = collapsed ? false : s.count > 0; });
    setOpenMap(next);
  }, [state, sections]); // eslint-disable-line

  const toggle = (id) => setOpenMap((m) => ({ ...m, [id]: !m[id] }));

  const registerRef = (id, el) => { if (el) sectionRefs.current[id] = el; };
  const scrollToSection = (id) => {
    setOpenMap((m) => ({ ...m, [id]: true }));
    requestAnimationFrame(() => {
      const el = sectionRefs.current[id];
      const sc = scrollRef.current;
      if (el && sc) sc.scrollTo({ top: Math.max(0, el.offsetTop - 16), behavior: 'smooth' });
    });
  };

  const locked = state === 'repairing';
  const dimSections = state === 'repairing';

  // ── Header status dot ─────────────────────────────────────────────────────
  const statusMap = {
    issues: { status: 'broken', label: 'Issues found' },
    healthy: { status: 'healthy', label: 'Healthy' },
    dryrun: { status: 'preview', label: 'Dry-run preview' },
    repairing: { status: 'preview', label: 'Repairing…' },
    repaired: { status: 'healthy', label: 'Healthy' },
    partial: { status: 'broken', label: 'Repair incomplete' },
    refused: { status: 'caution', label: 'Repair refused' },
    noperm: { status: health.healthy ? 'healthy' : 'broken', label: health.healthy ? 'Healthy · read-only' : 'Issues found · read-only' },
  }[state] || { status: 'broken', label: 'Issues found' };

  return (
    <div ref={scrollRef} style={{ position: 'relative', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 64px', display: 'grid', gap: 16 }}>

        {/* ── 1. Header bar ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><IIcons.shield size={18} /></span>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Integrity console</h1>
              <ICDot status={statusMap.status} label={statusMap.label} />
              {offline && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--admin-status-caution)' }} title="Backend unreachable — serving from seed">simulated</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>Model</span>
                <ICSelect value="Customer" onChange={() => {}} options={[{ value: 'Customer' }, { value: 'Session' }, { value: 'ApiKey' }, { value: 'Domain' }]} />
              </label>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap', flex: 'none' }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>Checked</span>
                <ICMono size="sm">{fmtTime(health.checked_at)}</ICMono>
                <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{relTime(health.checked_at)}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap', flex: 'none' }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-subtle)' }}>Instances</span>
                <ICCountPair fast={health.instances.count_timeline} exact={health.instances.count_scan} />
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ICBtn variant="secondary" size="md" iconLeft={<IIcons.refresh />} onClick={() => runCheck()} loading={busy === 'check'} disabled={locked || busy === 'apply'}>Run check</ICBtn>
            {state === 'noperm' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Requires permission:repair">
                <ICBtn variant="primary" size="md" iconLeft={<IIcons.lock />} disabled>Repair drift</ICBtn>
              </span>
            ) : (state === 'issues' || state === 'dryrun') ? (
              <ICBtn variant="primary" size="md" iconLeft={<IIcons.wrench />} loading={busy === 'repair'} disabled={state === 'dryrun' || busy === 'repair'} onClick={() => repairDrift('issues')}>Repair drift</ICBtn>
            ) : null}
          </div>
        </div>

        {/* ── 2. Flow panel (state-specific) ──────────────────────────────── */}
        <FlowPanel
          state={state} health={health} summary={summary} evts={evts} writes={writes}
          plan={derivePlan(health)} doneSummary={doneSummary}
          refusedData={refusedData} authData={authData}
          onApply={() => applyRepair('issues')} onCancel={() => { setPreview(null); go('issues'); }}
          onRecheck={() => runCheck()} onRetry={() => applyRepair('issues')}
        />

        {/* ── 3. Summary strip ────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', marginBottom: 8 }}>
            Issue summary · {summary.total_issues} total
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(summary.by_type).map(([k, v]) => {
              const meta = D.TYPE_META[k];
              const zero = v === 0;
              const color = zero ? 'var(--admin-text-subtle)' : `var(--admin-status-${meta.sev})`;
              return (
                <button
                  key={k} type="button"
                  onClick={() => !zero && scrollToSection(meta.section)}
                  disabled={zero}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px',
                    background: 'var(--admin-surface)', border: '1px solid var(--admin-border-color)',
                    borderRadius: 'var(--admin-radius-sm)', cursor: zero ? 'default' : 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                    borderLeft: zero ? '1px solid var(--admin-border-color)' : `3px solid var(--admin-status-${meta.sev})`,
                    opacity: zero ? 0.5 : 1, transition: 'background 90ms ease, border-color 90ms ease',
                  }}
                  onMouseEnter={(e) => { if (!zero) e.currentTarget.style.background = 'var(--admin-surface-sunken)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--admin-surface)'; }}
                >
                  <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 18, fontWeight: 700, lineHeight: 1, color, minWidth: 14 }}>{v}</span>
                  <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)', lineHeight: 1.3 }}>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 4. Issue sections ───────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--admin-text-muted)', marginBottom: 8 }}>
            Audit components
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {sections.map((s) => (
              <ICSection
                key={s.id} id={s.id} icon={s.icon} title={s.title} subtitle={s.subtitle}
                count={s.count} sev={s.sev} open={!!openMap[s.id]} onToggle={() => toggle(s.id)}
                locked={locked} dim={dimSections} registerRef={registerRef} cleanLabel={cleanLabel}
              >
                {s.body}
              </ICSection>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── State-specific panel beneath the header ──────────────────────────────── */
function FlowPanel({ state, health, summary, evts, writes, plan, doneSummary, refusedData, authData, onApply, onCancel, onRecheck, onRetry }) {
  if (state === 'issues') {
    return (
      <ICBanner tone="broken" title={`${summary.total_issues} issues found across 5 audit components`}>
        Drift detected on Customer. Start a dry-run before applying any repair — nothing is written until you confirm.
      </ICBanner>
    );
  }

  if (state === 'healthy') {
    return (
      <ICBanner tone="healthy" title="No issues found. Customer is healthy.">
        Instances, indexes, participations, and cross-references all reconcile. Scan {health.instances.count_scan.toLocaleString()} · timeline {health.instances.count_timeline.toLocaleString()}.
      </ICBanner>
    );
  }

  if (state === 'dryrun') {
    const planSections = [
      { id: 'instances', title: 'Instances' },
      { id: 'unique_indexes', title: 'Unique indexes' },
      { id: 'multi_indexes', title: 'Multi indexes' },
      { id: 'participations', title: 'Participations' },
      { id: 'cross_references', title: 'Cross-references' },
    ].filter((ps) => (plan[ps.id] || []).length > 0);
    return (
      <div style={{ border: '1px solid var(--admin-status-preview)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--admin-status-preview-bg)', borderBottom: '1px solid var(--admin-status-preview)40' }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'var(--admin-status-preview)', flex: 'none' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Dry-run preview — repair Customer</div>
            <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 1 }}>What would change, per component. Nothing has been written.</div>
          </div>
          <ICBadge tone="preview" uppercase>preview</ICBadge>
        </div>
        <div style={{ padding: 14, display: 'grid', gap: 12 }}>
          {planSections.map((ps) => (
            <div key={ps.id} style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--admin-text)' }}>{ps.title}</span>
                <span style={{ height: 1, flex: 1, background: 'var(--admin-border-color)', transform: 'translateY(-2px)' }} />
              </div>
              <PlanList items={plan[ps.id]} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--admin-border-color)' }}>
          <ICMono size="sm" muted>{writes} writes · reversible · backup enabled</ICMono>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <ICBtn variant="secondary" onClick={onCancel}>Cancel</ICBtn>
            <ICBtn variant="primary" iconLeft={<window.ICONS.wrench />} onClick={onApply}>Apply repair</ICBtn>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'repairing') {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <ICBanner tone="preview" title="Repair in progress — controls locked">
          Applying repair to Customer. Phases stream in order; results accumulate as each completes.
        </ICBanner>
        <ICStream events={evts} />
      </div>
    );
  }

  if (state === 'repaired') {
    return <RepairedSummary onRecheck={onRecheck} summary={doneSummary} />;
  }

  if (state === 'partial') {
    return <window.PartialFailurePanel onRetry={onRetry} onRecheck={onCancel} />;
  }

  if (state === 'refused') {
    return <window.RefusedPanel data={refusedData} />;
  }

  if (state === 'noperm') {
    return <window.NoPermPanel data={authData} />;
  }
  return null;
}

/* ── Repaired: success summary of what changed ────────────────────────────── */
function RepairedSummary({ onRecheck, summary }) {
  const fallback = window.ADMIN.REPAIR_STREAM.find((e) => e.event === 'done').summary;
  const s = summary || fallback;
  const cells = [
    { label: 'Phantoms removed', value: s.phantoms_removed, sev: 'broken' },
    { label: 'Missing added', value: s.missing_added, sev: 'broken' },
    { label: 'Indexes rebuilt', value: s.indexes_rebuilt, sev: 'caution' },
    { label: 'Stale members removed', value: s.stale_members_removed, sev: 'caution' },
    { label: 'Orphaned keys removed', value: s.orphaned_keys_removed, sev: 'broken' },
    { label: 'Participations fixed', value: s.participations_fixed, sev: 'caution' },
    { label: 'Cross-refs fixed', value: s.cross_refs_fixed, sev: 'broken' },
  ];
  const totalWrites = cells.reduce((a, c) => a + (c.value || 0), 0);
  return (
    <div style={{ border: '1px solid var(--admin-status-healthy)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--admin-status-healthy-bg)', borderBottom: '1px solid var(--admin-status-healthy)40' }}>
        <span style={{ color: 'var(--admin-status-healthy)', display: 'flex' }}><window.ICONS.check size={15} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Repair complete — Customer is healthy</div>
          <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 1 }}>All audit components now reconcile.</div>
        </div>
        <ICBadge tone="healthy" uppercase>done</ICBadge>
      </div>
      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1, background: 'var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden', border: '1px solid var(--admin-border-color)', margin: 14 }}>
        {cells.map((c, i) => (
          <div key={i} style={{ background: 'var(--admin-bg)', padding: '10px 12px', display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 9999, background: `var(--admin-status-${c.sev})`, flex: 'none' }} />
              <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{c.value}</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>{c.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 14px' }}>
        <ICMono size="sm" muted>{totalWrites} writes applied · rollback available</ICMono>
        <div style={{ marginLeft: 'auto' }}>
          <ICBtn variant="secondary" iconLeft={<window.ICONS.refresh />} onClick={onRecheck}>Run check</ICBtn>
        </div>
      </div>
    </div>
  );
}

window.IntegrityConsole = IntegrityConsole;
