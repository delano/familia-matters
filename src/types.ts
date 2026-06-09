// src/types.ts
//
// Frozen contract for the admin auth UI (docs/familia-admin-auth-ui-spec.md,
// ADR docs/adr/0001-auth-ui-flow.md). Every module imports its shapes from here
// so the type-coupled chain (api -> machine -> provider -> components -> App)
// cannot drift. Do not redefine these locally.
//
// Backend contract these mirror (lib/familia/admin/sessions.rb, auth.rb):
//   POST   /admin/api/auth/login    {passphrase} -> 200 Claims (+ HttpOnly cookie)
//                                                 | 401 {error:'invalid_passphrase'}
//                                                 | 429 {error:'locked', retry_after}
//   GET    /admin/api/auth/session               -> 200 Claims | 401
//   DELETE /admin/api/auth/session               -> 200 {ok:true}
//   Protected routes: 401 = authenticate again (expired/absent session),
//                     403 = authorization denied (stay authenticated).
// The session token is an HttpOnly cookie: it NEVER appears in a response body
// and is NEVER read or written by this client (no localStorage, no document.cookie).

/** Verified session claims returned by login and the session endpoint. */
export interface Claims {
  /** Subject (the admin identity). */
  sub: string
  /** Role claim; the browser session is always `admin`. */
  role: string
  /** Granted elevated permissions (e.g. `repair`, `reveal_secrets`). */
  permissions: string[]
  /** Expiry as Unix epoch seconds (the PASETO `exp` claim). */
  exp: number
}

// ---------------------------------------------------------------------------
// API client result unions (src/api/client.ts)
// ---------------------------------------------------------------------------

/** Outcome of POST /admin/api/auth/login. */
export type LoginResult =
  | { ok: true; claims: Claims }
  /** 401 invalid_passphrase, or any non-locked auth failure (generic, no disclosure). */
  | { ok: false; reason: 'invalid' }
  /** 429 locked; `retryAfter` is seconds until the lockout window elapses. */
  | { ok: false; reason: 'locked'; retryAfter: number }
  /** Network failure, 5xx, or an unexpected/unparseable response. */
  | { ok: false; reason: 'error' }

/** Outcome of GET /admin/api/auth/session (UI bootstrap). */
export type SessionResult =
  | { ok: true; claims: Claims }
  /** 401: no valid session — render the login screen. */
  | { ok: false; reason: 'unauthenticated' }
  /** Network failure or 5xx — treated as unauthenticated by the gate, surfaced separately if needed. */
  | { ok: false; reason: 'error' }

/** Outcome of DELETE /admin/api/auth/session. `ok` is best-effort; the cookie clear is server-side. */
export type LogoutResult = { ok: boolean }

/**
 * Outcome of an authenticated request against a protected route. The 401/403
 * split is the contract that lets the UI tell "authenticate again" from "you
 * lack this permission" (ADR decision 4) — keyed on HTTP status, not body.
 */
export type ApiOutcome<T> =
  | { ok: true; data: T }
  /** 401: session expired/absent -> trigger re-auth (preserve location). */
  | { ok: false; reason: 'unauthenticated' }
  /** 403: authorization denied -> report without logging out. */
  | { ok: false; reason: 'forbidden'; message?: string }
  /** Other non-2xx or network/parse failure. */
  | { ok: false; reason: 'error'; status?: number }

// ---------------------------------------------------------------------------
// Login form state (src/components/Login.tsx, ReauthOverlay.tsx)
// ---------------------------------------------------------------------------

/** The four spec-named login states: idle, submitting, error, locked. */
export type LoginScreenState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  /** Generic authentication error (does not disclose which part failed). */
  | { phase: 'error' }
  /** Rate-limited; `retryAfter` is seconds remaining in the lockout window. */
  | { phase: 'locked'; retryAfter: number }

/** A transient banner shown when a specific action is denied for lack of permission (403). */
export interface PermissionNotice {
  message?: string
}

/** Re-authentication sub-state: when active, the authenticated app stays mounted underneath. */
export type ReauthState =
  | { active: false }
  | { active: true; login: LoginScreenState }

// ---------------------------------------------------------------------------
// Auth state machine (src/auth/machine.ts) — a pure reducer over these.
// ---------------------------------------------------------------------------

/**
 * The gate state. `bootstrapping` is the indeterminate state while the initial
 * session query is in flight. `authenticated` keeps the app mounted; an expired
 * session sets `reauth.active` rather than dropping to `unauthenticated`, so the
 * operator's in-app location survives re-authentication.
 */
export type AuthState =
  | { status: 'bootstrapping' }
  | { status: 'unauthenticated'; login: LoginScreenState }
  | {
      status: 'authenticated'
      claims: Claims
      reauth: ReauthState
      notice: PermissionNotice | null
    }

/** Reducer actions. */
export type AuthAction =
  | { type: 'bootstrap/success'; claims: Claims }
  | { type: 'bootstrap/unauthenticated' }
  | { type: 'login/submit' }
  | { type: 'login/success'; claims: Claims }
  | { type: 'login/invalid' }
  | { type: 'login/locked'; retryAfter: number }
  | { type: 'login/error' }
  /** A protected action returned 401 mid-session: enter re-auth, keep app mounted. */
  | { type: 'session/expired' }
  /** Re-auth login succeeded: clear the overlay, refresh claims, restore location. */
  | { type: 'reauth/success'; claims: Claims }
  /** A protected action returned 403: surface a notice, stay authenticated. */
  | { type: 'permission/denied'; message?: string }
  | { type: 'notice/dismiss' }
  /** Explicit logout: drop to `unauthenticated` (unmounts the app). */
  | { type: 'logout' }
