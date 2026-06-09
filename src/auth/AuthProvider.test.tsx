// src/auth/AuthProvider.test.tsx
//
// Integration coverage for the provider + the App gate, with a fully mocked
// AdminApi (no live server, no real fetch). Drives every gate path:
//   - bootstrap: loading -> app (authenticated session) or login (401)
//   - login: correct -> app; wrong -> generic error, stays on login; locked
//   - expiry: authenticated -> protected 401 -> reauth overlay -> correct ->
//     overlay gone AND a child-held counter PRESERVED (location survives)
//   - 403: protected forbidden -> PermissionNotice, STILL authenticated
//   - logout -> back to login
//
// The mock returns the result-union values directly (the unions, not Responses):
// the provider only ever consumes those, and client.test.ts already covers the
// Response -> union mapping. This keeps the integration tests about wiring.

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '../App'
import type { AdminApi } from '../api/client'
import type {
  ApiOutcome,
  Claims,
  LoginResult,
  LogoutResult,
  SessionResult,
} from '../types'
import { AuthProvider } from './AuthProvider'

afterEach(cleanup)

const CLAIMS: Claims = {
  sub: 'admin@example.test',
  role: 'admin',
  permissions: ['repair', 'reveal_secrets'],
  exp: Math.floor(Date.now() / 1000) + 3600,
}

/**
 * The behaviours each AdminApi method should exhibit, as the already-mapped
 * result unions (the provider only ever consumes these; the Response -> union
 * mapping is covered in client.test.ts). Spelling them as the union types keeps
 * the inline literals from widening (`ok: boolean`) and dodges the generic
 * `request<T>` signature, which is awkward to satisfy with a vi.fn mock.
 */
interface MockBehaviour {
  login?: LoginResult
  getSession?: SessionResult
  logout?: LogoutResult
  request?: ApiOutcome<unknown>
}

/**
 * The mock's spies. Kept as their own object so tests can assert call args
 * (`spies.login` etc.) — the assembled AdminApi below is cast through `unknown`
 * to satisfy the generic `request<T>` signature, which would otherwise hide the
 * spy types.
 */
interface MockSpies {
  login: ReturnType<typeof vi.fn>
  getSession: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  request: ReturnType<typeof vi.fn>
}

/** Build a mock AdminApi; each method resolves to its (typed) behaviour and is a spy. */
function mockApi(b: MockBehaviour = {}): { api: AdminApi; spies: MockSpies } {
  const spies: MockSpies = {
    login: vi.fn(async (): Promise<LoginResult> => b.login ?? { ok: true, claims: CLAIMS }),
    getSession: vi.fn(
      async (): Promise<SessionResult> => b.getSession ?? { ok: false, reason: 'unauthenticated' },
    ),
    logout: vi.fn(async (): Promise<LogoutResult> => b.logout ?? { ok: true }),
    request: vi.fn(async (): Promise<ApiOutcome<unknown>> => b.request ?? { ok: true, data: {} }),
  }
  // request is generic (request<T>); the spies return ApiOutcome<unknown>, so
  // cast the assembled object (structurally compatible at runtime).
  const api = spies as unknown as AdminApi
  return { api, spies }
}

function renderApp(api: AdminApi) {
  return render(
    <AuthProvider api={api}>
      <App />
    </AuthProvider>,
  )
}

