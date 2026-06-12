// src/data/descriptor.test.ts
//
// The descriptor helpers must hold up against BOTH a fully-populated model and
// a compact-omitted one (the server drops any key whose reflection failed), so
// the fixtures here mirror the dev /_meta extremes: customer (everything) and
// an audit_log-shaped model (almost nothing).

import { describe, expect, it } from 'vitest'

import {
  editableFields,
  identifierOf,
  instanceDatatypes,
  modelActions,
  queryableIndexes,
  visibleFields,
  type ModelDescriptor,
} from './descriptor'

const CUSTOMER: ModelDescriptor = {
  model: 'customer',
  class: 'Customer',
  key_pattern: 'customer:{custid}:object',
  identifier_field: 'custid',
  fields: [
    { name: 'custid', category: 'field', persisted: true, identifier: true },
    { name: 'email', category: 'field', persisted: true },
    { name: 'status', category: 'field', persisted: true },
    { name: 'created_at', category: 'field', persisted: true },
    { name: 'updated_at', category: 'field', persisted: true },
    { name: 'api_secret', category: 'encrypted', persisted: true, display: '[CONCEALED]' },
    { name: 'password', category: 'transient', persisted: false, client_visible: false },
  ],
  datatypes: [
    { name: 'recent_logins', type: 'list', scope: 'instance' },
    { name: 'login_count', type: 'counter', scope: 'instance' },
    { name: 'instances', type: 'sorted_set', scope: 'class' },
  ],
  indexes: [
    { index_name: 'email_lookup', field: 'email', cardinality: 'unique', queryable: true },
    { index_name: 'shadow_index', field: 'shadow', queryable: false },
  ],
  actions: ['list', 'read', 'create', 'update', 'destroy', 'reveal'],
}

/** audit_log in the dev fixtures: no identifier, no fields, no indexes. */
const BARE: ModelDescriptor = { model: 'audit_log' }

describe('visibleFields', () => {
  it('keeps plain and encrypted persisted fields, drops transient', () => {
    expect(visibleFields(CUSTOMER).map((f) => f.name)).toEqual([
      'custid',
      'email',
      'status',
      'created_at',
      'updated_at',
      'api_secret',
    ])
  })

  it('is empty for a compact-omitted model', () => {
    expect(visibleFields(BARE)).toEqual([])
  })
})

describe('editableFields', () => {
  it('create: excludes server-stamped timestamps, keeps the identifier and encrypted', () => {
    expect(editableFields(CUSTOMER, 'create').map((f) => f.name)).toEqual([
      'custid',
      'email',
      'status',
      'api_secret',
    ])
  })

  it('update: also excludes the identifier (the URL :id names the record)', () => {
    expect(editableFields(CUSTOMER, 'update').map((f) => f.name)).toEqual([
      'email',
      'status',
      'api_secret',
    ])
  })
})

describe('identifierOf', () => {
  it('reads the identifier field value as a string', () => {
    expect(identifierOf(CUSTOMER, { custid: 'cust_1' })).toBe('cust_1')
    expect(identifierOf(CUSTOMER, { custid: 42 })).toBe('42')
  })

  it('returns null without an identifier field or value — never invents an id', () => {
    expect(identifierOf(BARE, { anything: 'x' })).toBeNull()
    expect(identifierOf(CUSTOMER, {})).toBeNull()
    expect(identifierOf(CUSTOMER, { custid: '' })).toBeNull()
  })
})

describe('instanceDatatypes / queryableIndexes / modelActions', () => {
  it('keeps instance scope only (class timelines and index zsets are not collections)', () => {
    expect(instanceDatatypes(CUSTOMER).map((d) => d.name)).toEqual([
      'recent_logins',
      'login_count',
    ])
  })

  it('keeps queryable indexes only', () => {
    expect(queryableIndexes(CUSTOMER).map((i) => i.index_name)).toEqual(['email_lookup'])
  })

  it('null-guards the bare model', () => {
    expect(instanceDatatypes(BARE)).toEqual([])
    expect(queryableIndexes(BARE)).toEqual([])
    expect(modelActions(BARE)).toEqual([])
  })
})
