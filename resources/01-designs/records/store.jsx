/* records/store.jsx — the records data layer, wired to the ONE shared backend.
 *
 * Every record operation goes through window.familiaBackend.request(envelope),
 * which (inside the Familia Admin shell) bridges to the single backend instance
 * the shell hosts — so the Customer record screens and the Integrity console
 * share one StateModel. The contract actions used here:
 *
 *   records.list    {model}                 → page of records + count_fast
 *   records.read    {model, id}             → one record
 *   records.create  {model, record}         → adds to records + timeline (+1)
 *   records.update  {model, id, changes}    → atomic field mutation
 *   records.destroy {model, id}             → removes from records + timeline (−1)
 *   records.reveal  {model, id, field}      → fake plaintext + audit entry
 *   query.index     {model, index, value}   → indexed lookup, or scan_required
 *
 * Because records.create / records.destroy mutate the SHARED timeline, the next
 * integrity.check the console runs reflects the new counts — that is the
 * cross-screen guarantee the prototype demonstrates.
 *
 * A local mirror (seeded from window.REC) keeps the screen responsive and lets
 * the prototype degrade gracefully when the backend is unreachable (e.g. opened
 * outside the host): the mirror answers, `offline` is flagged, and the same
 * mutations still animate — they just don't reach the shared console.
 *
 * Exports window.RSTORE.
 */
