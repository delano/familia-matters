# Familia Admin UI Authentication Flow

## Summary

The admin presents a browser login screen that exchanges a single shared
passphrase for an authenticated session. A correct passphrase yields a minted
PASETO admin token delivered as an HttpOnly session cookie, replacing the
current practice of minting a token out of band and pasting it into browser
storage. Programmatic clients continue to authenticate with an
`Authorization: Bearer` header. The feature targets a small, trusted team
operating the admin on an internal network.

---

## Goals

- Operators authenticate through a browser login screen instead of manually
  pasting a minted token.
- A single shared passphrase gates access; possession of the passphrase grants
  an admin session.
- Browser session credentials are not readable by injected scripts.
- Programmatic clients (curl, CI, MCP) authenticate without change.
- Sessions are time-bounded and re-established by re-authenticating.

## Non-Goals

- Per-operator identity, accounts, or credential stores.
- Federated, SSO, or OAuth login.
- Self-service passphrase reset or account recovery.
- Multiple roles or selection of permissions at login time.
- Persistent "remember me" sessions beyond the token's lifetime.

## Functional Requirements

- The admin presents a login screen whenever no valid session exists.
- The login screen accepts a single passphrase field and submits it to the
  authentication endpoint.
- The server verifies the submitted passphrase against a configured reference
  using a constant-time comparison.
- A correct passphrase yields a minted PASETO admin token; an incorrect
  passphrase yields a generic authentication error that does not disclose which
  part failed.
- On successful authentication the browser receives the token as an HttpOnly,
  Secure, SameSite=Strict cookie. The response body carries the session claims
  (subject, role, permissions, expiry) and never the token.
- The authentication endpoint is reachable without an existing session.
- The session endpoint returns the current session's claims and requires a valid
  session.
- The logout endpoint clears the browser session cookie and is reachable without
  a valid session.
- The route authentication strategy accepts a token presented either as the
  session cookie or as an `Authorization: Bearer` header, with the header taking
  precedence.
- The login endpoint enforces a rate limit; repeated failures produce a locked
  state surfaced to the login screen.
- The UI bootstraps session state on load by querying the session endpoint and
  renders the authenticated application or the login screen accordingly; an
  indeterminate state is shown while that query is in flight.
- The UI distinguishes an expired or absent session, which returns the operator
  to the login screen, from an authorization denial on a specific action, which
  keeps the operator authenticated and reports insufficient permission.
- A re-authentication prompt triggered by session expiry preserves the
  operator's prior in-app location.
- The UI surfaces the current session's subject, role, permissions, and expiry.
- When the configured passphrase reference is absent, the authentication
  endpoint rejects all attempts.

## Non-Functional Requirements

- Browser session tokens are not readable from JavaScript (HttpOnly cookie).
- Session tokens are transmitted only over TLS (Secure cookie); the Secure
  attribute is omitted only for local development over loopback.
- Session tokens expire within a bounded lifetime, targeting one hour from
  issuance.
- The passphrase never appears in logs, in the session endpoint response, or in
  any error payload.
- State-changing endpoints are protected against cross-site request forgery once
  ambient cookie credentials exist.
- A non-development boot fails closed when authentication secrets resolve to a
  development default or are malformed.

## In Scope

- Browser login screen with a single passphrase field and idle, submitting,
  error, and locked states.
- Cookie-based browser sessions and Bearer-header sessions for tooling.
- Login, logout, and session-introspection surfaces.
- Rate-limited login with a locked state.
- Session-expiry detection and in-place re-authentication.
- Display of the current session's claims.

## Out of Scope

- Per-operator accounts, usernames, or credential stores.
- SSO, OAuth, or federated identity.
- Self-service passphrase reset or recovery.
- Multiple roles or login-time permission selection.
- "Remember me" persistence beyond the token's TTL.
- Token refresh without re-entering the passphrase.

## Dependencies

- The existing PASETO mint and verify facility and its symmetric signing key.
- The route authentication strategy that gates admin routes.
- A configured shared passphrase reference in the environment.
- Redis/Valkey for login rate-limit counters, and for session revocation state
  if revocation is adopted.
