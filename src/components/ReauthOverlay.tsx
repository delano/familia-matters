// src/components/ReauthOverlay.tsx
//
// Modal re-authentication overlay. When a protected action returns 401 mid-
// session, this renders ABOVE the still-mounted app so the operator's in-app
// location and in-memory view state survive. It hosts <Login variant='reauth'>
// and forwards submit; it owns no auth logic.

import type React from 'react'

import type { LoginScreenState } from '../types'
import { Login } from './Login'

interface ReauthOverlayProps {
  state: LoginScreenState
  onSubmit(passphrase: string): void
}

export function ReauthOverlay(props: ReauthOverlayProps): React.JSX.Element {
  const { state, onSubmit } = props

  return (
    <div
      className="reauth-overlay"
      data-testid="reauth-overlay"
      role="dialog"
      aria-label="Re-authenticate"
    >
      <div className="reauth-backdrop" />
      <div className="reauth-card">
        <Login state={state} onSubmit={onSubmit} variant="reauth" />
      </div>
    </div>
  )
}
