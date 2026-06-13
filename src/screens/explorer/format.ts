// src/screens/explorer/format.ts
//
// Presentation + value narrowing for the Explorer screen. The /raw/key `value`
// is `unknown` (its JSON shape depends on the Redis type), so every viewer
// narrows it here rather than asserting — string→string, list/set→array,
// zset→[member, score] pairs, hash→object — and anything that does not fit the
// declared type renders as an explicit "unexpected value", never a fabricated
// reading.

export const CONCEALED = '[CONCEALED]'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A scalar rendered verbatim; objects as JSON; absent as an em dash. */
export function formatScalar(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** 'Xd Yh' / 'Yh Zm' / 'Zm' for a positive ttl; persistent for -1/absent. */
export function formatTtl(ttl: number | undefined): { text: string; persistent: boolean } {
  if (ttl === undefined || ttl < 0) return { text: 'persistent', persistent: true }
  const d = Math.floor(ttl / 86400)
  const h = Math.floor((ttl % 86400) / 3600)
  const m = Math.floor((ttl % 3600) / 60)
  const text = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${ttl % 60}s`
  return { text, persistent: false }
}

/** Human-readable byte size; em dash when the server omitted it. */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// Value narrowing. Each returns null when the value does not match the type,
// so the viewer can fall back to an honest "unexpected value" rendering.
// ---------------------------------------------------------------------------

/** A zset member as a [member, score] pair. */
export interface ZsetEntry {
  member: string
  score: number
}

/** string value → its text, or null when it is not a string. */
export function asStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** list/set value → an array of display strings, or null when not an array. */
export function asArrayValue(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.map(formatScalar)
}

/**
 * zset value → [member, score] pairs. The wire shape is an array of two-element
 * `[member, score]` tuples; anything that is not a 2-tuple is skipped rather
 * than guessed at. Returns null when the value is not an array at all.
 */
export function asZsetValue(value: unknown): ZsetEntry[] | null {
  if (!Array.isArray(value)) return null
  const entries: ZsetEntry[] = []
  for (const pair of value) {
    if (Array.isArray(pair) && pair.length === 2) {
      entries.push({ member: formatScalar(pair[0]), score: Number(pair[1]) })
    }
  }
  return entries
}

/** hash value → field→value entries, or null when not an object. */
export function asHashValue(value: unknown): [string, string][] | null {
  if (!isRecord(value)) return null
  return Object.entries(value).map(([k, v]) => [k, formatScalar(v)])
}

/** Pretty-print an arbitrary command result for the console pre block. */
export function formatCommandResult(result: unknown): string {
  if (result === undefined || result === null) return '(nil)'
  if (typeof result === 'string') return result
  return JSON.stringify(result, null, 2)
}
