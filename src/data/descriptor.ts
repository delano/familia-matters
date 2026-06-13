// src/data/descriptor.ts
//
// Types and helpers for the /_meta app descriptor
// (lib/familia/admin/descriptor.rb). The descriptor is built server-side with
// `.compact` and quiet-safe reflection: ANY key except the model name can be
// absent when reflection fails, so every field here is optional and consumers
// must null-guard. Screens drive model lists, identifiers, columns, forms,
// collections, and index queries from these shapes — never from hardcoded
// model knowledge (the whole point of T7's records de-hardcode).

export interface FieldDescriptor {
  name: string
  /** 'field' | 'encrypted' | 'transient' (open set — treat unknowns as plain). */
  category?: string
  persisted?: boolean
  /** true only on the identifier field. */
  identifier?: boolean
  /** false only on transient fields (never sent to clients). */
  client_visible?: boolean
  /** '[CONCEALED]' (encrypted) / '[REDACTED]' (transient). */
  display?: string
}

export interface DatatypeDescriptor {
  name: string
  /** list | set | sorted_set | hashkey | counter | ... */
  type?: string
  /** 'instance' datatypes are record collections; 'class' ones are timelines/indexes. */
  scope?: string
}

export interface IndexDescriptor {
  index_name: string
  field?: string
  /** 'unique' | 'multi' */
  cardinality?: string
  class_level?: boolean
  queryable?: boolean
  coordinate?: string
}

export interface ParticipationDescriptor {
  collection?: string
  type?: string
  target?: string
  scored?: boolean
  through?: string
}

export interface ModelDescriptor {
  /** Config name, e.g. 'customer'. The one guaranteed key. */
  model: string
  /** Class name, e.g. 'Customer'. */
  class?: string
  key_pattern?: string
  /** Identifier field name; 'id' when the identifier is a Proc; can be absent. */
  identifier_field?: string
  logical_database?: number
  fields?: FieldDescriptor[]
  datatypes?: DatatypeDescriptor[]
  indexes?: IndexDescriptor[]
  participations?: ParticipationDescriptor[]
  safe_dump_fields?: string[]
  expiration?: { policy?: string; default_seconds?: number }
  json_schema?: unknown
  /** list/read/create/update/destroy + 'reveal' / 'rebuild_index' when applicable. */
  actions?: string[]
}

export interface AppDescriptor {
  generated_at?: number
  familia_version?: string
  models?: ModelDescriptor[]
}

/** A serialized record from the records API: persistent fields (+ _key on full reads). */
export type RecordData = Record<string, unknown>

/** The model's declared actions, empty when reflection omitted them. */
export function modelActions(model: ModelDescriptor): readonly string[] {
  return model.actions ?? []
}

/**
 * Fields that appear in serialized records (list columns, detail rows):
 * persisted and not transient. Encrypted fields are included — the server
 * serializes them as '[CONCEALED]'.
 */
export function visibleFields(model: ModelDescriptor): FieldDescriptor[] {
  return (model.fields ?? []).filter(
    (f) => f.persisted !== false && f.category !== 'transient',
  )
}

/**
 * Fields an operator may write. The server owns created_at/updated_at (it
 * stamps both on create and re-stamps updated_at on update, dropping any
 * client value), so they are never editable. On update the identifier is
 * also excluded — the URL :id names the record and the server strips
 * identifier changes from the body.
 */
export function editableFields(
  model: ModelDescriptor,
  mode: 'create' | 'update',
): FieldDescriptor[] {
  return visibleFields(model).filter((f) => {
    if (f.name === 'created_at' || f.name === 'updated_at') return false
    if (mode === 'update' && f.identifier) return false
    return true
  })
}

/** The record's identifier value as a string, or null when unavailable. */
export function identifierOf(
  model: ModelDescriptor,
  record: RecordData,
): string | null {
  const field = model.identifier_field
  if (!field) return null
  const value = record[field]
  if (value === undefined || value === null || value === '') return null
  return String(value)
}

/** Instance-scoped datatypes — the per-record collections the API serves. */
export function instanceDatatypes(model: ModelDescriptor): DatatypeDescriptor[] {
  return (model.datatypes ?? []).filter((d) => d.scope === 'instance')
}

/** Indexes the query endpoint can actually answer. */
export function queryableIndexes(model: ModelDescriptor): IndexDescriptor[] {
  return (model.indexes ?? []).filter((i) => i.queryable === true)
}
