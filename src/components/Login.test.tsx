// src/components/Login.test.tsx
//
// Presentational coverage for <Login>: all four LoginScreenState phases, the
// generic (non-disclosing) error copy, the locked message with retryAfter,
// submit wiring, and disabled states. No fetch, no machine — props only.

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LoginScreenState } from '../types'
import { Login } from './Login'

afterEach(cleanup)

function setup(
  state: LoginScreenState,
  variant?: 'full' | 'reauth',
): { onSubmit: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn()
  render(<Login state={state} onSubmit={onSubmit} variant={variant} />)
  return { onSubmit }
}

describe('Login phases', () => {
  it('idle: renders the form, an enabled input and submit, no error or locked banner', () => {
    setup({ phase: 'idle' })

    expect(screen.getByTestId('login-form')).toBeInTheDocument()
    expect(screen.getByTestId('passphrase-input')).toBeEnabled()
    expect(screen.getByTestId('login-submit')).toBeEnabled()
    expect(screen.queryByTestId('login-error')).not.toBeInTheDocument()
    expect(screen.queryByTestId('locked-message')).not.toBeInTheDocument()
  })

  it('submitting: disables both the input and the submit button', () => {
    setup({ phase: 'submitting' })

    expect(screen.getByTestId('passphrase-input')).toBeDisabled()
    expect(screen.getByTestId('login-submit')).toBeDisabled()
  })

  it('error: shows a single generic message that discloses nothing specific', () => {
    setup({ phase: 'error' })

    const error = screen.getByTestId('login-error')
    expect(error).toBeInTheDocument()
    expect(error).toHaveTextContent('Authentication failed.')
    // Must not hint at which part of the attempt failed.
    expect(error.textContent?.toLowerCase()).not.toMatch(
      /passphrase|password|incorrect|wrong|user|account/,
    )
  })

  it('locked: shows the locked message with the retryAfter seconds and disables submit', () => {
    setup({ phase: 'locked', retryAfter: 42 })

    const locked = screen.getByTestId('locked-message')
    expect(locked).toBeInTheDocument()
    expect(locked).toHaveTextContent('42')
    expect(screen.getByTestId('login-submit')).toBeDisabled()
  })
})

describe('Login submit wiring', () => {
  it('submits the typed passphrase to onSubmit', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup({ phase: 'idle' })

    await user.type(screen.getByTestId('passphrase-input'), 'hunter2')
    await user.click(screen.getByTestId('login-submit'))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith('hunter2')
  })

  it('submits on Enter inside the field', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup({ phase: 'idle' })

    await user.type(screen.getByTestId('passphrase-input'), 'open-sesame{Enter}')

    expect(onSubmit).toHaveBeenCalledWith('open-sesame')
  })

  it('does not call onSubmit while submitting', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup({ phase: 'submitting' })

    // Button is disabled; a click is a no-op.
    await user.click(screen.getByTestId('login-submit'))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not call onSubmit when locked, even via Enter on the still-editable input', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup({ phase: 'locked', retryAfter: 30 })

    await user.type(screen.getByTestId('passphrase-input'), 'retry{Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('Login variants', () => {
  it('reauth: still exposes the form and input testids and reauth copy', () => {
    setup({ phase: 'idle' }, 'reauth')

    expect(screen.getByTestId('login-form')).toBeInTheDocument()
    expect(screen.getByTestId('passphrase-input')).toBeInTheDocument()
    expect(screen.getByText(/session expired/i)).toBeInTheDocument()
  })
})