- TLS termination in front of the admin for any non-loopback deployment.

## Constraints

- PASETO v2.local tokens are stateless and symmetric; claims are server-verified
  and cannot be read client-side. Claim display derives from the session
  endpoint, not from decoding the token in the browser.
- Programmatic clients continue to authenticate with `Authorization: Bearer`
  unchanged.
- The deployment target is an internal, trusted network. The design does not
  assume public-internet hardening, but does treat host-to-host traffic on that
  network as untrusted by default.

## Authentication Surfaces

| Surface | Session required | Purpose |
| --- | --- | --- |
| `POST /admin/api/auth/login` | No | Verify passphrase, issue session cookie, return claims |
| `GET /admin/api/auth/session` | Yes | Return current session claims for UI bootstrap |
| `DELETE /admin/api/auth/session` | No | Clear the session cookie |
| Route auth strategy | n/a | Accept token from session cookie or Bearer header (header precedence) |
| Login screen (shell) | No | Passphrase entry; gates the application above the existing shell |

## Acceptance Criteria

- With no session, opening the admin shows the login screen, not the
  application.
- Submitting the correct passphrase replaces the login screen with the
  application and establishes a session cookie that is not readable via
  `document.cookie`.
- Submitting an incorrect passphrase keeps the login screen and shows a generic
  authentication error.
- After the configured failed-attempt threshold is exceeded, further login
  attempts are rejected with a locked response until the lockout window elapses.
- A request bearing a valid `Authorization: Bearer` token succeeds on every route
  that worked before the feature, with no cookie present.
- After the session token expires, an in-app action returns the operator to
  authentication; completing it restores the prior in-app location.
- An action denied for insufficient permission reports the denial without logging
  the operator out.
- The session endpoint returns the operator's subject, role, permissions, and
  expiry, and never the token.
- With the passphrase reference unset, every login attempt is rejected.
- A non-development boot with a development-default or malformed signing key is
  refused.

## Rejected Alternatives

- localStorage Bearer token as the primary browser credential — readable by
  injected scripts, maximizing XSS blast radius against destructive endpoints.
- In-memory access token with cookie-based refresh — adds refresh plumbing
  without benefit for a small trusted team.
- Per-operator accounts or delegated SSO identity — excluded by the product
  decision to use a single shared passphrase.
- A token-refresh endpoint — re-login on expiry is sufficient at the chosen TTL.

## Open Questions

- **Passphrase at rest.** Whether the reference is stored as plaintext in the
  environment and compared in constant time, or stored as an argon2id/bcrypt
  digest. Closing this requires deciding whether to accept an added hashing
  dependency or to treat the environment as the secret boundary.
- **Logout and revocation.** Clearing the cookie ends the browser session but
  does not revoke a token before its expiry, because PASETO v2.local is
  stateless. Closing this requires deciding whether real revocation (a `jti`
  claim plus a Redis denylist, with signing-key rotation as the kill switch) is
  in scope, or whether the bounded TTL is the only accepted bound.
- **CSRF defense depth.** Cookie credentials make the currently CSRF-exempt
  mutating endpoints reachable cross-site. Closing this requires deciding whether
  SameSite=Strict alone is sufficient, or whether an Origin/Referer allowlist
  (and a re-audit of every `csrf=exempt` route marker) is required on
  state-changing routes.
- **401 vs 403 disambiguation.** The route strategy returns 401 for both an
  expired or absent token and an authorization denial, so the UI cannot
  mechanically separate "authenticate again" from "you lack this permission."
  Closing this requires a distinguishable signal (a distinct status or error
  code) from the strategy.
- **Rate-limit thresholds.** The failed-attempt count, lockout window, and
  backoff curve are not numerically agreed.
- **Development TLS posture.** Whether the Secure cookie attribute is
  conditionally omitted on loopback, and how that interacts with the
  fail-closed boot guard.

## Deferred Work

- Hardening of the development signing-key guard so it fails closed on an unset
  or unrecognized environment and validates key length, independent of the login
  feature.
