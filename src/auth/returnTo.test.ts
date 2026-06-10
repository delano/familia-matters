// src/auth/returnTo.test.ts
//
// The return_to sanitizer is the SPA's open-redirect guard: the value arrives
// on an attacker-visitable URL, so every escape shape must collapse to '/'.

import { describe, expect, it } from 'vitest'

import { handoffTarget, sanitizeReturnTo } from './returnTo'

describe('handoffTarget', () => {
  it('returns null when the search string has no return_to (direct visit)', () => {
    expect(handoffTarget('')).toBeNull()
    expect(handoffTarget('?other=1')).toBeNull()
  })

  it('returns the decoded same-origin path, query intact', () => {
    expect(handoffTarget('?return_to=%2Fmodels%3Ffoo%3D1')).toBe('/models?foo=1')
  })

  it('keeps a percent-encoded path encoded after one decode (navigable as-is)', () => {
    // The server gate escapes the still-encoded PATH_INFO once; one decode here
    // yields the exact original request target for location.replace.
    expect(handoffTarget('?return_to=%2FFamilia%2520Admin.html')).toBe('/Familia%20Admin.html')
  })

  it('decodes + as space (URLSearchParams form-encoding semantics)', () => {
    expect(handoffTarget('?return_to=%2FFamilia+Admin.html')).toBe('/Familia Admin.html')
  })

  it('uses the first value when return_to repeats', () => {
    expect(handoffTarget('?return_to=%2Fa&return_to=%2F%2Fevil.com')).toBe('/a')
  })

  it('sanitizes an unsafe present value to / (does not treat it as absent)', () => {
    expect(handoffTarget('?return_to=https%3A%2F%2Fevil.example')).toBe('/')
    expect(handoffTarget('?return_to=')).toBe('/')
  })
})

describe('sanitizeReturnTo', () => {
  it('accepts same-origin absolute paths', () => {
    expect(sanitizeReturnTo('/')).toBe('/')
    expect(sanitizeReturnTo('/Familia Admin.html')).toBe('/Familia Admin.html')
    expect(sanitizeReturnTo('/a/b?c=d#e')).toBe('/a/b?c=d#e')
  })

  it.each([
    ['protocol-relative', '//evil.example'],
    ['backslash protocol-relative', '/\\evil.example'],
    ['absolute https URL', 'https://evil.example/x'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['relative path', 'models'],
    ['empty string', ''],
  ])('falls back to / for %s', (_label, raw) => {
    expect(sanitizeReturnTo(raw)).toBe('/')
  })
})
