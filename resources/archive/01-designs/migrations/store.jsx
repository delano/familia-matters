/* migrations/store.jsx — the migration data layer, wired to the ONE shared
 * backend (window.familiaBackend → the Familia Admin shell's single StateModel).
 *
 * Every operation goes through the shared backend so the cockpit shares state
 * with every other screen: applying a migration that resolves a model's schema
 * drift clears the drift entry AND updates the model's stored schema digest in
 * the StateModel, so the Models detail and the drift card reconcile.
 *
 * Contract actions used here:
 *   migrations.status                       → { applied, pending }
 *   migrations.drift                        → [ { model, differences, … } ]
 *   migrations.run  { id, dry_run:true }    → a plan (no mutation)
 *   migrations.run  { id, dry_run:false, stream:true }
 *                                           → records-processed stream; moves
 *                                             id pending→applied, clears drift
 *   migrations.rollback { id }              → moves id applied→pending, restores drift
 *
 * A local mirror (seeded from window.MIG) keeps the screen responsive and lets
 * the prototype degrade gracefully when the backend is unreachable: the mirror
 * answers, `offline` is flagged, and the same transitions still animate.
 *
 * Exports window.MSTORE.
 */
(function () {
  const M = window.MIG;
  const RUN_TIER = 'permission:run_migrations';
  const READ_TIER = 'permission:read';

  // ── Local mirror (source of truth when offline; cache when online) ─────────
  const mirror = {
    applied: M.APPLIED.map((m) => ({ ...m })),
    pending: M.PENDING.map((m) => ({ ...m })),
    drift: M.DRIFT.map((d) => ({ ...d, differences: (d.differences || []).map((x) => ({ ...x })) })),
  };

  async function call(envelope) {
    if (!window.familiaBackend || typeof window.familiaBackend.request !== 'function') {
      throw new Error('no_backend');
    }
    return window.familiaBackend.request(envelope);
  }
  function isError(res, name) {
    return res && typeof res === 'object' && (name ? res.error === name : !!res.error);
  }
  function normMig(m) {
    if (!m || typeof m !== 'object') return null;
    return {
      id: m.id || m.migration || m.name,
      description: m.description || m.desc || '',
      reversible: m.reversible != null ? !!m.reversible : false,
      applied_at: m.applied_at != null ? m.applied_at : (m.at != null ? m.at : null),
      dependencies: Array.isArray(m.dependencies) ? m.dependencies : (Array.isArray(m.deps) ? m.deps : []),
    };
  }

  // ── status: applied + pending ──────────────────────────────────────────────
  async function status() {
    try {
      const res = await call({ action: 'migrations.status', tier: READ_TIER });
      if (isError(res)) throw new Error(res.error);
      const applied = (res && Array.isArray(res.applied) ? res.applied : []).map(normMig).filter(Boolean);
      const pending = (res && Array.isArray(res.pending) ? res.pending : []).map(normMig).filter(Boolean);
      if (applied.length || pending.length) {
        // Reconcile mirror with backend truth (backend already reflects prior
        // applies/rollbacks this session), but keep richer seed metadata.
        mirror.applied = applied.map((a) => ({ ...(findSeed(a.id) || {}), ...a }));
        mirror.pending = pending.map((p) => ({ ...(findSeed(p.id) || {}), ...p }));
      }
      return { applied: mirror.applied.slice(), pending: mirror.pending.slice(), offline: false };
    } catch (e) {
      return { applied: mirror.applied.slice(), pending: mirror.pending.slice(), offline: true };
    }
  }

  function findSeed(id) {
    return M.APPLIED.concat(M.PENDING).find((m) => m.id === id) || null;
  }

  // ── drift: schema drift per model ──────────────────────────────────────────
  async function drift() {
    try {
      const res = await call({ action: 'migrations.drift', tier: READ_TIER });
      const arr = Array.isArray(res) ? res : (res && Array.isArray(res.drift) ? res.drift : null);
      if (arr) {
        mirror.drift = arr.map((d) => ({
          model: d.model,
          changed: d.changed != null ? !!d.changed : ((d.differences || []).length > 0),
          stored_digest: d.stored_digest || d.stored || null,
          current_digest: d.current_digest || d.current || null,
          differences: Array.isArray(d.differences) ? d.differences : [],
          suggested_migration: d.suggested_migration || d.suggested || null,
        }));
      }
      return { drift: mirror.drift.slice(), offline: false };
    } catch (e) {
      return { drift: mirror.drift.slice(), offline: true };
    }
  }

  // ── dry-run: a plan, no mutation ────────────────────────────────────────────
  async function dryRun(id, tier) {
    const mig = mirror.pending.find((p) => p.id === id) || findSeed(id) || { id };
    const useTier = tier || RUN_TIER;
    try {
      const res = await call({ action: 'migrations.run', id, params: { id, dry_run: true }, tier: useTier });
      if (isError(res, 'forbidden')) {
        return { forbidden: true, required: res.required_tier || RUN_TIER, held: res.held || useTier, offline: false };
      }
      if (isError(res)) throw new Error(res.error);
      return { plan: M.normalizePlan(res, mig), offline: false };
    } catch (e) {
      if (useTier !== RUN_TIER) return { forbidden: true, required: RUN_TIER, held: useTier, offline: true };
      return { plan: M.planFor(mig), offline: true };
    }
  }

  // ── apply: stream + move pending→applied + clear drift ─────────────────────
  // Returns { events, offline } — the caller animates the events then calls
  // commitApply(id) once the animation settles, mirroring the Integrity flow.
  async function apply(id, plan, tier) {
    const mig = mirror.pending.find((p) => p.id === id) || findSeed(id) || { id };
    const useTier = tier || RUN_TIER;
    try {
      const res = await call({ action: 'migrations.run', id, params: { id, dry_run: false, stream: true }, tier: useTier });
      if (isError(res, 'forbidden')) {
        return { forbidden: true, required: res.required_tier || RUN_TIER, held: res.held || useTier, offline: false };
      }
      if (isError(res)) throw new Error(res.error);
      const arr = Array.isArray(res) ? res : (res && Array.isArray(res.events) ? res.events : (res && Array.isArray(res.stream) ? res.stream : null));
      const events = (arr && arr.length) ? arr : M.deriveStream(plan || M.planFor(mig), modelOf(mig));
      return { events, offline: false };
    } catch (e) {
      if (useTier !== RUN_TIER) return { forbidden: true, required: RUN_TIER, held: useTier, offline: true };
      return { events: M.deriveStream(plan || M.planFor(mig), modelOf(mig)), offline: true };
    }
  }

  function modelOf(mig) {
    const d = (mig && mig.description) || '';
    const m = d.match(/\b(Customer|Session|ApiKey)\b/);
    return m ? m[1] : 'Customer';
  }

  // Commit the local mirror after a successful apply animation: move the
  // migration pending→applied and clear the drift entry it resolves.
  function commitApply(id) {
    const i = mirror.pending.findIndex((p) => p.id === id);
    if (i >= 0) {
      const mig = mirror.pending[i];
      mirror.pending.splice(i, 1);
      mirror.applied = [{ ...mig, applied_at: M.NOW }, ...mirror.applied];
    }
    // Clear any drift entry this migration was the suggested fix for.
    mirror.drift = mirror.drift.map((d) =>
      d.suggested_migration === id
        ? { ...d, changed: false, differences: [], stored_digest: d.current_digest, suggested_migration: null }
        : d
    );
    return { applied: mirror.applied.slice(), pending: mirror.pending.slice(), drift: mirror.drift.slice() };
  }

  // ── rollback: move applied→pending, restore drift ──────────────────────────
  async function rollback(id, tier) {
    const useTier = tier || RUN_TIER;
    let offline = false;
    try {
      const res = await call({ action: 'migrations.rollback', id, params: { id }, tier: useTier });
      if (isError(res, 'forbidden')) {
        return { forbidden: true, required: res.required_tier || RUN_TIER, held: res.held || useTier, offline: false };
      }
      if (isError(res)) throw new Error(res.error);
    } catch (e) {
      offline = true;
      if (useTier !== RUN_TIER) return { forbidden: true, required: RUN_TIER, held: useTier, offline: true };
    }
    const i = mirror.applied.findIndex((a) => a.id === id);
    if (i >= 0) {
      const mig = mirror.applied[i];
      mirror.applied.splice(i, 1);
      mirror.pending = [{ ...mig, applied_at: null }, ...mirror.pending];
      // Reintroduce the drift this migration had resolved, if we know the model.
      const seedDrift = M.DRIFT.find((d) => d.suggested_migration === id);
      if (seedDrift && !mirror.drift.some((d) => d.model === seedDrift.model && d.changed)) {
        mirror.drift = mirror.drift.map((d) =>
          d.model === seedDrift.model
            ? { ...seedDrift, differences: seedDrift.differences.map((x) => ({ ...x })) }
            : d
        );
      }
    }
    return { applied: mirror.applied.slice(), pending: mirror.pending.slice(), drift: mirror.drift.slice(), offline };
  }

  // ── draftMigration: propose a reversible plan from a drift diff ─────────────
  function draftMigration(driftEntry) {
    const id = driftEntry.suggested_migration;
    const mig = mirror.pending.find((p) => p.id === id) || findSeed(id);
    const plan = mig ? M.planFor(mig) : {
      id: id || `draft_${driftEntry.model.toLowerCase()}_schema`,
      operation: 'schema_migration', from: driftEntry.stored_digest, to: driftEntry.current_digest,
      estimated_records: M.RECORD_COUNT, reversible: true, backup: true,
      description: `Reconcile ${driftEntry.model} schema drift`,
    };
    return { plan: { ...plan, reversible: true }, suggested_id: id, exists: !!mig };
  }

  window.MSTORE = {
    RUN_TIER, READ_TIER,
    status, drift, dryRun, apply, commitApply, rollback, draftMigration,
    get mirror() { return mirror; },
  };
})();
