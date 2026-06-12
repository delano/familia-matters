// src/components/ErrorState.tsx
//
// The one shared, unmissable error pane. Every screen renders THIS on a failed
// fetch — full-pane, role=alert, named after the specific refusal — instead of
// falling back to seed data, an empty table, or a silent retry. The variants
// cover the API's error contracts (T5/T6):
//
//   unreachable               network throw / unparseable body — backend down
//   code 'read_only'          403 from ReadOnlyGuard (FAMILIA_ADMIN_READ_ONLY,
//                             default ON in production)
//   code 'scan_unavailable'   400 — no index covers the query; NOT empty results
//   code 'command_blocked'    403 — command outside the raw-console allowlist
//   code 'record_exists'      409 — unique-index conflict
//   forbidden (no code)       403 — missing permission
//   status 404                not found
//   anything else             generic HTTP failure, status shown
//
// Copy rule: say what was REFUSED and what the operator can trust ("no data
// was fetched"), never imply an empty result.

import type React from 'react'

import type { ResourceError } from '../data/resource'

interface ErrorStateProps {
  error: ResourceError
  /** Optional retry handler; renders a Retry button when provided. */
  onRetry?(): void
}

interface Variant {
  title: string
  detail: string
}

function requiredTier(body: unknown): string | undefined {
  if (typeof body === 'object' && body !== null) {
    const tier = (body as Record<string, unknown>).required_tier
    if (typeof tier === 'string') return tier
  }
  return undefined
}

function variantFor(error: ResourceError): Variant {
  switch (error.code) {
    case 'read_only':
      return {
        title: 'Read-only mode is on',
        detail:
          'The server refused this change: FAMILIA_ADMIN_READ_ONLY is enabled ' +
          '(the production default). Nothing was modified. Flipping it off is a ' +
          'deliberate, server-side decision — not a button here.',
      }
    case 'scan_unavailable':
      return {
        title: 'Query refused: no index, no scan',
        detail:
          'No index covers this query and full scans are unavailable. ' +
          'No data was fetched — this is a refusal, not an empty result.',
      }
    case 'command_blocked': {
      const tier = requiredTier(error.body)
      return {
        title: 'Command blocked',
        detail:
          'The server refused this command: it is outside the allowlist' +
          (tier ? ` (requires tier: ${tier})` : '') +
          '. Nothing was executed.',
      }
    }
    case 'record_exists':
      return {
        title: 'Conflict: record already exists',
        detail:
          'A record with this unique index value already exists. ' +
          'Nothing was written.',
      }
    default:
      break
  }

  switch (error.kind) {
    case 'unreachable':
      return {
        title: 'Backend unreachable',
        detail:
          'The admin backend did not answer. Nothing on this screen is live — ' +
          'no cached or fallback data is shown, by design. Check the tunnel ' +
          'and the admin process, then retry.',
      }
    case 'unauthenticated':
      return {
        title: 'Session expired',
        detail: 'Re-authenticate to continue. Your place in the app is preserved.',
      }
    case 'forbidden':
      return {
        title: 'Permission denied',
        detail:
          'The server refused this action for your session' +
          (error.code ? ` (${error.code})` : '') +
          '. You are still signed in.',
      }
    default:
      if (error.status === 404) {
        return {
          title: 'Not found',
          detail: 'The server has no such resource. It may have been deleted.',
        }
      }
      return {
        title: `Request failed (HTTP ${error.status ?? '?'})`,
        detail:
          'The backend answered with an error. No data was fetched. ' +
          'Retry, and check the server log if it persists.',
      }
  }
}

export function ErrorState(props: ErrorStateProps): React.JSX.Element {
  const { error, onRetry } = props
  const variant = variantFor(error)

  return (
    <div
      className="error-state"
      role="alert"
      data-testid="error-state"
      data-error-kind={error.kind}
      data-error-code={error.code}
    >
      <h3 className="error-state-title">{variant.title}</h3>
      <p className="error-state-detail">{variant.detail}</p>
      {onRetry && (
        <button
          type="button"
          className="error-state-retry"
          data-testid="error-state-retry"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </div>
  )
}
