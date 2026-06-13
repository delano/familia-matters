// src/auth/AuthProvider.tsx
//
// The auth context: owns the side effects (the AdminApi calls and the mount-time
// session bootstrap) and dispatches the pure reducer's AuthAction (../auth/machine.ts).
// Components consume it via useAuth(); the gate (App.tsx) reads `state`.
//
// The reducer is pure and total; this provider is the only place I/O happens.
//
// The subtle point (ADR criterion 6): login() is the single submit handler for
// BOTH the first-login form and the re-auth overlay. To pick reauth/success vs
// login/success after the await, it reads the LIVE status via a ref — not a
// closed-over `state`, which would be stale and silently no-op the reauth path.

import type React from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from 'react'

import { adminApi, type AdminApi } from '../api/client'
import type { AuthAction, ApiOutcome, AuthState } from '../types'
import { authReducer, initialAuthState } from './machine'

/**
 * If the active login context is in the `locked` phase, describe how to recover:
 * the seconds to wait and the (existing) action that returns that context to an
 * idle, submittable form. Returns null when nothing is locked. `context`
 * distinguishes the two so the recovery effect reschedules on a context change.
 */
function currentLockout(
  state: AuthState,
): { context: 'login' | 'reauth'; retryAfter: number; resetAction: AuthAction } | null {
  if (state.status === 'unauthenticated' && state.login.phase === 'locked') {
    return {
      context: 'login',
      retryAfter: state.login.retryAfter,
      resetAction: { type: 'bootstrap/unauthenticated' },
    }
  }
  if (
    state.status === 'authenticated' &&
    state.reauth.active &&
    state.reauth.login.phase === 'locked'
  ) {
    return {
      context: 'reauth',
      retryAfter: state.reauth.login.retryAfter,
      resetAction: { type: 'session/expired' },
    }
  }
  return null
}

export interface AuthContextValue {
  state: AuthState
  login(passphrase: string): Promise<void>
  logout(): Promise<void>
  /**
   * Run an authenticated API call. On success returns the data. On 401 dispatches
   * session/expired (opens the reauth overlay, app stays mounted) and returns null.
   * On 403 dispatches permission/denied (notice, stays authenticated) and returns
   * null. On any other failure returns null without changing auth state.
   */
  call<T>(fn: (api: AdminApi) => Promise<ApiOutcome<T>>): Promise<T | null>
  /**
   * Like call(), but outcome-preserving: resolves to the full ApiOutcome so the
   * caller can render the SPECIFIC refusal (read_only, scan_unavailable,
   * command_blocked, record_exists, backend-unreachable) instead of a null it
   * cannot explain. The one global side effect is kept: 401 still dispatches
   * session/expired so the reauth overlay opens over the mounted app. 403 is
   * deliberately NOT turned into the global PermissionNotice here — callers of
   * this variant own their error rendering (an unmissable inline state), and
   * double-reporting would let a dismissible banner upstage it.
   */
  callOutcome<T>(fn: (api: AdminApi) => Promise<ApiOutcome<T>>): Promise<ApiOutcome<T>>
  dismissNotice(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: React.ReactNode
  api?: AdminApi
}

export function AuthProvider(props: AuthProviderProps): React.JSX.Element {
  const { children, api = adminApi } = props
  const [state, dispatch] = useReducer(authReducer, initialAuthState)

  // Live view of state for callbacks that read it across an await. A closed-over
  // `state` would be frozen at the value when the callback was created.
  const stateRef = useRef(state)
  stateRef.current = state

  // Bootstrap: resolve the indeterminate state by querying the session once.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await api.getSession()
      if (cancelled) return
      if (result.ok) {
        dispatch({ type: 'bootstrap/success', claims: result.claims })
      } else {
        dispatch({ type: 'bootstrap/unauthenticated' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  // Lockout recovery (criterion 4: the locked window must elapse in the UI, and
  // for the reauth overlay it MUST recover without a reload or the preserved
  // location is lost — criterion 6). `locked` is otherwise a terminal reducer
  // state: nothing else flips it back to `idle`. So when the active login context
  // is locked, schedule a timer for `retryAfter` seconds that returns that context
  // to an idle, submittable form.
  //
  // No new AuthAction is needed: each context already has a reach-idle transition
  // in the frozen union. Re-auth overlay -> `session/expired` (stays authenticated,
  // reopens an idle overlay, preserving claims/notice). First login -> a fresh
  // `bootstrap/unauthenticated` (idle login screen). The context cannot change
  // while locked (submit is disabled, logout sits under the backdrop), so the
  // action chosen at schedule time is still the right one when the timer fires.
  const lockout = currentLockout(state)
  const lockoutRetryAfter = lockout?.retryAfter ?? null
  useEffect(() => {
    if (lockout === null) return
    const timer = setTimeout(() => dispatch(lockout.resetAction), lockout.retryAfter * 1000)
    return () => clearTimeout(timer)
    // lockoutRetryAfter is in deps so a re-lock (which passes through `submitting`,
    // clearing the lockout to null and back) reschedules the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockout?.context, lockoutRetryAfter])

  const login = useCallback(
    async (passphrase: string): Promise<void> => {
      // Capture the context BEFORE the await: are we re-authenticating inside the
      // mounted app, or logging in fresh? login/submit does not change `status`,
      // so this pre-await read stays correct.
      const wasReauth = stateRef.current.status === 'authenticated'

      dispatch({ type: 'login/submit' })
      const result = await api.login(passphrase)

      if (result.ok) {
        dispatch(
          wasReauth
            ? { type: 'reauth/success', claims: result.claims }
            : { type: 'login/success', claims: result.claims },
        )
        return
      }

      switch (result.reason) {
        case 'locked':
          dispatch({ type: 'login/locked', retryAfter: result.retryAfter })
          return
        case 'invalid':
          dispatch({ type: 'login/invalid' })
          return
        default:
          // 'error' (network/5xx/unparseable): one generic auth error, no disclosure.
          dispatch({ type: 'login/invalid' })
          return
      }
    },
    [api],
  )

  const logout = useCallback(async (): Promise<void> => {
    await api.logout()
    dispatch({ type: 'logout' })
  }, [api])

  const call = useCallback(
    async <T,>(fn: (api: AdminApi) => Promise<ApiOutcome<T>>): Promise<T | null> => {
      const outcome = await fn(api)
      if (outcome.ok) return outcome.data
      switch (outcome.reason) {
        case 'unauthenticated':
          dispatch({ type: 'session/expired' })
          return null
        case 'forbidden':
          dispatch({ type: 'permission/denied', message: outcome.message })
          return null
        default:
          return null
      }
    },
    [api],
  )

  const callOutcome = useCallback(
    async <T,>(fn: (api: AdminApi) => Promise<ApiOutcome<T>>): Promise<ApiOutcome<T>> => {
      const outcome = await fn(api)
      if (!outcome.ok && outcome.reason === 'unauthenticated') {
        dispatch({ type: 'session/expired' })
      }
      return outcome
    },
    [api],
  )

  const dismissNotice = useCallback((): void => {
    dispatch({ type: 'notice/dismiss' })
  }, [])

  const value: AuthContextValue = {
    state,
    login,
    logout,
    call,
    callOutcome,
    dismissNotice,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}