describe('bootstrap (indeterminate state)', () => {
  it('shows the loading state while GET /session is in flight, then resolves', async () => {
    // A session promise we control, so the loading state is observable.
    let resolve!: (r: SessionResult) => void
    const pending = new Promise<SessionResult>((r) => {
      resolve = r
    })
    const { api, spies } = mockApi()
    spies.getSession.mockImplementation(async () => pending)

    renderApp(api)

    expect(screen.getByTestId('bootstrap-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument()

    resolve({ ok: true, claims: CLAIMS })

    await waitFor(() =>
      expect(screen.queryByTestId('bootstrap-loading')).not.toBeInTheDocument(),
    )
  })

  it('resolves to the app when the session is valid', async () => {
    const { api } = mockApi({ getSession: { ok: true, claims: CLAIMS } })
    renderApp(api)

    expect(await screen.findByTestId('app-content')).toBeInTheDocument()
    expect(screen.getByTestId('session-bar')).toBeInTheDocument()
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument()

    // Criterion 8: the session view shows subject, role, permissions, and expiry
    // (never the token — Claims has no token field). exp is time-based, so the
    // expiry cell asserts presence, not exact text.
    expect(screen.getByTestId('claim-sub')).toHaveTextContent('admin@example.test')
    expect(screen.getByTestId('claim-role')).toHaveTextContent('admin')
    expect(screen.getByTestId('claim-permissions')).toHaveTextContent('repair')
    expect(screen.getByTestId('claim-permissions')).toHaveTextContent('reveal_secrets')
    expect(screen.getByTestId('claim-exp')).toBeInTheDocument()
  })

  it('resolves to login when there is no session (401)', async () => {
    const { api } = mockApi({ getSession: { ok: false, reason: 'unauthenticated' } })
    renderApp(api)

    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
  })
})

describe('login', () => {
  it('correct passphrase replaces login with the app', async () => {
    const { api, spies } = mockApi({
      getSession: { ok: false, reason: 'unauthenticated' },
      login: { ok: true, claims: CLAIMS },
    })
    renderApp(api)

    const user = userEvent.setup()
    await user.type(await screen.findByTestId('passphrase-input'), 'correct horse')
    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByTestId('app-content')).toBeInTheDocument()
    expect(spies.login).toHaveBeenCalledWith('correct horse')
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument()
  })

  it('wrong passphrase stays on login with a generic error', async () => {
    const { api } = mockApi({
      getSession: { ok: false, reason: 'unauthenticated' },
      login: { ok: false, reason: 'invalid' },
    })
    renderApp(api)

    const user = userEvent.setup()
    await user.type(await screen.findByTestId('passphrase-input'), 'wrong')
    await user.click(screen.getByTestId('login-submit'))

    const error = await screen.findByTestId('login-error')
    expect(error).toBeInTheDocument()
    // Generic: discloses nothing about which part failed, never echoes the input.
    expect(error.textContent ?? '').not.toContain('wrong')
    expect(error.textContent ?? '').not.toMatch(/passphrase|user|account/i)
    expect(screen.getByTestId('login-form')).toBeInTheDocument()
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
  })

  it('a network/server error during login surfaces the same generic error', async () => {
    const { api } = mockApi({
      getSession: { ok: false, reason: 'unauthenticated' },
      login: { ok: false, reason: 'error' },
    })
    renderApp(api)

    const user = userEvent.setup()
    await user.type(await screen.findByTestId('passphrase-input'), 'x')
    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByTestId('login-error')).toBeInTheDocument()
    expect(screen.getByTestId('login-form')).toBeInTheDocument()
  })

  it('429 locked shows the locked state', async () => {
    const { api } = mockApi({
      getSession: { ok: false, reason: 'unauthenticated' },
      login: { ok: false, reason: 'locked', retryAfter: 42 },
    })
    renderApp(api)

    const user = userEvent.setup()
    await user.type(await screen.findByTestId('passphrase-input'), 'x')
    await user.click(screen.getByTestId('login-submit'))

    const locked = await screen.findByTestId('locked-message')
    expect(locked).toBeInTheDocument()
    expect(locked.textContent ?? '').toContain('42')
    expect(screen.getByTestId('login-submit')).toBeDisabled()
  })
})

