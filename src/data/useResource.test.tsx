// src/data/useResource.test.tsx
//
// The shared data-fetch pattern, driven through a probe component the way a
// real screen consumes it: loading -> ready / error (rendered via ErrorState),
// reload() recovery, deps-driven refetch, and the 401 path opening the reauth
// overlay while the hook reports an explicit error — never stale or seed data.

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import type { AdminApi } from '../api/client'
import { AuthProvider, useAuth } from '../auth/AuthProvider'
import { ErrorState } from '../components/ErrorState'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from '../types'
import { useResource } from './useResource'

afterEach(cleanup)

const CLAIMS: Claims = {
  sub: 'admin',
  role: 'admin',
  permissions: ['repair'],
  exp: Math.floor(Date.now() / 1000) + 3600,
}

/** AdminApi mock: live session; request() resolves from a queue (last repeats). */
function mockApi(outcomes: ApiOutcome<unknown>[]): AdminApi {
  const queue = [...outcomes]
  const getSession = vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims: CLAIMS }))
  const login = vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: CLAIMS }))
  const logout = vi.fn(async () => ({ ok: true }))
  const request = vi.fn(async () => (queue.length > 1 ? queue.shift() : queue[0]))
  return { getSession, login, logout, request } as unknown as AdminApi
}

/** A minimal screen consuming the pattern exactly as the ported screens will. */
function Probe(props: { path: string }): React.JSX.Element {
  const { state, reload } = useResource<{ value?: string }>(
    (api) => api.request(props.path),
    [props.path],
  )

  if (state.phase === 'loading') {
    return <p data-testid="probe-loading">loading…</p>
  }
  if (state.phase === 'error') {
    return <ErrorState error={state.error} onRetry={reload} />
  }
  return <p data-testid="probe-ready">{state.data.value ?? 'ready'}</p>
}

function renderProbe(api: AdminApi, path = '/thing') {
  return render(
    <AuthProvider api={api}>
      <Probe path={path} />
    </AuthProvider>,
  )
}

describe('useResource phases', () => {
  it('loading -> ready with the response data', async () => {
    renderProbe(mockApi([{ ok: true, data: { value: 'live' } }]))

    expect(screen.getByTestId('probe-loading')).toBeInTheDocument()
    expect(await screen.findByTestId('probe-ready')).toHaveTextContent('live')
  })

  it('a network failure renders the unreachable ErrorState, never data', async () => {
    renderProbe(mockApi([{ ok: false, reason: 'error' }]))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')
    expect(screen.queryByTestId('probe-ready')).not.toBeInTheDocument()
  })

  it('a 400 scan_unavailable renders its specific error state', async () => {
    renderProbe(
      mockApi([
        { ok: false, reason: 'error', status: 400, body: { error: 'scan_unavailable' } },
      ]),
    )

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-code', 'scan_unavailable')
  })

  it('a 403 read_only renders its specific error state', async () => {
    renderProbe(
      mockApi([
        { ok: false, reason: 'forbidden', message: 'read_only', body: { error: 'read_only' } },
      ]),
    )

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-code', 'read_only')
    expect(pane).toHaveTextContent('FAMILIA_ADMIN_READ_ONLY')
  })
})

describe('reload', () => {
  it('retry after an outage refetches and reaches ready', async () => {
    const user = userEvent.setup()
    renderProbe(
      mockApi([
        { ok: false, reason: 'error' }, // first call: backend down
        { ok: true, data: { value: 'recovered' } }, // retry: backend back
      ]),
    )

    await screen.findByTestId('error-state')
    await user.click(screen.getByTestId('error-state-retry'))

    expect(await screen.findByTestId('probe-ready')).toHaveTextContent('recovered')
  })
})

describe('deps-driven refetch', () => {
  it('changing a dep re-runs the fetch with the new parameters', async () => {
    const api = mockApi([{ ok: true, data: { value: 'a' } }, { ok: true, data: { value: 'b' } }])
    const { rerender } = render(
      <AuthProvider api={api}>
        <Probe path="/models/customer" />
      </AuthProvider>,
    )
    await screen.findByTestId('probe-ready')

    rerender(
      <AuthProvider api={api}>
        <Probe path="/models/session" />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('probe-ready')).toHaveTextContent('b'))
    const request = (api as unknown as { request: ReturnType<typeof vi.fn> }).request
    expect(request).toHaveBeenCalledWith('/models/customer')
    expect(request).toHaveBeenCalledWith('/models/session')
  })
})

describe('401 mid-session (the AC1 requirement)', () => {
  // Screens live INSIDE the auth gate, so their fetches only start once the
  // session is established. The harness reproduces that: mounting the probe
  // before bootstrap resolves would race the gate in a way no real screen can.
  function WhenAuthenticated(props: { children: React.ReactNode }): React.JSX.Element | null {
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    return <>{props.children}</>
  }

  it('opens the reauth overlay over the mounted app; the hook reports an explicit error', async () => {
    const api = mockApi([{ ok: false, reason: 'unauthenticated' }])
    render(
      <AuthProvider api={api}>
        <App />
        <WhenAuthenticated>
          <Probe path="/thing" />
        </WhenAuthenticated>
      </AuthProvider>,
    )

    // The overlay opened (no top-window redirect; the shell stays mounted)...
    expect(await screen.findByTestId('reauth-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('app-content')).toBeInTheDocument()

    // ...and the resource is an explicit error state, not silent or fabricated.
    const pane = screen.getByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unauthenticated')
  })
})