(function () {
  const REC = window.REC;
  const MODEL = 'customer';

  // ── Local mirror (source of truth when offline; cache when online) ────────
  const mirror = {
    records: REC.RECORDS.map((r) => ({ ...r, api_secret: '[CONCEALED]' })),
    countFast: REC.COUNT_FAST,
    countScan: REC.COUNT_SCAN,
  };

  let nextSeq = 0;
  function newId() {
    // Familia-style short hex identifier.
    const hex = Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    nextSeq += 1;
    return `cust_${hex}`;
  }

  async function call(envelope) {
    if (!window.familiaBackend || typeof window.familiaBackend.request !== 'function') {
      throw new Error('no_backend');
    }
    return window.familiaBackend.request(envelope);
  }

  function isError(res, name) {
    return res && typeof res === 'object' && (name ? res.error === name : !!res.error);
  }

  // Normalize a backend record into the shape the screens expect.
  function normRecord(r) {
    if (!r || typeof r !== 'object') return null;
    const out = { ...r };
    if (out._key && !out.custid) {
      const m = String(out._key).match(/customer:([^:]+):object/);
      if (m) out.custid = m[1];
    }
    if (out.api_secret == null) out.api_secret = '[CONCEALED]';
    return out;
  }

  // ── list ──────────────────────────────────────────────────────────────────
  async function list() {
    try {
      const res = await call({ action: 'records.list', model: MODEL, params: { offset: 0, limit: 50 }, tier: 'permission:read' });
      const recs = (res && Array.isArray(res.records) ? res.records : (res && res.records) || []).map(normRecord).filter(Boolean);
      // Merge any locally-created rows the backend echoed back, keeping the
      // richer local set if the backend returns a thinner seeded page.
      if (recs.length) {
        mirror.records = recs;
      }
      if (res && res.count_fast != null) mirror.countFast = res.count_fast;
      if (res && res.count_scan != null) mirror.countScan = res.count_scan;
      return { records: mirror.records.slice(), countFast: mirror.countFast, countScan: mirror.countScan, offline: false };
    } catch (e) {
      return { records: mirror.records.slice(), countFast: mirror.countFast, countScan: mirror.countScan, offline: true };
    }
  }

  function getLocal(id) {
    return mirror.records.find((r) => r.custid === id) || null;
  }

  // ── read ────────────────────────────────────────────────────────────────
  async function read(id) {
    try {
      const res = await call({ action: 'records.read', model: MODEL, id, tier: 'permission:read' });
      const rec = normRecord(res && (res.record || res));
      if (rec && rec.custid) {
        const i = mirror.records.findIndex((r) => r.custid === rec.custid);
        if (i >= 0) mirror.records[i] = { ...mirror.records[i], ...rec };
        return { record: mirror.records[i >= 0 ? i : 0] || rec, offline: false };
      }
      return { record: getLocal(id), offline: false };
    } catch (e) {
      return { record: getLocal(id), offline: true };
    }
  }

  // ── create — bumps the shared timeline (+1) ───────────────────────────────
  async function create(input) {
    const now = REC.NOW;
    const record = {
      custid: input.custid || newId(),
      email: input.email,
      name: input.name,
      status: input.status || 'pending',
      created_at: now,
      updated_at: now,
      api_secret: '[CONCEALED]',
    };
    let offline = false;
    let echoed = record;
    try {
      const res = await call({ action: 'records.create', model: MODEL, record: { email: record.email, name: record.name, status: record.status }, tier: 'permission:write' });
      if (isError(res)) throw new Error(res.error);
      const created = normRecord(res && (res.created || res.record || res));
      if (created && created.custid) echoed = { ...record, ...created, api_secret: '[CONCEALED]' };
      if (res && res.count_fast != null) mirror.countFast = res.count_fast; else mirror.countFast += 1;
      if (res && res.count_scan != null) mirror.countScan = res.count_scan; else mirror.countScan += 1;
    } catch (e) {
      offline = true;
      mirror.countFast += 1;
      mirror.countScan += 1;
    }
    mirror.records = [echoed, ...mirror.records.filter((r) => r.custid !== echoed.custid)];
    return { record: echoed, countFast: mirror.countFast, countScan: mirror.countScan, offline };
  }

  // ── update ────────────────────────────────────────────────────────────────
  async function update(id, changes) {
    const now = REC.NOW;
    let offline = false;
    try {
      const res = await call({ action: 'records.update', model: MODEL, id, changes, tier: 'permission:write' });
      if (isError(res)) throw new Error(res.error);
    } catch (e) {
      offline = true;
    }
    const i = mirror.records.findIndex((r) => r.custid === id);
    const next = { ...(mirror.records[i] || { custid: id }), ...changes, updated_at: now };
    if (i >= 0) mirror.records[i] = next; else mirror.records.unshift(next);
    return { record: next, offline };
  }

  // ── destroy — drops the shared timeline (−1) ──────────────────────────────
  async function destroy(id) {
    let offline = false;
    try {
      const res = await call({ action: 'records.destroy', model: MODEL, id, tier: 'permission:write' });
      if (isError(res)) throw new Error(res.error);
      if (res && res.count_fast != null) mirror.countFast = res.count_fast; else mirror.countFast -= 1;
      if (res && res.count_scan != null) mirror.countScan = res.count_scan; else mirror.countScan -= 1;
    } catch (e) {
      offline = true;
      mirror.countFast -= 1;
      mirror.countScan -= 1;
    }
    mirror.records = mirror.records.filter((r) => r.custid !== id);
    return { destroyed: true, countFast: mirror.countFast, countScan: mirror.countScan, offline };
  }

  // ── reveal — fake plaintext + audit ───────────────────────────────────────
  async function reveal(id, field) {
    try {
      const res = await call({ action: 'records.reveal', model: MODEL, id, field, tier: 'permission:reveal' });
      if (isError(res)) throw new Error(res.error);
      const plaintext = (res && (res.plaintext || res.value || res[field])) || REC.secretFor(id);
      const audit = Object.assign({ at: REC.NOW, actor: 'admin_42', action: 'reveal', field }, (res && res._audit) || {});
      return { plaintext, audit, offline: false };
    } catch (e) {
      return { plaintext: REC.secretFor(id), audit: REC.auditFor(id, field), offline: true };
    }
  }

  // ── query.index — indexed lookup or explicit scan ─────────────────────────
  // `plan` is the client-side plan from RLIB.planQuery; we send the matching
  // envelope and surface the backend's scan_required contract for unindexed
  // fields, falling back to the client estimate when offline.
  async function query(plan, value, force) {
    const indexed = plan.kind === 'index' || plan.kind === 'key';
    const envelope = {
      action: 'query.index',
      model: MODEL,
      params: {
        index: plan.index || plan.field || null,
        field: plan.field || null,
        value: value,
        force: !!force,
      },
      tier: 'permission:read',
    };
    try {
      const res = await call(envelope);
      if (isError(res, 'scan_required')) {
        return {
          scanRequired: true,
          hint: res.hint || 'Ad-hoc filtering on an unindexed field is explicitly expensive.',
          estimatedRows: res.estimated_rows != null ? res.estimated_rows : plan.estimate,
          offline: false,
        };
      }
      if (isError(res)) throw new Error(res.error);
      const recs = (res && Array.isArray(res.records) ? res.records : []).map(normRecord).filter(Boolean);
      return { scanRequired: false, records: recs.length ? recs : null, indexed, offline: false };
    } catch (e) {
      // Offline: honor the client plan — unindexed + not forced means scan gate.
      if (!indexed && plan.kind === 'scan' && !force) {
        return { scanRequired: true, hint: 'Ad-hoc filtering on an unindexed field is explicitly expensive.', estimatedRows: plan.estimate, offline: true };
      }
      return { scanRequired: false, records: null, indexed, offline: true };
    }
  }

  window.RSTORE = {
    MODEL,
    list, read, create, update, destroy, reveal, query,
    getLocal,
    get counts() { return { fast: mirror.countFast, scan: mirror.countScan }; },
  };
})();
