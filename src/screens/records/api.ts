// src/screens/records/api.ts
//
// Typed endpoint layer for the records screen, mapping the records routes
// (resources/00-assets/routes.txt, lib/familia/admin/api.rb) onto ApiOutcome.
// Every function takes the AdminApi so callers run them through
// useAuth().callOutcome / useResource / useMutation — never adminApi directly.
//
// Deliberate absences:
//   - There is NO force parameter anywhere. The T5 contract: forcing a query
//     past the scan gate returns 400 scan_unavailable because no scan backend
//     exists. This client cannot express the request, by construction.
//   - There is no count_scan. The prototype invented it from seed data; the
//     API serves count_fast only (O(1), may include phantoms — the integrity
//     screen reconciles).

import type { AdminApi } from '../../api/client'
import type { ApiOutcome } from '../../types'
import type { RecordData } from '../../data/descriptor'

export const PAGE_LIMIT = 50

export interface RecordsPage {
  model?: string
  offset?: number
  limit?: number
  /** O(1) timeline count; null when reflection failed. May include phantoms. */
  count_fast?: number | null
  /**
   * Whether the timeline yielded a full page of ids BEFORE phantom compaction —
   * the authoritative "next page exists" signal. Pagination MUST key off this,
   * not records.length: the backend drops phantoms (timeline ids with no live
   * object) from records[], so a full page of ids can return fewer records, and
   * driving "next" off records.length silently truncates a phantom-prone dataset.
   */
  has_more?: boolean
  records?: RecordData[]
}

/**
 * Result of GET /models/:model/index/:index?value=. A 200 either carries
 * records or the scan_required contract ({error, hint, estimated_rows}) when
 * no queryable index covers the name — the screen renders the gate, never
 * a fabricated empty result.
 */
export interface QueryIndexResult {
  index?: string
  value?: string
  records?: RecordData[]
  error?: string
  hint?: string
  estimated_rows?: number
}

export interface CollectionPage {
  collection?: string
  offset?: number
  limit?: number
  members?: unknown[]
}

export interface RevealResult {
  /** The revealed plaintext under the field's own name, plus the audit entry. */
  [field: string]: unknown
  _audit?: unknown
}

export interface DestroyResult {
  destroyed?: boolean
  count_fast?: number | null
}

const enc = encodeURIComponent

export function listRecords(
  api: AdminApi,
  model: string,
  offset: number,
): Promise<ApiOutcome<RecordsPage>> {
  return api.request<RecordsPage>(
    `/models/${enc(model)}/records?offset=${offset}&limit=${PAGE_LIMIT}`,
  )
}

export function readRecord(
  api: AdminApi,
  model: string,
  id: string,
): Promise<ApiOutcome<RecordData>> {
  return api.request<RecordData>(`/models/${enc(model)}/records/${enc(id)}`)
}

export function createRecord(
  api: AdminApi,
  model: string,
  fields: Record<string, unknown>,
): Promise<ApiOutcome<RecordData & { count_fast?: number | null }>> {
  return api.request(`/models/${enc(model)}/records`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  })
}

export function updateRecord(
  api: AdminApi,
  model: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<ApiOutcome<RecordData>> {
  return api.request(`/models/${enc(model)}/records/${enc(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  })
}

export function destroyRecord(
  api: AdminApi,
  model: string,
  id: string,
): Promise<ApiOutcome<DestroyResult>> {
  return api.request(`/models/${enc(model)}/records/${enc(id)}`, { method: 'DELETE' })
}

export function revealField(
  api: AdminApi,
  model: string,
  id: string,
  field: string,
): Promise<ApiOutcome<RevealResult>> {
  return api.request(`/models/${enc(model)}/records/${enc(id)}/reveal/${enc(field)}`, {
    method: 'POST',
  })
}

export function queryIndex(
  api: AdminApi,
  model: string,
  index: string,
  value: string,
): Promise<ApiOutcome<QueryIndexResult>> {
  return api.request(`/models/${enc(model)}/index/${enc(index)}?value=${enc(value)}`)
}

export function readCollection(
  api: AdminApi,
  model: string,
  id: string,
  collection: string,
): Promise<ApiOutcome<CollectionPage>> {
  return api.request(
    `/models/${enc(model)}/records/${enc(id)}/${enc(collection)}?offset=0&limit=25`,
  )
}
