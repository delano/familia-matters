// src/router/hashRouter.test.tsx
//
// The pure hash -> path normalizer, and the hook's subscription to hashchange.
// jsdom fires hashchange when location.hash is assigned; the tests also
// dispatch the event explicitly so they do not depend on jsdom's async timing.

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { pathFromHash, routeHref, useHashRoute } from './hashRouter'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

function setHash(hash: string): void {
  window.location.hash = hash
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

describe('pathFromHash', () => {
  it('normalizes empty and bare-# hashes to the root route', () => {
    expect(pathFromHash('')).toBe('/')
    expect(pathFromHash('#')).toBe('/')
  })

  it('strips the # and guarantees a leading slash', () => {
    expect(pathFromHash('#/records')).toBe('/records')
    expect(pathFromHash('#records')).toBe('/records')
  })

  it('drops a trailing slash (but keeps the root)', () => {
    expect(pathFromHash('#/records/')).toBe('/records')
    expect(pathFromHash('#/')).toBe('/')
  })
})

describe('routeHref', () => {
  it('builds the anchor href for a route path', () => {
    expect(routeHref('/records')).toBe('#/records')
    expect(routeHref('/')).toBe('#/')
  })
})

describe('useHashRoute', () => {
  it('reads the initial route from the current hash', () => {
    window.location.hash = '#/models'
    const { result } = renderHook(() => useHashRoute())
    expect(result.current).toBe('/models')
  })

  it('follows hashchange events', async () => {
    const { result } = renderHook(() => useHashRoute())
    expect(result.current).toBe('/')

    setHash('#/integrity')
    await waitFor(() => expect(result.current).toBe('/integrity'))

    setHash('#/')
    await waitFor(() => expect(result.current).toBe('/'))
  })

  it('stops listening after unmount', () => {
    const { result, unmount } = renderHook(() => useHashRoute())
    unmount()
    setHash('#/explorer')
    expect(result.current).toBe('/')
  })
})