describe('expiry -> reauth -> location preserved (criterion 6)', () => {
  it('a protected 401 opens the reauth overlay; re-auth clears it and the in-app counter survives', async () => {
    const { api } = mockApi({
      getSession: { ok: true, claims: CLAIMS },
      // The protected call 401s (session expired); re-auth then succeeds.
      request: { ok: false, reason: 'unauthenticated' },
      login: { ok: true, claims: CLAIMS },
    })
    renderApp(api)

    const user = userEvent.setup()
    await screen.findByTestId('app-content')

    // Drive in-memory view state up first; this must survive the reauth cycle.
    await user.click(screen.getByTestId('demo-protected-action'))
    expect(screen.getByTestId('action-count').textContent).toContain('1')

    // The protected call returned 401 -> reauth overlay appears, app stays mounted.
    expect(await screen.findByTestId('reauth-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.getByTestId('session-bar')).toBeInTheDocument()

    // Submit the reauth form (the overlay hosts its own passphrase input).
    const overlay = screen.getByTestId('reauth-overlay')
    const input = within(overlay).getByTestId('passphrase-input')
    await user.type(input, 'fresh passphrase')
    await user.click(within(overlay).getByTestId('login-submit'))

    // Overlay gone, still authenticated, and the counter PERSISTED (tree never
    // unmounted) -> the operator's in-app location was preserved.
    await waitFor(() =>
      expect(screen.queryByTestId('reauth-overlay')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.getByTestId('action-count').textContent).toContain('1')
  })
})

describe('403 -> notice without logout (criterion 7)', () => {
  it('a forbidden protected call shows the PermissionNotice and stays authenticated', async () => {
    const { api } = mockApi({
      getSession: { ok: true, claims: CLAIMS },
      request: { ok: false, reason: 'forbidden', message: 'reveal_secrets required' },
    })
    renderApp(api)

    const user = userEvent.setup()
    await screen.findByTestId('app-content')
    await user.click(screen.getByTestId('demo-protected-action'))

    const notice = await screen.findByTestId('permission-notice')
    expect(notice).toBeInTheDocument()
    // Still authenticated: session bar + app content present, no reauth, no login.
    expect(screen.getByTestId('session-bar')).toBeInTheDocument()
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.queryByTestId('reauth-overlay')).not.toBeInTheDocument()
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument()

    // The notice is dismissible and dismissal keeps us authenticated.
    await user.click(screen.getByTestId('notice-dismiss'))
    await waitFor(() =>
      expect(screen.queryByTestId('permission-notice')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
  })
})

describe('lockout recovery (criterion 4: locked until the window elapses)', () => {
  // Real timers with a short retryAfter so the recovery fires quickly. (Fake
  // timers hang RTL's waitFor under vitest: it only auto-advances *jest* fake
  // timers, so its setInterval polling freezes.) retryAfter is in SECONDS; 0.2s
  // is comfortably under waitFor's 1000ms default and after the lock assertion.
  const SHORT_RETRY = 0.2

  it('first-login lock auto-recovers to a submittable form after the window elapses', async () => {
    const { api } = mockApi({
      getSession: { ok: false, reason: 'unauthenticated' },
      login: { ok: false, reason: 'locked', retryAfter: SHORT_RETRY },
    })
    renderApp(api)

    const user = userEvent.setup()
    await user.type(await screen.findByTestId('passphrase-input'), 'x')
    await user.click(screen.getByTestId('login-submit'))

    // Locked: the message is shown and the submit button is disabled.
    expect(await screen.findByTestId('locked-message')).toBeInTheDocument()
    expect(screen.getByTestId('login-submit')).toBeDisabled()

    // The window elapses -> back to an idle, submittable form (no reload needed).
    await waitFor(() =>
      expect(screen.queryByTestId('locked-message')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('login-submit')).toBeEnabled()
    expect(screen.getByTestId('login-form')).toBeInTheDocument()
  })

  it('reauth lock auto-recovers WITHOUT a reload, keeping the app mounted (criterion 6)', async () => {
    const { api, spies } = mockApi({
      getSession: { ok: true, claims: CLAIMS },
      request: { ok: false, reason: 'unauthenticated' },
    })
    // The reauth submit is rate-limited.
    spies.login.mockResolvedValue({ ok: false, reason: 'locked', retryAfter: SHORT_RETRY })
    renderApp(api)

    const user = userEvent.setup()
    await screen.findByTestId('app-content')

    // Drive in-memory view state up; it must survive the lockout cycle.
    await user.click(screen.getByTestId('demo-protected-action'))
    expect(screen.getByTestId('action-count').textContent).toContain('1')

    // Protected 401 -> reauth overlay; a locked submit drives it to the locked phase.
    const overlay = await screen.findByTestId('reauth-overlay')
    await user.type(within(overlay).getByTestId('passphrase-input'), 'x')
    await user.click(within(overlay).getByTestId('login-submit'))
    expect(
      await within(screen.getByTestId('reauth-overlay')).findByTestId('locked-message'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('reauth-overlay')).getByTestId('login-submit'),
    ).toBeDisabled()

    // The window elapses -> the overlay returns to an idle, submittable form, the
    // app is still mounted, and the in-app counter survived (no reload happened).
    await waitFor(() =>
      expect(
        within(screen.getByTestId('reauth-overlay')).queryByTestId('locked-message'),
      ).not.toBeInTheDocument(),
    )
    const reauth = screen.getByTestId('reauth-overlay')
    expect(within(reauth).getByTestId('login-submit')).toBeEnabled()
    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.getByTestId('action-count').textContent).toContain('1')
  })
})

describe('logout', () => {
  it('logout returns to the login screen', async () => {
    const { api, spies } = mockApi({ getSession: { ok: true, claims: CLAIMS } })
    renderApp(api)

    const user = userEvent.setup()
    await screen.findByTestId('app-content')
    await user.click(screen.getByTestId('logout-btn'))

    expect(await screen.findByTestId('login-form')).toBeInTheDocument()
    expect(spies.logout).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('app-content')).not.toBeInTheDocument()
  })
})
