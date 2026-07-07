// src/screens/home/api.ts
//
// Typed endpoint layer for the home health dashboard (R-HOME-1..3), the landing
// surface that answers "is my data healthy?" at a glance. It composes the
// read-only endpoints that already exist — never a scan, never a fabricated
// status — into the three panels the screen renders:
//
//   R-HOME-1 fleet overview   /_meta (model metadata) + one O(1) count per model
//                             (GET /models/:model/records?limit=1 -> count_fast)
//                             + GET /integrity/_stale_indexes (the stale-index flag)
//   R-HOME-2 recent activity  reuses listAudit() (GET /admin/api/audit)
//   R-HOME-3 server vitals     GET /admin/api/raw/info (server_info subset)
//
// Honesty contract (spec §5): the fleet panel NEVER auto-runs a health scan on
// page load — there is no cached per-model integrity result on this backend yet
// (that needs the R-INT-6 all-models sweep + a cache), so the integrity column
// renders an explicit "not checked" state that links to the Integrity screen,
// not a green/red dot we cannot substantiate. A failed count for one model
// renders as "—" (unavailable), never 0. A backend that lacks stale-index
// introspection renders "unavailable", never "clean".

import type { AdminApi } from '../../api/client'
import type { AppDescriptor } from '../../data/descriptor'
import type { ApiOutcome } from '../../types'

// ---------------------------------------------------------------------------
// GET /admin/api/integrity/_stale_indexes -> { stale_indexes: [{coordinate, index}] }
// (api.rb#stale_indexes). `index` is the index_name; the endpoint 400s with
// `introspection unavailable` when Familia lacks the reflection — surfaced here
// as staleAvailable:false, an honest "unavailable", not a false "clean".
// ---------------------------------------------------------------------------
export interface StaleIndex {
  coordinate?: string
  index?: string
}

export interface StaleIndexResponse {
  stale_indexes?: StaleIndex[]
}

/** The one field the fleet count needs from the records list envelope. */
interface RecordsCountEnvelope {
  /** O(1) timeline count; may include phantoms (badged approximate in the UI). */
  count_fast?: number
}

// ---------------------------------------------------------------------------
// GET /admin/api/raw/info -> the server_info subset (api.rb#server_info). Every
// value is a raw Redis INFO string; sections and keys are present only when the
// server reported them, so the UI renders what exists and omits the rest.
// ---------------------------------------------------------------------------
export interface ServerInfo {
  server?: Record<string, string>
  memory?: Record<string, string>
  clients?: Record<string, string>
  stats?: Record<string, string>
  /** Per logical DB, e.g. { db0: 'keys=12,expires=3,avg_ttl=0', db1: '…' }. */
  keyspace?: Record<string, string>
}

/** One model's row in the fleet overview. */
export interface FleetRow {
  /** Config name, e.g. 'customer'. */
  model: string
  /** Class name, when reflection provided it. */
  className?: string
  /** Logical database the model lives on (multi-db constraint context). */
  logicalDatabase?: number
  /** TTL policy the model declares, when any. */
  expiration?: { policy?: string; default_seconds?: number }
  /** O(1) fast count; null when the per-model count call failed (render as "—"). */
  count: number | null
  /** This model's own indexes that the backend currently flags stale. */
  staleIndexes: string[]
}

export interface FleetData {
  rows: FleetRow[]
  generatedAt?: number
  familiaVersion?: string
  /** false when the backend lacks stale-index introspection (honest "unavailable"). */
  staleAvailable: boolean
}

/**
 * Load the fleet overview (R-HOME-1). The descriptor drives the model list and
 * per-model metadata; a descriptor failure is the whole panel's failure (there
 * is nothing to show without it) and is propagated as-is so <ErrorState> names
 * the specific refusal. The per-model counts and the stale-index flag are
 * fetched in parallel and each tolerated independently: a model whose count
 * call fails still lists (count → null), and a stale-index refusal degrades the
 * flag to "unavailable" for every row rather than failing the panel.
 */
export async function loadFleet(api: AdminApi): Promise<ApiOutcome<FleetData>> {
  const meta = await api.request<AppDescriptor>('/_meta')
  if (!meta.ok) return meta
  const models = meta.data?.models ?? []

  const [staleOutcome, ...countOutcomes] = await Promise.all([
    api.request<StaleIndexResponse>('/integrity/_stale_indexes'),
    ...models.map((m) =>
      api.request<RecordsCountEnvelope>(
        `/models/${encodeURIComponent(m.model)}/records?limit=1`,
      ),
    ),
  ])

  const staleNames = new Set<string>()
  const staleCoords = new Set<string>()
  if (staleOutcome.ok) {
    for (const entry of staleOutcome.data?.stale_indexes ?? []) {
      if (typeof entry.index === 'string') staleNames.add(entry.index)
      if (typeof entry.coordinate === 'string') staleCoords.add(entry.coordinate)
    }
  }

  const rows: FleetRow[] = models.map((model, i) => {
    const countOutcome = countOutcomes[i]
    const count =
      countOutcome?.ok && typeof countOutcome.data?.count_fast === 'number'
        ? countOutcome.data.count_fast
        : null
    const staleIndexes = (model.indexes ?? [])
      .filter(
        (idx) =>
          (idx.index_name !== undefined && staleNames.has(idx.index_name)) ||
          (idx.coordinate !== undefined && staleCoords.has(idx.coordinate)),
      )
      .map((idx) => idx.index_name)
    return {
      model: model.model,
      className: model.class,
      logicalDatabase: model.logical_database,
      expiration: model.expiration,
      count,
      staleIndexes,
    }
  })

  return {
    ok: true,
    data: {
      rows,
      generatedAt: meta.data?.generated_at,
      familiaVersion: meta.data?.familia_version,
      staleAvailable: staleOutcome.ok,
    },
  }
}

/** Load the server vitals strip (R-HOME-3). GET /raw/info, read-only. */
export function loadServerInfo(api: AdminApi): Promise<ApiOutcome<ServerInfo>> {
  return api.request<ServerInfo>('/raw/info')
}
