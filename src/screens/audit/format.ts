// src/screens/audit/format.ts
//
// Pure, unit-testable formatting helpers for the audit screen. No React, no
// fetch — just the mapping from a raw AuditEntry to the strings and tone the
// UI renders. Kept honest: an unknown/garbage field is shown verbatim, never
// dropped or invented.

import type { AuditEntry } from './api'

/** Severity colouring for an action badge (mirrors the migrations dot tones). */
export type AuditTone = 'neutral' | 'caution' | 'danger'

/** Destroy is the only irreversible surface — it reads as danger. */
const DANGER_ACTIONS = new Set(['destroy'])
/** Elevated/mutating-but-recoverable actions read as caution. */
const CAUTION_ACTIONS = new Set([
  'reveal',
  'repair',
  'run_migrations',
  'rollback',
  'mutate_collection',
  'run_command',
])

/** Detail keys rendered elsewhere (header) or internal — omitted from the detail list. */
const HEADER_KEYS = new Set(['at', 'actor', 'action', 'snapshot', '_nonce'])

/** The tone for an action's badge. Unknown actions are neutral, not hidden. */
export function auditActionTone(action: string | undefined): AuditTone {
  if (action && DANGER_ACTIONS.has(action)) return 'danger'
  if (action && CAUTION_ACTIONS.has(action)) return 'caution'
  return 'neutral'
}

/** Format `at` (epoch seconds) as `YYYY-MM-DD HH:MM:SS UTC`, or `—` when absent. */
export function formatAuditTime(at: number | undefined): string {
  if (typeof at !== 'number' || !Number.isFinite(at)) return '—'
  return `${new Date(at * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

/**
 * The machine-readable ISO-8601 value for a `<time dateTime>` attribute, or
 * undefined when `at` is absent/garbage (so the attribute is simply omitted
 * rather than rendered empty).
 */
export function auditDateTime(at: number | undefined): string | undefined {
  if (typeof at !== 'number' || !Number.isFinite(at)) return undefined
  return new Date(at * 1000).toISOString()
}

/**
 * A content-derived identity for an entry, for use as a stable React key.
 * Never key a row by its array index: a refresh that shifts the list (a new
 * entry at the top, a narrower window) would reassociate one row's expansion
 * state with a different entry. Audit entries carry no guaranteed unique id, so
 * callers dedupe identical keys with an occurrence suffix (see auditRowKeys).
 */
export function auditEntryKey(entry: AuditEntry): string {
  return [
    entry.at ?? '',
    entry.action ?? '',
    entry.actor ?? '',
    auditTarget(entry) ?? '',
  ].join('|')
}

/**
 * Stable, unique React keys for a list of entries, computed over the FULL list
 * (before any filtering) so a key stays put as the action filter narrows or
 * widens. Identical content keys get a `#n` occurrence suffix, so two entries
 * recorded in the same second with the same action/target never collide.
 */
export function auditRowKeys(entries: AuditEntry[]): string[] {
  const seen = new Map<string, number>()
  return entries.map((entry) => {
    const base = auditEntryKey(entry)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}#${n}`
  })
}

/**
 * A concise target label for the row header: `model:id`, or the field / command
 * / id for actions that carry no model+id. Returns null when the action has no
 * meaningful target (e.g. a whole-run `run_migrations`), so the header renders
 * nothing rather than an empty separator.
 */
export function auditTarget(entry: AuditEntry): string | null {
  const { model, id, field, cmd } = entry
  if (typeof model === 'string' && typeof id === 'string') return `${model}:${id}`
  if (typeof model === 'string') return model
  if (typeof field === 'string') return field
  if (typeof cmd === 'string') return cmd
  if (typeof id === 'string') return id
  return null
}

/** One key/value line in the expanded detail. */
export interface AuditDetail {
  key: string
  value: string
}

/** Render an arbitrary detail value as a string without ever throwing. */
export function formatDetailValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * The per-action detail pairs for the expanded row, excluding the header fields
 * and the snapshot (rendered on its own). Order follows the entry's own key
 * order so the backend's field ordering is preserved.
 */
export function auditDetailPairs(entry: AuditEntry): AuditDetail[] {
  return Object.keys(entry)
    .filter((key) => !HEADER_KEYS.has(key))
    .map((key) => ({ key, value: formatDetailValue(entry[key]) }))
}

/** The snapshot's field/value pairs (destroy entries), or [] when absent. */
export function snapshotPairs(entry: AuditEntry): AuditDetail[] {
  const snap = entry.snapshot
  if (typeof snap !== 'object' || snap === null) return []
  return Object.keys(snap).map((key) => ({
    key,
    value: formatDetailValue((snap as Record<string, unknown>)[key]),
  }))
}

/** The distinct actions present in a batch, sorted — drives the filter chips. */
export function distinctActions(entries: AuditEntry[]): string[] {
  const seen = new Set<string>()
  for (const entry of entries) {
    if (typeof entry.action === 'string' && entry.action.length > 0) {
      seen.add(entry.action)
    }
  }
  return Array.from(seen).sort()
}
