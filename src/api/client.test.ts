// src/api/client.test.ts
//
// Covers the status -> result-union mapping for every method, network/parse
// failures, and the inverse security property: the client never touches
// localStorage / sessionStorage / document.cookie and never surfaces a token.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { createAdminApi } from './client'
import type { Claims } from '../types'

const CLAIMS: Claims = {
  sub: 'admin@example.com',
  role: 'admin',
  permissions: ['repair', 'reveal_secrets'],
  exp: 1_900_000_000,
}

/** A fetch mock that is also assignable to `typeof fetch`. */
type FetchMock = Mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>

/** Build a JSON Response with a content-type header. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A mock fetch that returns the queued responses in order. */
function mockFetch(...responses: Response[]): FetchMock {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.shift()
    if (!next) throw new Error('mockFetch: no response queued')
    return next
  })
}

/** A mock fetch that always returns the same response (for call-arg inspection). */
function spyFetch(response: () => Response): FetchMock {
  return vi.fn(async () => response())
}

/** A mock fetch that throws (network failure). */
function throwingFetch(message = 'Failed to fetch'): FetchMock {
  return vi.fn(async () => {
    throw new TypeError(message)
  })
}

describe('createAdminApi.login', () => {
  it('200 with valid claims -> ok', async () => {
    const fetch = mockFetch(jsonResponse(CLAIMS, 200))
    const api = createAdminApi({ fetch })
    const result = await api.login('correct horse')
    expect(result).toEqual({ ok: true, claims: CLAIMS })
  })

  it('401 invalid_passphrase -> invalid (generic, no disclosure)', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'invalid_passphrase' }, 401))
    const result = await createAdminApi({ fetch }).login('nope')
    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('429 locked -> locked with retryAfter from retry_after', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'locked', retry_after: 42 }, 429))
    const result = await createAdminApi({ fetch }).login('nope')
    expect(result).toEqual({ ok: false, reason: 'locked', retryAfter: 42 })
  })

  it('429 with missing retry_after -> retryAfter defaults to 0', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'locked' }, 429))
    const result = await createAdminApi({ fetch }).login('nope')
    expect(result).toEqual({ ok: false, reason: 'locked', retryAfter: 0 })
  })

  it('429 with non-numeric retry_after -> retryAfter defaults to 0', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'locked', retry_after: 'soon' }, 429))
    const result = await createAdminApi({ fetch }).login('nope')
    expect(result).toEqual({ ok: false, reason: 'locked', retryAfter: 0 })
  })

  it('5xx -> error', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'boom' }, 500))
    const result = await createAdminApi({ fetch }).login('x')
    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('network throw -> error (never throws to caller)', async () => {
    const result = await createAdminApi({ fetch: throwingFetch() }).login('x')
    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('200 with unparseable body -> error', async () => {
    const fetch = mockFetch(
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    )
    const result = await createAdminApi({ fetch }).login('x')
    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('200 with JSON missing required claim fields -> error', async () => {
    const fetch = mockFetch(jsonResponse({ sub: 'a', role: 'admin' }, 200))
    const result = await createAdminApi({ fetch }).login('x')
    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('places the passphrase only in the JSON body, never the URL', async () => {
    const fetch = spyFetch(() => jsonResponse(CLAIMS, 200))
    await createAdminApi({ fetch }).login('s3cret-phrase')
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/admin/api/auth/login')
    expect(String(url)).not.toContain('s3cret-phrase')
    expect(init?.body).toBe(JSON.stringify({ passphrase: 's3cret-phrase' }))
    expect(init?.method).toBe('POST')
  })

  it('strips any incidental token field from the returned claims', async () => {
    const fetch = mockFetch(jsonResponse({ ...CLAIMS, token: 'LEAK' }, 200))
    const result = await createAdminApi({ fetch }).login('x')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.claims).toEqual(CLAIMS)
      expect('token' in result.claims).toBe(false)
    }
  })
})

describe('createAdminApi.getSession', () => {
  it('200 -> ok with claims', async () => {
    const fetch = mockFetch(jsonResponse(CLAIMS, 200))
    const result = await createAdminApi({ fetch }).getSession()
    expect(result).toEqual({ ok: true, claims: CLAIMS })
  })

  it('401 -> unauthenticated', async () => {
    const fetch = mockFetch(jsonResponse(undefined, 401))
    const result = await createAdminApi({ fetch }).getSession()
    expect(result).toEqual({ ok: false, reason: 'unauthenticated' })
  })

  it('network throw -> error', async () => {
    const result = await createAdminApi({ fetch: throwingFetch('down') }).getSession()
    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('5xx -> error', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'boom' }, 503))
    const result = await createAdminApi({ fetch }).getSession()
    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('uses GET on the session path', async () => {
    const fetch = spyFetch(() => jsonResponse(CLAIMS, 200))
    await createAdminApi({ fetch }).getSession()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/admin/api/auth/session')
    expect(init?.method).toBe('GET')
  })
})

describe('createAdminApi.logout', () => {
  it('200 ok:true response -> ok:true', async () => {
    const fetch = mockFetch(jsonResponse({ ok: true }, 200))
    const result = await createAdminApi({ fetch }).logout()
    expect(result).toEqual({ ok: true })
  })

  it('error status -> ok:false', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'boom' }, 500))
    const result = await createAdminApi({ fetch }).logout()
    expect(result).toEqual({ ok: false })
  })

  it('network throw -> ok:false', async () => {
    const result = await createAdminApi({ fetch: throwingFetch('down') }).logout()
    expect(result).toEqual({ ok: false })
  })

  it('uses DELETE on the session path', async () => {
    const fetch = spyFetch(() => jsonResponse({ ok: true }, 200))
    await createAdminApi({ fetch }).logout()
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/admin/api/auth/session')
    expect(init?.method).toBe('DELETE')
  })
})

