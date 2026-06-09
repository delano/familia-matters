// src/api/client.ts
//
// The admin API client. Maps the backend HTTP contract
// (lib/familia/admin/sessions.rb, auth.rb) onto the result unions in
// ../types.ts. Every method resolves to a discriminated union and NEVER throws
// to the caller: network failures and unparseable bodies collapse into the
// union's `error` branch.
//
// Security invariants (the point of the feature):
//   - credentials:'same-origin' so the HttpOnly session cookie rides along
//     automatically; this client never reads or writes it.
//   - No localStorage / sessionStorage / document.cookie access. No token is
//     read, stored, logged, or rendered — the login/session bodies carry
//     claims only.
//   - The passphrase appears ONLY in the POST /login JSON body, never in a URL,
//     query, log, or persisted anywhere.

import type {
  ApiOutcome,
  Claims,
  LoginResult,
  LogoutResult,
  SessionResult,
} from '../types'

/** Base path every admin endpoint hangs off. */
const API_PREFIX = '/admin/api'

export interface AdminApi {
  login(passphrase: string): Promise<LoginResult>
  getSession(): Promise<SessionResult>
  logout(): Promise<LogoutResult>
  /**
   * Issue an authenticated request against a protected route. `path` is relative
   * to `/admin/api` (e.g. `/repair`); the client prefixes it exactly once. The
   * 401/403 split is preserved per the ADR: 401 -> unauthenticated (re-auth),
   * 403 -> forbidden (stay authenticated).
   */
  request<T = unknown>(path: string, init?: RequestInit): Promise<ApiOutcome<T>>
}

interface AdminApiOptions {
  baseUrl?: string
  fetch?: typeof fetch
}

/** A fetch that resolved (no network throw); body may still be unparseable. */
interface RawResponse {
  status: number
  /** Parsed JSON body, or undefined when absent/unparseable. */
  body: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Narrow an arbitrary JSON body to Claims, returning null when it doesn't fit. */
function asClaims(body: unknown): Claims | null {
  if (!isRecord(body)) return null
  const { sub, role, permissions, exp } = body
  if (typeof sub !== 'string') return null
  if (typeof role !== 'string') return null
  if (typeof exp !== 'number') return null
  if (!Array.isArray(permissions)) return null
  if (!permissions.every((p) => typeof p === 'string')) return null
  // Reconstruct so callers never see incidental fields (e.g. a stray token).
  return { sub, role, permissions: permissions as string[], exp }
}

/** Pull a string `error` message out of a body, undefined-safe. */
function errorMessage(body: unknown): string | undefined {
  if (isRecord(body) && typeof body.error === 'string') return body.error
  return undefined
}

/** Pull `retry_after` seconds out of a 429 body; default 0 when missing/bad. */
function retryAfter(body: unknown): number {
  if (isRecord(body)) {
    const raw = body.retry_after
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  }
  return 0
}

export function createAdminApi(opts?: AdminApiOptions): AdminApi {
  const baseUrl = opts?.baseUrl ?? ''
  // Bind to the receiver: a detached `globalThis.fetch` reference throws
  // "Illegal invocation" in real browsers (passes in jsdom/undici otherwise).
  const doFetch: typeof fetch =
    opts?.fetch ?? globalThis.fetch.bind(globalThis)

  /**
   * Perform a request and normalize the outcome. Resolves to a RawResponse on
   * any HTTP reply (parsing the JSON body best-effort), or null when the
   * network throws or the body is present but unparseable as JSON.
   */
  async function call(
    path: string,
    init?: RequestInit,
  ): Promise<RawResponse | null> {
    const headers = new Headers(init?.headers)
    headers.set('Accept', 'application/json')
    if (init?.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    let response: Response
    try {
      response = await doFetch(`${baseUrl}${API_PREFIX}${path}`, {
        ...init,
        headers,
        credentials: 'same-origin',
      })
    } catch {
      return null // network failure
    }

    // Parse the body best-effort. A 204 / empty body yields undefined; a
    // present-but-malformed body collapses to a parse failure (null) so callers
    // route it to their `error` branch.
    let body: unknown
    const text = await response.text().catch(() => '')
    if (text.length > 0) {
      try {
        body = JSON.parse(text)
      } catch {
        return null
      }
    }
    return { status: response.status, body }
  }

  async function login(passphrase: string): Promise<LoginResult> {
    const res = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ passphrase }),
    })
    if (res === null) return { ok: false, reason: 'error' }

    if (res.status === 429) {
      return { ok: false, reason: 'locked', retryAfter: retryAfter(res.body) }
    }
    if (res.status === 401) return { ok: false, reason: 'invalid' }
    if (res.status >= 200 && res.status < 300) {
      const claims = asClaims(res.body)
      if (claims) return { ok: true, claims }
      return { ok: false, reason: 'error' }
    }
    return { ok: false, reason: 'error' }
  }

  async function getSession(): Promise<SessionResult> {
    const res = await call('/auth/session', { method: 'GET' })
    if (res === null) return { ok: false, reason: 'error' }

    if (res.status === 401) return { ok: false, reason: 'unauthenticated' }
    if (res.status >= 200 && res.status < 300) {
      const claims = asClaims(res.body)
      if (claims) return { ok: true, claims }
      return { ok: false, reason: 'error' }
    }
    return { ok: false, reason: 'error' }
  }

  async function logout(): Promise<LogoutResult> {
    const res = await call('/auth/session', { method: 'DELETE' })
    if (res === null) return { ok: false }
    return { ok: res.status >= 200 && res.status < 300 }
  }

  async function request<T = unknown>(
    path: string,
    init?: RequestInit,
  ): Promise<ApiOutcome<T>> {
    const res = await call(path, init)
    if (res === null) return { ok: false, reason: 'error' }

    if (res.status === 401) return { ok: false, reason: 'unauthenticated' }
    if (res.status === 403) {
      return { ok: false, reason: 'forbidden', message: errorMessage(res.body) }
    }
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, data: res.body as T }
    }
    return { ok: false, reason: 'error', status: res.status }
  }

  return { login, getSession, logout, request }
}

/** Singleton bound to the ambient fetch, same-origin, no base URL. */
export const adminApi: AdminApi = createAdminApi()
