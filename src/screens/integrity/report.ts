// src/screens/integrity/report.ts
//
// Pure read-only derivations over a HealthReport. The server already serves a
// summary, but reflection can omit it (or any branch), so every count here is
// recomputed defensively from the arrays it CAN see — never assumed present,
// never fabricated. There is no normalization that invents data: an absent
// array is length 0, an absent count is absent. This is presentation math only.

import type { HealthReport } from './api'

const len = (a: readonly unknown[] | undefined): number => (a ? a.length : 0)

/** Total drift in the instances component (phantoms + missing). */
export function instancesCount(report: HealthReport): number {
  return len(report.instances?.phantoms) + len(report.instances?.missing)
}

/** Total drift across all unique indexes (stale + missing entries). */
export function uniqueIndexCount(report: HealthReport): number {
  return (report.unique_indexes ?? []).reduce(
    (n, ix) => n + len(ix.stale) + len(ix.missing),
    0,
  )
}

/** Total drift across all multi indexes (stale members + orphaned keys). */
export function multiIndexCount(report: HealthReport): number {
  return (report.multi_indexes ?? []).reduce(
    (n, ix) => n + len(ix.stale_members) + len(ix.orphaned_keys),
    0,
  )
}

/** Total stale participation members across all collections. */
export function participationsCount(report: HealthReport): number {
  return (report.participations ?? []).reduce(
    (n, p) => n + len(p.stale_members),
    0,
  )
}

/** Total cross-reference drift (missing-index + wrong-target). */
export function crossReferenceCount(report: HealthReport): number {
  const cr = report.cross_references ?? {}
  return len(cr.in_instances_missing_unique_index) + len(cr.index_points_to_wrong_identifier)
}

/**
 * Total issues. Prefers the server's own summary.total_issues when present
 * (it is authoritative), otherwise sums the per-component derivations.
 */
export function totalIssues(report: HealthReport): number {
  const declared = report.summary?.total_issues
  if (typeof declared === 'number') return declared
  return (
    instancesCount(report) +
    uniqueIndexCount(report) +
    multiIndexCount(report) +
    participationsCount(report) +
    crossReferenceCount(report)
  )
}

/**
 * Whether the report is healthy. An explicit healthy:false ALWAYS wins — a
 * degraded/incomplete report (complete:false) can carry empty issue arrays yet
 * still be unhealthy, and surfacing the green "no issues" banner for it would let
 * an operator read a partially-audited model as clean. Otherwise health requires
 * a zero derived total, so a report that claims healthy while carrying drift is
 * still treated as having issues (the operator must see the drift). This matches
 * the server's own done-frame signal (api.rb stream_repair tracks report.healthy?).
 */
export function isHealthy(report: HealthReport): boolean {
  if (report.healthy === false) return false
  return totalIssues(report) === 0
}

/** The instance count reconciliation: how many phantoms inflate the timeline. */
export function countMismatch(report: HealthReport): number | null {
  const timeline = report.instances?.count_timeline
  const scan = report.instances?.count_scan
  if (typeof timeline !== 'number' || typeof scan !== 'number') return null
  return timeline - scan
}

/** Severity tone for a count: zero is neutral, otherwise the supplied tone. */
export type Tone = 'healthy' | 'caution' | 'broken' | 'preview' | 'neutral'

/** The nine summary-strip rows, in display order, with their tones + labels. */
export interface SummaryCell {
  key: string
  label: string
  value: number
  tone: Tone
}

/**
 * The summary strip. Each value is taken from the server's by_type when present,
 * else recomputed from the arrays so the strip never disagrees with the sections.
 */
export function summaryCells(report: HealthReport): SummaryCell[] {
  const by = report.summary?.by_type ?? {}
  const ui = report.unique_indexes ?? []
  const mi = report.multi_indexes ?? []
  const cr = report.cross_references ?? {}

  const staleUnique = ui.reduce((n, x) => n + len(x.stale), 0)
  const missingUnique = ui.reduce((n, x) => n + len(x.missing), 0)
  const staleMulti = mi.reduce((n, x) => n + len(x.stale_members), 0)
  const orphanedMulti = mi.reduce((n, x) => n + len(x.orphaned_keys), 0)

  const pick = (declared: number | undefined, computed: number): number =>
    typeof declared === 'number' ? declared : computed

  return [
    { key: 'phantoms', label: 'Phantoms', value: pick(by.phantoms, len(report.instances?.phantoms)), tone: 'broken' },
    { key: 'missing', label: 'Missing', value: pick(by.missing, len(report.instances?.missing)), tone: 'broken' },
    { key: 'stale_unique_index', label: 'Stale unique', value: pick(by.stale_unique_index, staleUnique), tone: 'caution' },
    { key: 'missing_unique_index', label: 'Missing unique', value: pick(by.missing_unique_index, missingUnique), tone: 'broken' },
    { key: 'stale_multi_member', label: 'Stale multi', value: pick(by.stale_multi_member, staleMulti), tone: 'caution' },
    { key: 'orphaned_index_key', label: 'Orphaned keys', value: pick(by.orphaned_index_key, orphanedMulti), tone: 'broken' },
    { key: 'stale_participation', label: 'Stale participation', value: pick(by.stale_participation, participationsCount(report)), tone: 'caution' },
    { key: 'cross_ref_missing_index', label: 'X-ref missing index', value: pick(by.cross_ref_missing_index, len(cr.in_instances_missing_unique_index)), tone: 'broken' },
    { key: 'cross_ref_wrong_target', label: 'X-ref wrong target', value: pick(by.cross_ref_wrong_target, len(cr.index_points_to_wrong_identifier)), tone: 'broken' },
  ]
}
