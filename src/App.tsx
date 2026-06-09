// src/App.tsx
//
// The auth gate. Reads the AuthState from useAuth() and renders one of three
// shells:
//   bootstrapping   -> indeterminate spinner (GET /session in flight)
//   unauthenticated -> the full-screen <Login>
//   authenticated   -> handoff to ?return_to= (the gateway flow), or the app
//                      shell (SessionBar + protected content) on a direct visit
//
// GATEWAY MODE: the server gate (rack_app.rb) sends unauthenticated browsers to
// /login?return_to=<original path>. When that parameter is present, a freshly
// authenticated session navigates straight back to it — the prototype UI at the
// web root — instead of rendering the shell. The HttpOnly session cookie rides
// along on the prototype's same-origin fetches, so no token ever changes hands.
//
// The authenticated subtree is rendered IDENTICALLY whether or not the reauth
// overlay is active: the overlay is only APPENDED on top. That keeps the app
// tree (and its in-memory view state) mounted through re-authentication, which
// is the whole point of criterion 6 — the operator's location survives.

import type React from 'react'
import { useEffect, useState } from 'react'

import { useAuth } from './auth/AuthProvider'
import { handoffTarget } from './auth/returnTo'
import { Login } from './components/Login'
import { PermissionNotice } from './components/PermissionNotice'
import { ReauthOverlay } from './components/ReauthOverlay'
import { SessionBar } from './components/SessionBar'

interface AppProps {
  /** Location search string carrying return_to; defaults to the real URL. */
  search?: string
  /** Navigation effect for the handoff; defaults to location.replace. */
  navigate?(url: string): void
}

function defaultNavigate(url: string): void {
  // replace(), not assign(): the login page must not remain in history, or
  // Back from the prototype would bounce through an already-satisfied login.
  window.location.replace(url)
}

export default function App(props: AppProps = {}): React.JSX.Element {
  const { search = window.location.search, navigate = defaultNavigate } = props
  const { state, login, logout, call, dismissNotice } = useAuth()

  if (state.status === 'bootstrapping') {
    return (
      <div className="bootstrap" data-testid="bootstrap-loading">
        <span className="spinner" aria-hidden="true" />
        <span>Checking session…</span>
      </div>
    )
  }

  if (state.status === 'unauthenticated') {
    return <Login variant="full" state={state.login} onSubmit={login} />
  }

  // authenticated: gateway handoff when the gate provided a return_to.
  const target = handoffTarget(search)
  if (target !== null) {
    return <Handoff target={target} navigate={navigate} />
  }

  return (
    <AppShell
      claims={state.claims}
      onLogout={logout}
      onProtectedAction={() => call((api) => api.request('/_meta'))}
      notice={state.notice}
      onDismissNotice={dismissNotice}
      reauthActive={state.reauth.active}
      reauthLogin={state.reauth.active ? state.reauth.login : undefined}
      onReauthSubmit={login}
    />
  )
}

interface HandoffProps {
  target: string
  navigate(url: string): void
}

/** Splash shown while the freshly authenticated browser navigates back to the app. */
function Handoff(props: HandoffProps): React.JSX.Element {
  const { target, navigate } = props

  useEffect(() => {
    navigate(target)
  }, [target, navigate])

  return (
    <div className="bootstrap" data-testid="handoff">
      <span className="spinner" aria-hidden="true" />
      <span>Signed in — opening admin…</span>
    </div>
  )
}

interface AppShellProps {
  claims: import('./types').Claims
  onLogout(): void
  onProtectedAction(): void
  notice: import('./types').PermissionNotice | null
  onDismissNotice(): void
  reauthActive: boolean
  reauthLogin?: import('./types').LoginScreenState
  onReauthSubmit(passphrase: string): void
}

/**
 * The authenticated shell. This component is mounted for the whole authenticated
 * session — reauth only overlays it — so the local view state below survives the
 * 401 -> reauth -> success cycle and demonstrates location preservation.
 */
function AppShell(props: AppShellProps): React.JSX.Element {
  const {
    claims,
    onLogout,
    onProtectedAction,
    notice,
    onDismissNotice,
    reauthActive,
    reauthLogin,
    onReauthSubmit,
  } = props

  // Local, in-memory view state. Nothing persists it; if the tree remounted it
  // would reset to 0. The reauth flow asserts it is preserved.
  const [actionCount, setActionCount] = useState(0)

  function runProtected(): void {
    setActionCount((n) => n + 1)
    onProtectedAction()
  }

  return (
    <div className="app-shell">
      <SessionBar claims={claims} onLogout={onLogout} />

      <main className="app-content" data-testid="app-content">
        <section>
          <h2>Session</h2>
          <dl>
            <dt>subject</dt>
            <dd>{claims.sub}</dd>
            <dt>role</dt>
            <dd>{claims.role}</dd>
            <dt>permissions</dt>
            <dd>{claims.permissions.join(', ') || 'none'}</dd>
          </dl>
        </section>

        <section>
          <p data-testid="action-count">Protected calls issued: {actionCount}</p>
          <button
            type="button"
            data-testid="demo-protected-action"
            onClick={runProtected}
          >
            Run protected action
          </button>
        </section>
      </main>

      {notice && (
        <PermissionNotice message={notice.message} onDismiss={onDismissNotice} />
      )}

      {reauthActive && reauthLogin && (
        <ReauthOverlay state={reauthLogin} onSubmit={onReauthSubmit} />
      )}
    </div>
  )
}
