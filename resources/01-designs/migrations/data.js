/* migrations/data.js — seed + derivation helpers for the Migration cockpit.
 *
 * Plain JS (no JSX). Loaded with <script src> so window.MIG is available before
 * Babel runs. The seed mirrors the backend's migrations block so the screen
 * degrades to identical data when window.familiaBackend is unreachable.
 *
 * The backend (the one shared StateModel) is the source of truth; these helpers
 * only (a) provide the offline fallback and (b) NORMALIZE / ENRICH whatever the
 * LLM-backed backend returns into the fixed shapes the UI renders — the same
 * defensive-normalization strategy the Integrity console uses.
 */
(function () {
  const NOW = 1749200300; // fixed prototype "now" — matches the other screens

  // ── Seed: the migrations block of the shared StateModel ────────────────────
  const APPLIED = [
    { id: '20260101_add_status_field', applied_at: 1735689600, description: 'Add status to Customer', reversible: true },
    { id: '20260318_backfill_login_count', applied_at: 1742256000, description: 'Backfill Customer#login_count from event log', reversible: false },
  ];

  const PENDING = [
    { id: '20260520_rename_fullname_to_name', description: 'Rename Customer#fullname to #name', reversible: true, dependencies: ['20260101_add_status_field'] },
    { id: '20260603_reencrypt_api_secret_v2', description: 'Re-encrypt Customer#api_secret under key v2', reversible: false, dependencies: [] },
  ];

  const DRIFT = [
    {
      model: 'Customer', changed: true,
      stored_digest: 'sha256:8a1c4e2f9b07d3a6', current_digest: 'sha256:91f4cc70ab12de58',
      differences: [
        { field: 'fullname', change: 'removed' },
        { field: 'name', change: 'added' },
        { field: 'updated_at', change: 'added' },
      ],
      suggested_migration: '20260520_rename_fullname_to_name',
    },
    {
      model: 'Session', changed: false,
      stored_digest: 'sha256:55de1188aa0c2f31', current_digest: 'sha256:55de1188aa0c2f31',
      differences: [],
    },
  ];

  // Timeline count for the affected model — used as "estimated records" in plans.
  const RECORD_COUNT = 1284;

  // ── Plan derivation ────────────────────────────────────────────────────────
  // A dry-run returns "a plan" (operation, from/to, estimated records, reversible,
  // backup enabled). The backend may phrase this differently; we derive a stable
  // plan from the migration's id/description and merge anything the backend gives.
  function planFor(mig) {
    const id = (mig && mig.id) || '';
    let op = 'data_migration', from = null, to = null;
    if (/rename/.test(id)) {
      op = 'rename_field';
      from = 'Customer#fullname';
      to = 'Customer#name';
    } else if (/reencrypt|re_encrypt|encrypt/.test(id)) {
      op = 'reencrypt_field';
      from = 'api_secret · key v1';
      to = 'api_secret · key v2';
    } else if (/backfill/.test(id)) {
      op = 'backfill_field';
      from = 'event log';
      to = 'Customer#login_count';
    } else if (/add_/.test(id)) {
      op = 'add_field';
      from = '∅';
      to = (id.match(/add_(\w+?)_field/) || [])[1] || 'field';
    }
    return {
      id,
      operation: op,
      from,
      to,
      estimated_records: RECORD_COUNT,
      reversible: !!(mig && mig.reversible),
      backup: true,
      description: (mig && mig.description) || '',
    };
  }

  // Merge a backend-returned plan onto the derived one, keeping the fixed shape.
  function normalizePlan(res, mig) {
    const base = planFor(mig);
    if (!res || typeof res !== 'object' || Array.isArray(res)) return base;
    const p = res.plan && typeof res.plan === 'object' ? res.plan : res;
    const out = { ...base };
    if (p.operation) out.operation = p.operation;
    if (p.op) out.operation = p.op;
    if (p.from != null) out.from = p.from;
    if (p.to != null) out.to = p.to;
    if (p.estimated_records != null) out.estimated_records = p.estimated_records;
    else if (p.estimated_rows != null) out.estimated_records = p.estimated_rows;
    else if (p.records != null) out.estimated_records = p.records;
    if (p.reversible != null) out.reversible = !!p.reversible;
    if (p.backup != null) out.backup = !!p.backup;
    else if (p.backup_enabled != null) out.backup = !!p.backup_enabled;
    return out;
  }

  // ── Stream derivation ──────────────────────────────────────────────────────
  // migrations.run {dry_run:false, stream:true} emits records-processed phase
  // events. We render them through the SAME ProgressStream component the repair
  // flow uses, so the event shape matches: start → phase rows → done.
  function phasesFor(plan) {
    if (plan.operation === 'reencrypt_field') return ['scan', 'decrypt', 'reencrypt', 'verify'];
    if (plan.operation === 'rename_field') return ['scan', 'rewrite', 'reindex', 'verify'];
    if (plan.operation === 'backfill_field') return ['scan', 'compute', 'write', 'verify'];
    return ['scan', 'apply', 'verify'];
  }

  function deriveStream(plan, model) {
    const total = plan.estimated_records || RECORD_COUNT;
    const phases = phasesFor(plan);
    const at = NOW;
    const evts = [{ event: 'start', model: model || 'Customer', migration: plan.id, dry_run: false, at }];
    phases.forEach((phase) => {
      evts.push({ phase, current: 0, total });
      evts.push({ phase, current: Math.round(total * 0.4), total });
      evts.push({ phase, current: Math.round(total * 0.8), total });
      evts.push({ phase, current: total, total, result: { processed: total } });
    });
    evts.push({
      event: 'done', healthy: true, at: at + phases.length * 3,
      summary: { records_processed: total, phases: phases.length, reversible: plan.reversible, backup: plan.backup ? 'written' : 'skipped' },
    });
    return evts;
  }

  // A partial-failure stream: the migration commits the early phases, then a
  // later phase aborts mid-way on a record-level error and rolls itself back.
  function derivePartialStream(plan, model) {
    const total = plan.estimated_records || RECORD_COUNT;
    const phases = phasesFor(plan);
    const failAt = Math.max(1, phases.length - 1); // the verify-prior phase fails
    const at = NOW;
    const evts = [{ event: 'start', model: model || 'Customer', migration: plan.id, dry_run: false, at }];
    for (let i = 0; i < failAt; i++) {
      const phase = phases[i];
      evts.push({ phase, current: 0, total });
      evts.push({ phase, current: total, total, result: { processed: total } });
    }
    const failPhase = phases[failAt];
    const stopped = Math.round(total * 0.62);
    evts.push({ phase: failPhase, current: 0, total });
    evts.push({ phase: failPhase, current: stopped, total, error: true });
    evts.push({
      event: 'failed', at: at + 6, failed_phase: failPhase,
      error_code: plan.operation === 'reencrypt_field' ? 'KEY_UNAVAILABLE' : 'CONSTRAINT_VIOLATION',
      processed: stopped, total,
    });
    return { events: evts, failPhase, stopped, total };
  }

  function fmtCount(n) {
    return (n == null ? 0 : n).toLocaleString();
  }

  window.MIG = {
    NOW, RECORD_COUNT,
    APPLIED, PENDING, DRIFT,
    planFor, normalizePlan, phasesFor, deriveStream, derivePartialStream, fmtCount,
  };
})();
