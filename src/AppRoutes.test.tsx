// src/AppRoutes.test.tsx
//
// SPA routing inside the authenticated shell (T7 AC1 foundation): all five
// screen routes are reachable behind the auth gate, navigation never unmounts
// the shell (the reauth overlay keeps covering whatever screen is active),
// and unknown routes land on an explicit not-found pane — never a blank page.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { AdminApi } from './api/client'
import { AuthProvider } from './auth/AuthProvider'
import { SCREEN_ROUTES } from './screens'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from './types'

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

const CLAIMS: Claims = {
  sub: 'admin',
  role: 'admin',
  permissions: ['repair'],
  exp: Math.floor(Date.now() / 1000) + 3600,
}

function mockApi(request: ApiOutcome<unknown> = { ok: true, data: {} }): AdminApi {
  return {
    getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims: CLAIMS })),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: CLAIMS })),
    logout: vi.fn(async () => ({ ok: true })),
    request: vi.fn(async () => request),
  } as unknown as AdminApi
}

function setRoute(path: string): void {
  window.location.hash = `#${path}`
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

function renderShell(api: AdminApi = mockApi()) {
  return render(
    <AuthProvider api={api}>
      <App />
    </AuthProvider>,
  )
}

describe('the route table', () => {
  it('covers the T7 screens plus the audit trail (R-AUD-1)', () => {
    expect(SCREEN_ROUTES.map((s) => s.path)).toEqual([
      '/records',
      '/models',
      '/integrity',
      '/migrations',
      '/audit',
      '/explorer',
    ])
  })
})

describe('navigation inside the authenticated shell', () => {
  it('renders the nav with a link per screen plus the overview', async () => {
    renderShell()
    await screen.findByTestId('app-content')

    const nav = screen.getByTestId('app-nav')
    expect(within(nav).getByTestId('nav-overview')).toHaveAttribute('href', '#/')
    for (const route of SCREEN_ROUTES) {
      expect(within(nav).getByTestId(`nav-${route.slug}`)).toHaveAttribute(
        'href',
        `#${route.path}`,
      )
    }
  })

  it('defaults to the overview route: the home health dashboard is the landing surface', async () => {
    renderShell()
    await screen.findByTestId('app-content')

    // The R-HOME dashboard leads the '/' route; the reauth-demo affordance stays.
    expect(screen.getByTestId('screen-home')).toBeInTheDocument()
    expect(screen.getByTestId('action-count')).toBeInTheDocument()
    expect(screen.getByTestId('nav-overview')).toHaveAttribute('aria-current', 'page')
  })

  it('every screen route renders its screen behind the auth gate', async () => {
    renderShell()
    await screen.findByTestId('app-content')

    for (const route of SCREEN_ROUTES) {
      setRoute(route.path)
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() =>
        expect(screen.getByTestId(`screen-${route.slug}`)).toBeInTheDocument(),
      )
      // The shell never unmounts: session bar and nav stay put while routing.
      expect(screen.getByTestId('session-bar')).toBeInTheDocument()
      expect(screen.getByTestId(`nav-${route.slug}`)).toHaveAttribute('aria-current', 'page')
    }
  })

  it('screen routes are NOT reachable without a session (gate renders login)', async () => {
    const api = {
      getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: false, reason: 'unauthenticated' })),
      login: vi.fn(),
      logout: vi.fn(),
      request: vi.fn(),
    } as unknown as AdminApi
    window.location.hash = '#/records'
    renderShell(api)

    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
    expect(screen.queryByTestId('screen-records')).not.toBeInTheDocument()
    expect(screen.queryByTestId('app-nav')).not.toBeInTheDocument()
  })

  it('an unknown route renders the explicit not-found pane, never a blank page', async () => {
    renderShell()
    await screen.findByTestId('app-content')

    setRoute('/no-such-screen')
    await waitFor(() => expect(screen.getByTestId('route-not-found')).toBeInTheDocument())
    expect(screen.getByTestId('route-not-found')).toHaveTextContent('/no-such-screen')
  })

  it('in-shell view state survives navigating away and back (shell stays mounted)', async () => {
    const user = userEvent.setup()
    renderShell()
    await screen.findByTestId('app-content')

    await user.click(screen.getByTestId('demo-protected-action'))
    expect(screen.getByTestId('action-count')).toHaveTextContent('1')

    setRoute('/records')
    await waitFor(() => expect(screen.getByTestId('screen-records')).toBeInTheDocument())

    setRoute('/')
    await waitFor(() => expect(screen.getByTestId('action-count')).toBeInTheDocument())
    expect(screen.getByTestId('action-count')).toHaveTextContent('1')
  })
})

describe('reauth overlay coverage on screen routes (AC1)', () => {
  it('a 401 mid-session opens the overlay OVER the active screen; the route survives', async () => {
    const user = userEvent.setup()
    const api = mockApi({ ok: false, reason: 'unauthenticated' })
    renderShell(api)
    await screen.findByTestId('app-content')

    // Park on a screen route, then trip a protected 401 from the overview demo
    // is not reachable there — so trip it first, then navigate: the overlay
    // must keep covering whatever screen is active.
    await user.click(screen.getByTestId('demo-protected-action'))
    expect(await screen.findByTestId('reauth-overlay')).toBeInTheDocument()

    setRoute('/integrity')
    await waitFor(() => expect(screen.getByTestId('screen-integrity')).toBeInTheDocument())

    // Overlay still present over the new route; no top-window redirect happened.
    expect(screen.getByTestId('reauth-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('session-bar')).toBeInTheDocument()

    // Re-auth clears the overlay and the operator is still on /integrity.
    const overlay = screen.getByTestId('reauth-overlay')
    await user.type(within(overlay).getByTestId('passphrase-input'), 'fresh')
    await user.click(within(overlay).getByTestId('login-submit'))
    await waitFor(() =>
      expect(screen.queryByTestId('reauth-overlay')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('screen-integrity')).toBeInTheDocument()
  })
})
