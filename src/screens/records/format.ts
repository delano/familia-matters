// src/screens/records/format.ts
//
// Display formatting for serialized record values. Values arrive as the
// server serialized them (Familia fields load as strings; encrypted fields
// are the literal '[CONCEALED]'); formatting is presentation-only and never
// fabricates a value — absent is rendered as an explicit em dash.

/** Epoch seconds (number or numeric string), or null when it isn't one. */
function asEpochSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d{9,12}$/.test(value)) return Number(value)
  return null
}

/** 'YYYY-MM-DD HH:MM:SS UTC' for an epoch-seconds value. */
export function formatEpoch(seconds: number): string {
  return `${new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

/**
 * One record value for a table cell / detail row. Timestamp-named fields
 * render as UTC datetimes; everything else renders verbatim.
 */
export function formatFieldValue(name: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (name.endsWith('_at')) {
    const epoch = asEpochSeconds(value)
    if (epoch !== null) return formatEpoch(epoch)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** A collection member: hash pairs as 'field → value', scalars verbatim. */
export function formatMember(member: unknown): string {
  if (Array.isArray(member) && member.length === 2) {
    return `${String(member[0])} → ${String(member[1])}`
  }
  if (member === null || member === undefined) return '—'
  if (typeof member === 'object') return JSON.stringify(member)
  return String(member)
}
