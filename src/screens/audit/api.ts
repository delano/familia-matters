// src/screens/audit/api.ts
//
// Typed endpoint layer for the audit-trail screen, mapping the operator-facing
// audit route (lib/familia/admin/api.rb: list_audit -> GET /admin/api/audit)
// onto ApiOutcome. Callers run it through useResource — never adminApi
// directly, never raw fetch.
//
// Contract facts this layer encodes (see lib/familia/admin/audit_log.rb and the
// ops_try.rb contract suite):
//   - The wire shape is {entries, count, limit}; entries are newest-first
//     (AuditLog.recent uses revrange), so the screen renders them in received
//     order and never re-sorts.
//   - Every entry carries `at` (epoch seconds), `actor` (the shared principal,
//     `admin` by default — attribution is by SSH-log correlation, ADR 0003),
//     and `action`. The remaining keys are per-action detail: create/update
//     carry model+id; destroy adds a `snapshot` (encrypted fields already
//     masked server-side); reveal adds `field`; run_command adds cmd+args;
//     rollback adds id; repair adds model (+ `via:"stream"` for the SSE path).
//     Unknown detail keys are tolerated — the screen renders them verbatim and
//     never fabricates any.
//   - The route is auth=role:admin and a GET, so every authenticated session
//     may read it and read-only mode never blocks it (ops_try.rb AC3).

import type { AdminApi } from '../../api/client'
import type { ApiOutcome } from '../../types'

/**
 * One audit entry. The three always-present fields are declared; every other
 * key is per-action detail, so an index signature keeps the shape open without
 * losing type help on the common ones. `snapshot` is present only on destroy
 * entries (a masked copy of the record that was removed).
 */
export interface AuditEntry {
  /** Recorded time, Unix epoch seconds. */
  at?: number
  /** The shared principal that performed the action (`admin` by default). */
  actor?: string
  /** The audited action, e.g. `reveal`, `destroy`, `repair`, `run_command`. */
  action?: string
  /** Affected model config-name (create/update/destroy/reveal/repair/mutate_collection). */
  model?: string
  /** Affected record identifier. */
  id?: string
  /** Revealed field name (reveal). */
  field?: string
  /** Raw command name (run_command). */
  cmd?: string
  /** Destroy snapshot: field -> preserved value, encrypted fields already masked. */
  snapshot?: Record<string, unknown> | null
  /** Open set of remaining per-action detail (args, via, op, dry_run, …). */
  [key: string]: unknown
}

/** The GET /admin/api/audit envelope. */
export interface AuditResponse {
  /** Newest-first entries. Absent/garbage collapses to an empty list at render. */
  entries?: AuditEntry[]
  /** Number of entries returned (== entries.length). */
  count?: number
  /** The effective server-side window (clamped 1..500). */
  limit?: number
}

/**
 * GET /admin/api/audit?limit= (role:admin). `limit` is the server-side fetch
 * window; the backend clamps it to [1, 500] (PAGE_MAX). A GET, so it is never
 * blocked by production read-only mode.
 */
export function listAudit(
  api: AdminApi,
  limit?: number,
): Promise<ApiOutcome<AuditResponse>> {
  const query =
    typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : ''
  return api.request<AuditResponse>(`/audit${query}`)
}
