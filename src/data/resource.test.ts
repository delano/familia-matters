// src/data/resource.test.ts
//
// The ApiOutcome-failure -> ResourceError mapping. The load-bearing property:
// every distinct refusal the API can issue survives the mapping with its
// machine-readable code intact, and a missing status maps to 'unreachable'
// (the signal the ErrorState renders as "backend down", never as data).

import { describe, expect, it } from 'vitest'

import { errorCode, toResourceError } from './resource'

describe('errorCode', () => {
  it('extracts the error string from a body', () => {
    expect(errorCode({ error: 'scan_unavailable' })).toBe('scan_unavailable')
  })

  it('returns undefined for non-objects, null, and non-string error fields', () => {
    expect(errorCode(undefined)).toBeUndefined()
    expect(errorCode(null)).toBeUndefined()
    expect(errorCode('read_only')).toBeUndefined()
    expect(errorCode({ error: 42 })).toBeUndefined()
    expect(errorCode({})).toBeUndefined()
  })
})

describe('toResourceError', () => {
  it('401 -> unauthenticated', () => {
    expect(toResourceError({ ok: false, reason: 'unauthenticated' })).toEqual({
      kind: 'unauthenticated',
      status: 401,
    })
  })

  it('403 read_only -> forbidden with code from the body', () => {
    const err = toResourceError({
      ok: false,
      reason: 'forbidden',
      message: 'read_only',
      body: { error: 'read_only' },
    })
    expect(err).toEqual({
      kind: 'forbidden',
      status: 403,
      code: 'read_only',
      body: { error: 'read_only' },
    })
  })

  it('403 command_blocked keeps the body (required_tier rides along)', () => {
    const body = { error: 'command_blocked', required_tier: 'danger' }
    const err = toResourceError({ ok: false, reason: 'forbidden', message: 'command_blocked', body })
    expect(err.kind).toBe('forbidden')
    expect(err.code).toBe('command_blocked')
    expect(err.body).toEqual(body)
  })

  it('403 with no body falls back to the message for the code', () => {
    const err = toResourceError({ ok: false, reason: 'forbidden', message: 'nope' })
    expect(err).toEqual({ kind: 'forbidden', status: 403, code: 'nope', body: undefined })
  })

  it('400 scan_unavailable -> http with code', () => {
    const err = toResourceError({
      ok: false,
      reason: 'error',
      status: 400,
      body: { error: 'scan_unavailable' },
    })
    expect(err).toEqual({
      kind: 'http',
      status: 400,
      code: 'scan_unavailable',
      body: { error: 'scan_unavailable' },
    })
  })

  it('409 record_exists -> http with code', () => {
    const err = toResourceError({
      ok: false,
      reason: 'error',
      status: 409,
      body: { error: 'record_exists' },
    })
    expect(err.kind).toBe('http')
    expect(err.status).toBe(409)
    expect(err.code).toBe('record_exists')
  })

  it('error with NO status -> unreachable (the backend-down signal)', () => {
    expect(toResourceError({ ok: false, reason: 'error' })).toEqual({
      kind: 'unreachable',
    })
  })
})
