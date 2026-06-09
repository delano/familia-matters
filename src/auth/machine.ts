// src/auth/machine.ts
//
// The auth gate as a pure, total reducer over AuthState (../types.ts). No side
// effects, no async, no I/O: every transition is a value-in/value-out mapping.
// The AuthProvider (stage 2) owns the effects and dispatches these actions.
//
// The subtle invariant: the login phase actions (submit/invalid/locked/error)
// are DUAL-CONTEXT. They drive the first-login form when `unauthenticated`, and
// the re-auth overlay's form when `authenticated && reauth.active`. The app
// tree stays mounted throughout re-auth so the operator's in-app location
// survives (ADR criterion 6). A wrong passphrase during re-auth must keep the
// authenticated state and only flip `reauth.login.phase` to 'error'.

import type {
  AuthAction,
  AuthState,
  Claims,
  LoginScreenState,
} from '../types'

export const initialAuthState: AuthState = { status: 'bootstrapping' }

/** A fresh authenticated state: app mounted, no overlay, no notice. */
function authenticated(claims: Claims): AuthState {
  return {
    status: 'authenticated',
    claims,
    reauth: { active: false },
    notice: null,
  }
}

/**
 * Apply a new login phase in whichever context owns the login form. In
 * `unauthenticated` it updates `login`; in `authenticated` with an active
 * reauth overlay it updates `reauth.login`. In any other situation the action
 * does not apply, so the state is returned unchanged.
 */
function withLoginPhase(
  state: AuthState,
  phase: LoginScreenState,
): AuthState {
  if (state.status === 'unauthenticated') {
    return { status: 'unauthenticated', login: phase }
  }
  if (state.status === 'authenticated' && state.reauth.active) {
    return { ...state, reauth: { active: true, login: phase } }
  }
  return state
}

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    // --- Bootstrap (only meaningful while bootstrapping, but harmless idempotent) ---
    case 'bootstrap/success':
      return authenticated(action.claims)

    case 'bootstrap/unauthenticated':
      return { status: 'unauthenticated', login: { phase: 'idle' } }

    // --- Login phase actions: dual-context (first login OR reauth overlay) ---
    case 'login/submit':
      return withLoginPhase(state, { phase: 'submitting' })

    case 'login/invalid':
      return withLoginPhase(state, { phase: 'error' })

    case 'login/locked':
      return withLoginPhase(state, {
        phase: 'locked',
        retryAfter: action.retryAfter,
      })

    case 'login/error':
      return withLoginPhase(state, { phase: 'error' })

    // --- Login success: only from the unauthenticated (first-login) form ---
    case 'login/success':
      if (state.status === 'unauthenticated') return authenticated(action.claims)
      return state

    // --- Re-auth success: clear the overlay, refresh claims, keep app mounted ---
    case 'reauth/success':
      if (state.status === 'authenticated') {
        return {
          status: 'authenticated',
          claims: action.claims,
          reauth: { active: false },
          notice: state.notice,
        }
      }
      return state

    // --- A protected call returned 401 mid-session: open the reauth overlay ---
    case 'session/expired':
      if (state.status === 'authenticated') {
        return { ...state, reauth: { active: true, login: { phase: 'idle' } } }
      }
      return state

    // --- A protected call returned 403: surface a notice, stay authenticated ---
    case 'permission/denied':
      if (state.status === 'authenticated') {
        return { ...state, notice: { message: action.message } }
      }
      return state

    case 'notice/dismiss':
      if (state.status === 'authenticated') {
        return { ...state, notice: null }
      }
      return state

    // --- Explicit logout: drop to unauthenticated (unmounts the app) ---
    case 'logout':
      return { status: 'unauthenticated', login: { phase: 'idle' } }

    default:
      return state
  }
}
