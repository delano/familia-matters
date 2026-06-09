// src/auth/machine.test.ts
//
// Exercises every AuthAction transition of the pure reducer, including the
// dual-context login phase actions (first login vs re-auth overlay), the
// status guards (actions that don't apply must no-op, not crash), and the
// unknown-action fallthrough.

import { describe, expect, it } from 'vitest'
import { authReducer, initialAuthState } from './machine'
import type { AuthAction, AuthState, Claims } from '../types'

const CLAIMS: Claims = {
  sub: 'admin@example.com',
  role: 'admin',
  permissions: ['repair'],
  exp: 1_900_000_000,
}

const CLAIMS2: Claims = { ...CLAIMS, sub: 'second@example.com', exp: 2_000_000_000 }

const UNAUTH_IDLE: AuthState = {
  status: 'unauthenticated',
  login: { phase: 'idle' },
}

function authed(over: Partial<Extract<AuthState, { status: 'authenticated' }>> = {}): AuthState {
  return {
    status: 'authenticated',
    claims: CLAIMS,
    reauth: { active: false },
    notice: null,
    ...over,
  }
}

describe('initialAuthState', () => {
  it('starts in the indeterminate bootstrapping state', () => {
    expect(initialAuthState).toEqual({ status: 'bootstrapping' })
  })
})

describe('bootstrap transitions', () => {
  it('bootstrap/success -> authenticated with reauth inactive and no notice', () => {
    const next = authReducer(initialAuthState, { type: 'bootstrap/success', claims: CLAIMS })
    expect(next).toEqual({
      status: 'authenticated',
      claims: CLAIMS,
      reauth: { active: false },
      notice: null,
    })
  })

  it('bootstrap/unauthenticated -> unauthenticated idle login', () => {
    const next = authReducer(initialAuthState, { type: 'bootstrap/unauthenticated' })
    expect(next).toEqual(UNAUTH_IDLE)
  })
})

describe('first-login flow (unauthenticated)', () => {
  it('login/submit -> submitting', () => {
    const next = authReducer(UNAUTH_IDLE, { type: 'login/submit' })
    expect(next).toEqual({ status: 'unauthenticated', login: { phase: 'submitting' } })
  })

  it('login/invalid -> error', () => {
    const submitting: AuthState = { status: 'unauthenticated', login: { phase: 'submitting' } }
    expect(authReducer(submitting, { type: 'login/invalid' })).toEqual({
      status: 'unauthenticated',
      login: { phase: 'error' },
    })
  })

  it('login/error -> error', () => {
    const submitting: AuthState = { status: 'unauthenticated', login: { phase: 'submitting' } }
    expect(authReducer(submitting, { type: 'login/error' })).toEqual({
      status: 'unauthenticated',
      login: { phase: 'error' },
    })
  })

  it('login/locked -> locked carrying retryAfter', () => {
    const next = authReducer(UNAUTH_IDLE, { type: 'login/locked', retryAfter: 30 })
    expect(next).toEqual({ status: 'unauthenticated', login: { phase: 'locked', retryAfter: 30 } })
  })

  it('login/success -> authenticated, app mounted, no overlay/notice', () => {
    const submitting: AuthState = { status: 'unauthenticated', login: { phase: 'submitting' } }
    expect(authReducer(submitting, { type: 'login/success', claims: CLAIMS })).toEqual({
      status: 'authenticated',
      claims: CLAIMS,
      reauth: { active: false },
      notice: null,
    })
  })
})

