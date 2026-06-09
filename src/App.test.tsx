// src/App.test.tsx
//
// The gateway handoff: when the server gate appended ?return_to=, a freshly
// authenticated session navigates back to it; without it, the in-app shell
// renders (that path is covered end-to-end in AuthProvider.test.tsx). The
// navigation effect is injected, so no test touches window.location.

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { AdminApi } from './api/client'
import { AuthProvider } from './auth/AuthProvider'
import type { Claims, LoginResult, SessionResult } from './types'

afterEach(cleanup)

const CLAIMS: Claims = {
  sub: 'admin',
  role: 'admin',
  permissions: ['repair'],
  exp: Math.floor(Date.now() / 1000) + 3600,
}

/** Minimal AdminApi mock: a live or absent session, and an always-correct login. */
function mockApi(opts: { session: boolean }): AdminApi {
  const getSession = vi.fn(
    async (): Promise<SessionResult> =>
      opts.session ? { ok: true, claims: CLAIMS } : { ok: false, reason: 'unauthenticated' },
  )
  const login = vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: CLAIMS }))
  const logout = vi.fn(async () => ({ ok: true }))
  const request = vi.fn(async () => ({ ok: true as const, data: {} }))
  return { getSession, login, logout, request } as unknown as AdminApi
}

function renderApp(opts: { session: boolean; search: string }) {
  const navigate = vi.fn()
  render(
    <AuthProvider api={mockApi({ session: opts.session })}>
      <App search={opts.search} navigate={navigate} />
    </AuthProvider>,
  )
  return { navigate }
}

describe('gateway handoff (?return_to=)', () => {
  it('navigates an existing session to the return_to target', async () => {
    const { navigate } = renderApp({
      session: true,
      search: '?return_to=%2FFamilia+Admin.html',
    })

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/Familia Admin.html'))
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('handoff')).toBeInTheDocument()
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
  })

  it('collapses an off-origin return_to to / (open-redirect guard)', async () => {
    const { navigate } = renderApp({
      session: true,
      search: '?return_to=%2F%2Fevil.example',
    })

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
  })

  it('does not navigate before authentication: login renders first', async () => {
    const { navigate } = renderApp({
      session: false,
      search: '?return_to=%2F',
    })

    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('navigates after a successful login submit', async () => {
    const user = userEvent.setup()
    const { navigate } = renderApp({ session: false, search: '?return_to=%2F' })

    await user.type(await screen.findByTestId('passphrase-input'), 'correct horse')
    await user.click(screen.getByTestId('login-submit'))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
  })
})

describe('direct visit (no return_to)', () => {
  it('renders the in-app shell and does not navigate', async () => {
    const { navigate } = renderApp({ session: true, search: '' })

    expect(await screen.findByTestId('app-content')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })
})
