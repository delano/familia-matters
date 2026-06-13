// src/screens/integrity/api.ts
//
// Typed endpoint layer for the integrity screen, mapping the integrity routes
// (resources/00-assets/routes.txt, lib/familia/admin/api.rb) onto ApiOutcome.
// Every function takes the AdminApi so callers run them through
// useResource / useMutation — never adminApi directly. The live repair stream
// is NOT here: it goes through openRepairStream (src/api/sse.ts), a real
// EventSource, never a fabricated/animated frame source.
//
// Every field on HealthReport is optional and must be null-guarded: the server
// builds the report with quiet-safe reflection (AuditReport#to_h with .compact),
// so any branch can be absent when reflection omits it. The screen derives its
// counts from the arrays and never assumes a key is present.

import type { AdminApi } from '../../api/client'
import type { ApiOutcome } from '../../types'

const enc = encodeURIComponent

/** One stale participation member (a collection entry pointing at a gone record). */
export interface StaleParticipationMember {
  identifier?: string
  collection_key?: string
  reason?: string
}

/** One drifted unique-index pointer: the index resolves to the wrong identifier. */
export interface WrongTargetEntry {
  index?: string
  field_value?: string
  points_to?: string
  actual?: string
}

/**
 * The AuditReport#to_h shape (GET /integrity/:model). A HEALTHY report has the
 * same shape with empty arrays and healthy:true. Every key is optional —
 * reflection can omit any branch — so consumers must guard.
 */
export interface HealthReport {
  healthy?: boolean
  /** The model's class name as the server reports it (e.g. 'Customer'). */
  model?: string
  /** Epoch seconds the audit ran. */
  checked_at?: number
  /** false when reflection could not complete the audit. */
  complete?: boolean

  instances?: {
    /** O(1) timeline count — may include phantoms. */
    count_timeline?: number
    /** Authoritative SCAN count. */
    count_scan?: number
    phantoms?: string[]
    missing?: string[]
  }

  unique_indexes?: Array<{
    index_name?: string
    stale?: string[]
    missing?: string[]
  }>

  multi_indexes?: Array<{
    index_name?: string
    stale_members?: string[]
    orphaned_keys?: string[]
  }>

  participations?: Array<{
    collection_name?: string
    stale_members?: StaleParticipationMember[]
  }>

  related_fields?: {
    healthy?: boolean
    checked?: string[]
  }

  cross_references?: {
    status?: string
    in_instances_missing_unique_index?: string[]
    index_points_to_wrong_identifier?: WrongTargetEntry[]
  }

  summary?: {
    total_issues?: number
    by_type?: {
      phantoms?: number
      missing?: number
      stale_unique_index?: number
      missing_unique_index?: number
      stale_multi_member?: number
      orphaned_index_key?: number
      stale_participation?: number
      cross_ref_missing_index?: number
      cross_ref_wrong_target?: number
    }
  }
}

/** Response of POST /integrity/:model/repair?dry_run=true. */
export interface DryRunResult {
  dry_run?: boolean
  report?: HealthReport
}

/**
 * The done-frame summary (one tally per repaired component) carried by the
 * stream's terminal {event:'done'} frame. All optional — a partial repair or a
 * differently-keyed backend summary leaves some counts absent.
 */
export interface RepairSummary {
  phantoms_removed?: number
  missing_added?: number
  indexes_rebuilt?: number
  stale_members_removed?: number
  orphaned_keys_removed?: number
  participations_fixed?: number
  cross_refs_fixed?: number
}

/** A single coordinate in the cross-model stale-index overview. */
export interface StaleIndexEntry {
  coordinate?: string
  index?: string
}

/** Response of GET /integrity/_stale_indexes — a cross-model overview. */
export interface StaleIndexesResult {
  stale_indexes?: StaleIndexEntry[]
}

/** GET /integrity/:model — role:admin. Reads the AuditReport. */
export function healthCheck(
  api: AdminApi,
  model: string,
): Promise<ApiOutcome<HealthReport>> {
  return api.request<HealthReport>(`/integrity/${enc(model)}`)
}

/**
 * POST /integrity/:model/repair?dry_run=true — permission:repair. The preview
 * of what a repair would touch; nothing is written.
 */
export function dryRunRepair(
  api: AdminApi,
  model: string,
): Promise<ApiOutcome<DryRunResult>> {
  return api.request<DryRunResult>(`/integrity/${enc(model)}/repair?dry_run=true`, {
    method: 'POST',
  })
}

/** GET /integrity/_stale_indexes — role:admin. Optional cross-model overview. */
export function staleIndexes(api: AdminApi): Promise<ApiOutcome<StaleIndexesResult>> {
  return api.request<StaleIndexesResult>('/integrity/_stale_indexes')
}