describe('session expiry -> re-auth -> restore (location-preserving)', () => {
  it('session/expired opens the overlay with an idle login and keeps claims', () => {
    const next = authReducer(authed({ notice: { message: 'x' } }), { type: 'session/expired' })
    expect(next).toEqual({
      status: 'authenticated',
      claims: CLAIMS,
      reauth: { active: true, login: { phase: 'idle' } },
      notice: { message: 'x' },
    })
  })

  it('login/submit during reauth flips reauth.login.phase, app stays authenticated', () => {
    const overlay = authed({ reauth: { active: true, login: { phase: 'idle' } } })
    const next = authReducer(overlay, { type: 'login/submit' })
    expect(next).toEqual(authed({ reauth: { active: true, login: { phase: 'submitting' } } }))
  })

  it('login/invalid during reauth keeps the app and shows error in the overlay', () => {
    // The dual-context catch: a wrong passphrase mid-session must NOT drop state.
    let s = authed()
    s = authReducer(s, { type: 'session/expired' })
    s = authReducer(s, { type: 'login/submit' })
    s = authReducer(s, { type: 'login/invalid' })
    expect(s).toEqual(authed({ reauth: { active: true, login: { phase: 'error' } } }))
    expect(s.status).toBe('authenticated')
  })

  it('login/locked during reauth keeps the app and shows locked in the overlay', () => {
    const overlay = authed({ reauth: { active: true, login: { phase: 'submitting' } } })
    const next = authReducer(overlay, { type: 'login/locked', retryAfter: 12 })
    expect(next).toEqual(authed({ reauth: { active: true, login: { phase: 'locked', retryAfter: 12 } } }))
  })

  it('reauth/success clears the overlay, refreshes claims, keeps the app mounted', () => {
    const overlay = authed({ reauth: { active: true, login: { phase: 'submitting' } } })
    const next = authReducer(overlay, { type: 'reauth/success', claims: CLAIMS2 })
    expect(next).toEqual({
      status: 'authenticated',
      claims: CLAIMS2,
      reauth: { active: false },
      notice: null,
    })
  })

  it('reauth/success preserves an existing notice', () => {
    const overlay = authed({
      reauth: { active: true, login: { phase: 'submitting' } },
      notice: { message: 'kept' },
    })
    const next = authReducer(overlay, { type: 'reauth/success', claims: CLAIMS2 })
    expect(next).toEqual({
      status: 'authenticated',
      claims: CLAIMS2,
      reauth: { active: false },
      notice: { message: 'kept' },
    })
  })
})

describe('permission notice (403 without logout)', () => {
  it('permission/denied sets a notice and stays authenticated', () => {
    const next = authReducer(authed(), { type: 'permission/denied', message: 'no repair perm' })
    expect(next).toEqual(authed({ notice: { message: 'no repair perm' } }))
  })

  it('permission/denied with no message stores an undefined message', () => {
    const next = authReducer(authed(), { type: 'permission/denied' })
    expect(next).toEqual(authed({ notice: { message: undefined } }))
  })

  it('notice/dismiss clears the notice', () => {
    const next = authReducer(authed({ notice: { message: 'x' } }), { type: 'notice/dismiss' })
    expect(next).toEqual(authed({ notice: null }))
  })
})

describe('logout', () => {
  it('drops to unauthenticated idle (unmounts the app)', () => {
    expect(authReducer(authed(), { type: 'logout' })).toEqual(UNAUTH_IDLE)
  })

  it('logout from an open reauth overlay also drops to unauthenticated', () => {
    const overlay = authed({ reauth: { active: true, login: { phase: 'error' } } })
    expect(authReducer(overlay, { type: 'logout' })).toEqual(UNAUTH_IDLE)
  })
})

describe('totality: out-of-context actions no-op (do not crash or corrupt state)', () => {
  it('session/expired while unauthenticated is ignored', () => {
    expect(authReducer(UNAUTH_IDLE, { type: 'session/expired' })).toBe(UNAUTH_IDLE)
  })

  it('permission/denied while unauthenticated is ignored', () => {
    expect(authReducer(UNAUTH_IDLE, { type: 'permission/denied', message: 'x' })).toBe(UNAUTH_IDLE)
  })

  it('notice/dismiss while unauthenticated is ignored', () => {
    expect(authReducer(UNAUTH_IDLE, { type: 'notice/dismiss' })).toBe(UNAUTH_IDLE)
  })

  it('login/success while authenticated (not via reauth) is ignored', () => {
    const s = authed()
    expect(authReducer(s, { type: 'login/success', claims: CLAIMS2 })).toBe(s)
  })

  it('reauth/success while unauthenticated is ignored', () => {
    expect(authReducer(UNAUTH_IDLE, { type: 'reauth/success', claims: CLAIMS2 })).toBe(UNAUTH_IDLE)
  })

  it('login/submit while authenticated WITHOUT an active reauth is ignored', () => {
    const s = authed()
    expect(authReducer(s, { type: 'login/submit' })).toBe(s)
  })

  it('login/submit while bootstrapping is ignored', () => {
    expect(authReducer(initialAuthState, { type: 'login/submit' })).toBe(initialAuthState)
  })

  it('unknown action returns the state unchanged', () => {
    const s = authed()
    expect(authReducer(s, { type: 'nonsense' } as unknown as AuthAction)).toBe(s)
  })
})
