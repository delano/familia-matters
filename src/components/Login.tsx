// src/components/Login.tsx
//
// Presentational login form. Renders the four spec-named LoginScreenState phases
// (idle / submitting / error / locked) and reports the entered passphrase up via
// onSubmit. It holds no auth logic and performs no fetch — the parent owns the
// state machine and the API call.
//
// Security: the passphrase lives only in the controlled <input> and is handed to
// onSubmit; it is never logged, echoed into the error/locked copy, or stored.

import type React from 'react'
import { useState } from 'react'

import type { LoginScreenState } from '../types'

interface LoginProps {
  state: LoginScreenState
  onSubmit(passphrase: string): void
  /** 'full' = standalone login screen; 'reauth' = bare card inside the overlay. */
  variant?: 'full' | 'reauth'
}

/** Generic message — never discloses which part of the attempt failed. */
const ERROR_MESSAGE = 'Authentication failed.'

export function Login(props: LoginProps): React.JSX.Element {
  const { state, onSubmit, variant = 'full' } = props
  const [passphrase, setPassphrase] = useState('')

  const phase = state.phase
  const isSubmitting = phase === 'submitting'
  const isLocked = phase === 'locked'
  // Input stays editable while locked (only the button is disabled), so the
  // submit handler itself must refuse to fire in submitting/locked phases.
  const disableSubmit = isSubmitting || isLocked

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (isSubmitting || isLocked) return
    onSubmit(passphrase)
  }

  const title =
    variant === 'reauth'
      ? 'Session expired. Sign in to continue.'
      : 'Familia Admin'

  const form = (
    <form className="login-card" data-testid="login-form" onSubmit={handleSubmit}>
      <h1 className="login-title">{title}</h1>

      <label className="login-field">
        <span className="login-label">Passphrase</span>
        <input
          className="login-input"
          data-testid="passphrase-input"
          type="password"
          name="passphrase"
          autoComplete="current-password"
          autoFocus
          disabled={isSubmitting}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </label>

      <button
        className="login-submit"
        data-testid="login-submit"
        type="submit"
        disabled={disableSubmit}
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>

      {phase === 'error' && (
        <p className="login-error" data-testid="login-error" role="alert">
          {ERROR_MESSAGE}
        </p>
      )}

      {isLocked && (
        <p className="login-locked" data-testid="locked-message" role="alert">
          Too many attempts. Try again in {state.retryAfter}s.
        </p>
      )}
    </form>
  )

  if (variant === 'reauth') {
    // The overlay supplies the chrome; render just the card/form.
    return form
  }

  return <div className="login-screen">{form}</div>
}
