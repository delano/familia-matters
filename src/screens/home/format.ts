// src/screens/home/format.ts
//
// Pure, unit-testable formatting for the home dashboard. No React, no fetch —
// just the mapping from the raw contract values (Redis INFO strings, epoch
// seconds, TTL declarations) to the strings the UI shows. Kept honest: a
// missing value formats to an explicit "—", never a fabricated zero or default.

import type { FleetRow, ServerInfo } from './api'

/** A record count with grouping, or "—" when the count is unavailable (not 0). */
export function formatCount(count: number | null): string {
  if (count === null || !Number.isFinite(count)) return '—'
  return count.toLocaleString('en-US')
}

/** Uptime seconds → "3d 4h 12m"; "—" when absent or nonsensical. */
export function formatUptime(seconds: number | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '—'
  }
  const total = Math.floor(seconds)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours || days) parts.push(`${hours}h`)
  parts.push(`${mins}m`)
  return parts.join(' ')
}

/** Coarse duration for a TTL: picks the largest exact unit (d/h/m), else seconds. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const s = Math.floor(seconds)
  if (s % 86400 === 0) return `${s / 86400}d`
  if (s % 3600 === 0) return `${s / 3600}h`
  if (s % 60 === 0) return `${s / 60}m`
  return `${s}s`
}

/**
 * A one-line TTL summary for a fleet row: the declared policy and/or default
 * duration, or "none" when the model declares no expiration. Honest about the
 * two independent facts (a policy without a default, a default without a
 * named policy) rather than assuming one implies the other.
 */
export function ttlSummary(expiration: FleetRow['expiration']): string {
  if (!expiration) return 'none'
  const { policy, default_seconds: secs } = expiration
  const hasDuration = typeof secs === 'number' && secs > 0
  if (policy && hasDuration) return `${policy} · ${formatDuration(secs)}`
  if (hasDuration) return formatDuration(secs)
  return policy ?? 'none'
}

/** One parsed keyspace line: the DB name and its key/expiry counts. */
export interface KeyspaceRow {
  db: string
  keys: number | null
  expires: number | null
}

function matchInt(source: string, re: RegExp): number | null {
  const m = re.exec(source)
  return m ? Number(m[1]) : null
}

/**
 * Parse the keyspace section ({ db0: 'keys=12,expires=3,avg_ttl=0', … }) into
 * sorted rows. An unparseable line still lists its DB with null counts (shown
 * as "—") rather than being dropped.
 */
export function parseKeyspace(info: ServerInfo | undefined): KeyspaceRow[] {
  const keyspace = info?.keyspace
  if (!keyspace || typeof keyspace !== 'object') return []
  return Object.keys(keyspace)
    .sort()
    .map((db) => {
      const raw = String(keyspace[db] ?? '')
      return {
        db,
        keys: matchInt(raw, /keys=(\d+)/),
        expires: matchInt(raw, /expires=(\d+)/),
      }
    })
}

/**
 * Read a single value from an INFO section, returning undefined (not '') when
 * the key is absent — the caller decides whether to render the tile at all.
 */
export function infoValue(
  section: Record<string, string> | undefined,
  key: string,
): string | undefined {
  const value = section?.[key]
  return value !== undefined && value !== '' ? value : undefined
}

/** A count → "—" formatter for keyspace cells (null counts stay honest). */
export function formatKeyCount(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('en-US')
}
