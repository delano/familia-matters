// src/components/ReauthOverlay.test.tsx
//
// The re-authentication modal: a dialog hosting <Login variant="reauth">. It
// owns no auth logic — these tests pin that it renders the login form for the
// given phase and forwards the submitted passphrase. The full expiry -> reauth
// -> restore cycle lives in AuthProvider.test.tsx.

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReauthOverlay } from './ReauthOverlay'

afterEach(cleanup)

describe('ReauthOverlay', () => {
  it('renders as a labelled dialog hosting the login form', () => {
    render(<ReauthOverlay state={{ phase: 'idle' }} onSubmit={vi.fn()} />)

    const overlay = screen.getByTestId('reauth-overlay')
    expect(overlay).toHaveAttribute('role', 'dialog')
    expect(overlay).toHaveAttribute('aria-label', 'Re-authenticate')
    expect(screen.getByTestId('login-form')).toBeInTheDocument()
  })

  it('forwards the submitted passphrase', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ReauthOverlay state={{ phase: 'idle' }} onSubmit={onSubmit} />)

    await user.type(screen.getByTestId('passphrase-input'), 'correct horse')
    await user.click(screen.getByTestId('login-submit'))
    expect(onSubmit).toHaveBeenCalledWith('correct horse')
  })

  it('surfaces the generic error phase inside the overlay', () => {
    render(<ReauthOverlay state={{ phase: 'error' }} onSubmit={vi.fn()} />)
    expect(screen.getByTestId('login-error')).toBeInTheDocument()
  })
})
