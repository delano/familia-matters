// src/screens/models/format.ts
//
// Presentation-only helpers for the schema browser. Everything here reads off
// the /_meta descriptor shapes (src/data/descriptor.ts) and null-guards hard:
// the descriptor is built server-side with `.compact`, so any key except the
// model name can be absent. Nothing fabricates a value — absent renders as an
// explicit em dash, and the cross-reference that hides index-backing internals
// is the one piece of contract logic the live reflection surface forces on us.

import type {
  DatatypeDescriptor,
  IndexDescriptor,
  ModelDescriptor,
} from '../../data/descriptor'

/** A short, human label for the model's expiration policy. */
export function expirationLabel(model: ModelDescriptor): string {
  const exp = model.expiration
  if (!exp || exp.policy !== 'ttl') return 'none'
  const seconds = exp.default_seconds
  if (seconds === undefined || seconds === null) return 'ttl'
  if (seconds >= 86400) return `ttl · ${Math.floor(seconds / 86400)}d`
  if (seconds >= 3600) return `ttl · ${Math.floor(seconds / 3600)}h`
  if (seconds >= 60) return `ttl · ${Math.floor(seconds / 60)}m`
  return `ttl · ${seconds}s`
}

/** Count helper that tolerates an absent array. */
export function lengthOf<T>(arr: readonly T[] | undefined): number {
  return arr?.length ?? 0
}

const DATATYPE_BLURBS: Readonly<Record<string, string>> = {
  list: 'Ordered · duplicates allowed · LPUSH / RPUSH',
  set: 'Unique members · unordered · SADD / SREM',
  sorted_set: 'Member + score · ordered by score · ZADD',
  hashkey: 'Field → value map · HSET / HDEL',
  counter: 'Atomic integer · INCRBY / DECRBY',
}

/** A one-line description of a datatype's semantics, or '' when unknown. */
export function datatypeBlurb(type: string | undefined): string {
  if (type === undefined) return ''
  return DATATYPE_BLURBS[type] ?? ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * A compact, one-line summary of a JSON Schema fragment (type, format, enum,
 * bounds, default) — null when the schema is absent or carries nothing useful.
 */
export function schemaSummary(schema: unknown): string | null {
  if (!isRecord(schema)) return null
  const bits: string[] = []
  if (typeof schema.type === 'string') bits.push(schema.type)
  if (typeof schema.format === 'string') bits.push(`format: ${schema.format}`)
  if (Array.isArray(schema.enum)) {
    bits.push(`enum: ${schema.enum.map((v) => String(v)).join(' | ')}`)
  }
  if (typeof schema.minLength === 'number') bits.push(`min ${schema.minLength}`)
  if (typeof schema.maxLength === 'number') bits.push(`max ${schema.maxLength}`)
  if (schema.default !== undefined && schema.default !== null) {
    bits.push(`default ${String(schema.default)}`)
  }
  return bits.length > 0 ? bits.join(' · ') : null
}

/**
 * Read a field's per-field json_schema. The descriptor's FieldDescriptor type
 * does not declare this optional key (the server adds it via .compact when a
 * field carries a schema), so we read it off the record without redefining the
 * shared type — narrowing keeps it type-safe.
 */
export function fieldSchema(field: object): unknown {
  return (field as { json_schema?: unknown }).json_schema
}

export interface PartitionedDatatypes {
  /** Developer-declared collections (record/timeline structures). */
  declared: DatatypeDescriptor[]
  /**
   * Index-backing structures that LIVE reflection surfaces as class-scoped
   * datatypes because a unique/multi index is itself stored as a hashkey. They
   * are NOT developer-declared collections and must not be presented as such.
   */
  internals: DatatypeDescriptor[]
}

/**
 * Split datatypes into developer-declared collections and index-backing
 * internals by cross-referencing indexes[].index_name. A datatype is an
 * internal when its name matches a declared index name (the live reflection
 * case the fixtures README warns about); the sample descriptor is already
 * clean, so `internals` is empty there.
 */
export function partitionDatatypes(model: ModelDescriptor): PartitionedDatatypes {
  const datatypes = model.datatypes ?? []
  const indexNames = new Set(
    (model.indexes ?? [])
      .map((i: IndexDescriptor) => i.index_name)
      .filter((n): n is string => typeof n === 'string'),
  )
  const declared: DatatypeDescriptor[] = []
  const internals: DatatypeDescriptor[] = []
  for (const dt of datatypes) {
    if (typeof dt.name === 'string' && indexNames.has(dt.name)) internals.push(dt)
    else declared.push(dt)
  }
  return { declared, internals }
}

/**
 * The chip category for a field row: 'identifier' takes priority, then the
 * declared category, defaulting to 'field'.
 */
export function fieldCategory(field: {
  category?: string
  identifier?: boolean
}): string {
  if (field.identifier) return 'identifier'
  return field.category ?? 'field'
}
