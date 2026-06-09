// src/components/SessionBar.tsx
//
// Presentational session header. Shows the verified claims — subject, role,
// granted permissions, and expiry — plus a logout control. It renders machine
// values in monospace and NEVER renders a token: Claims carries no token field,
// so the type makes that impossible.

import type React from 'react'

import type { Claims } from '../types'

interface SessionBarProps {
  claims: Claims
  onLogout(): void
}

/**
 * Format the Unix-SECONDS expiry as a local time plus a coarse relative hint
 * ("in 59m" / "expired"). Pure: computed from Date.now() at render — no timer —
 * so it stays deterministic under test.
 *
 * `exp` is epoch SECONDS, so multiply by 1000 for the JS Date (ms).
 */
function formatExpiry(exp: number): string {
  const date = new Date(exp * 1000)
  const absolute = date.toLocaleTimeString()
  const deltaSeconds = exp - Math.floor(Date.now() / 1000)
  return `${absolute} (${relative(deltaSeconds)})`
}

function relative(deltaSeconds: number): string {
  if (deltaSeconds <= 0) return 'expired'
  const minutes = Math.floor(deltaSeconds / 60)
  if (minutes < 1) return `in ${deltaSeconds}s`
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h`
  return `in ${Math.floor(hours / 24)}d`
}

export function SessionBar(props: SessionBarProps): React.JSX.Element {
  const { claims, onLogout } = props

  return (
    <div className="session-bar" data-testid="session-bar">
      <span className="wordmark">Familia Admin</span>

      <dl className="session-claims">
        <div className="claim">
          <dt className="claim-label">subject</dt>
          <dd className="claim-value" data-testid="claim-sub">
            {claims.sub}
          </dd>
        </div>

        <div className="claim">
          <dt className="claim-label">role</dt>
          <dd className="claim-value" data-testid="claim-role">
            {claims.role}
          </dd>
        </div>

        <div className="claim">
          <dt className="claim-label">permissions</dt>
          <dd className="claim-value permissions" data-testid="claim-permissions">
            {claims.permissions.length === 0 ? (
              <span className="permission-chip permission-chip--empty">none</span>
            ) : (
              claims.permissions.map((permission) => (
                <span className="permission-chip" key={permission}>
                  {permission}
                </span>
              ))
            )}
          </dd>
        </div>

        <div className="claim">
          <dt className="claim-label">expires</dt>
          <dd className="claim-value expiry" data-testid="claim-exp">
            {formatExpiry(claims.exp)}
          </dd>
        </div>
      </dl>

      <button
        className="logout-btn"
        data-testid="logout-btn"
        type="button"
        onClick={onLogout}
      >
        Sign out
      </button>
    </div>
  )
}