describe('createAdminApi.request', () => {
  it('2xx -> ok with typed data', async () => {
    const fetch = mockFetch(jsonResponse({ count: 3 }, 200))
    const result = await createAdminApi({ fetch }).request<{ count: number }>('/stats')
    expect(result).toEqual({ ok: true, data: { count: 3 } })
  })

  it('401 -> unauthenticated (re-auth, not logout)', async () => {
    const fetch = mockFetch(jsonResponse(undefined, 401))
    const result = await createAdminApi({ fetch }).request('/repair')
    expect(result).toEqual({ ok: false, reason: 'unauthenticated' })
  })

  it('403 -> forbidden with message from body.error', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'missing repair permission' }, 403))
    const result = await createAdminApi({ fetch }).request('/repair')
    expect(result).toEqual({
      ok: false,
      reason: 'forbidden',
      message: 'missing repair permission',
    })
  })

  it('403 with no body -> forbidden with undefined message', async () => {
    const fetch = mockFetch(jsonResponse(undefined, 403))
    const result = await createAdminApi({ fetch }).request('/repair')
    expect(result).toEqual({ ok: false, reason: 'forbidden', message: undefined })
  })

  it('other non-2xx -> error with status', async () => {
    const fetch = mockFetch(jsonResponse({ error: 'boom' }, 500))
    const result = await createAdminApi({ fetch }).request('/repair')
    expect(result).toEqual({ ok: false, reason: 'error', status: 500 })
  })

  it('network throw -> error', async () => {
    const result = await createAdminApi({ fetch: throwingFetch('down') }).request('/repair')
    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('prefixes /admin/api exactly once and honors baseUrl', async () => {
    const fetch = spyFetch(() => jsonResponse({}, 200))
    await createAdminApi({ fetch, baseUrl: 'https://host' }).request('/repair')
    expect(fetch.mock.calls[0][0]).toBe('https://host/admin/api/repair')
  })
})

describe('request wiring (headers / credentials)', () => {
  it('every request sends credentials:same-origin and Accept:application/json', async () => {
    const fetch = spyFetch(() => jsonResponse(CLAIMS, 200))
    await createAdminApi({ fetch }).getSession()
    const init = fetch.mock.calls[0][1] as RequestInit
    expect(init.credentials).toBe('same-origin')
    const headers = new Headers(init.headers)
    expect(headers.get('Accept')).toBe('application/json')
  })

  it('bodied requests set content-type application/json', async () => {
    const fetch = spyFetch(() => jsonResponse(CLAIMS, 200))
    await createAdminApi({ fetch }).login('x')
    const init = fetch.mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('content-type')).toBe('application/json')
  })
})

describe('inverse security property: no client-side storage access', () => {
  let cookieSpy: Mock<() => never>
  let localSpy: Mock<() => never>
  let sessionSpy: Mock<() => never>
  let cookieDescriptor: PropertyDescriptor | undefined
  let localDescriptor: PropertyDescriptor | undefined
  let sessionDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    cookieSpy = vi.fn((): never => {
      throw new Error('document.cookie must not be touched')
    })
    localSpy = vi.fn((): never => {
      throw new Error('localStorage must not be touched')
    })
    sessionSpy = vi.fn((): never => {
      throw new Error('sessionStorage must not be touched')
    })

    cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
    localDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    sessionDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage')

    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: cookieSpy,
      set: cookieSpy,
    })
    Object.defineProperty(window, 'localStorage', { configurable: true, get: localSpy })
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: sessionSpy })
  })

  afterEach(() => {
    // `cookie` was installed as an own property on the document instance; remove
    // it so the prototype getter takes over again. (Restoring the prototype
    // descriptor is a no-op against the lingering own property.)
    delete (document as unknown as { cookie?: unknown }).cookie
    if (cookieDescriptor) Object.defineProperty(Document.prototype, 'cookie', cookieDescriptor)
    if (localDescriptor) Object.defineProperty(window, 'localStorage', localDescriptor)
    if (sessionDescriptor) Object.defineProperty(window, 'sessionStorage', sessionDescriptor)
  })

  it('exercises every method without reading or writing storage or cookies', async () => {
    const fetch = mockFetch(
      jsonResponse(CLAIMS, 200), // login
      jsonResponse(CLAIMS, 200), // getSession
      jsonResponse({ ok: true }, 200), // logout
      jsonResponse({ data: 1 }, 200), // request
    )
    const api = createAdminApi({ fetch })

    await api.login('s3cret')
    await api.getSession()
    await api.logout()
    await api.request('/anything')

    expect(cookieSpy).not.toHaveBeenCalled()
    expect(localSpy).not.toHaveBeenCalled()
    expect(sessionSpy).not.toHaveBeenCalled()
  })
})
