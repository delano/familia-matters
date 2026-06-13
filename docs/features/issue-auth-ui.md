## Summary

The admin has no login. Today an operator mints a PASETO token out of band
(`rake auth:token`) and pastes it into `window.FAMILIA_ADMIN_TOKEN` /
`localStorage`; every request then sends `Authorization: Bearer …`. There is no
credential, no login screen, and no session. This issue adds a browser login
flow: a single shared passphrase is exchanged for an authenticated admin
session delivered as an HttpOnly cookie. Programmatic clients (curl, CI, MCP)
keep working unchanged via the Bearer header.

Full specification: `docs/familia-admin-auth-ui-spec.md` (lands with this work).

**Product decisions (fixed):** shared admin passphrase as the first factor;
deployment is a small trusted team on an internal network.

## Goals

- Operators log in through a browser screen instead of pasting a minted token.
- A single shared passphrase grants an admin session.
- Browser session credentials are not readable by injected scripts.
- curl / CI / MCP authenticate without change.
- Sessions are time-bounded and re-established by re-authenticating.

## Design (settled across architecture / security / frontend review)

- **Transport:** successful passphrase → server-minted PASETO delivered as an
  `HttpOnly; Secure; SameSite=Strict` cookie. The token never reaches JS or the
  response body. Chosen over localStorage Bearer because the live in-browser
  Babel/JSX surface plus destructive endpoints (`raw/command`, `reveal_secrets`)
  make XSS the dominant threat.
- **Backward compatibility:** the route auth strategy reads the token from the
  cookie **or** the `Authorization: Bearer` header (header wins). No change to
  existing tooling.
- **Surfaces:**
  | Endpoint | Session required | Purpose |
  | --- | --- | --- |
  | `POST /admin/api/auth/login` | No | Verify passphrase, set cookie, return claims |
  | `GET /admin/api/auth/session` | Yes | Return current claims for UI bootstrap |
  | `DELETE /admin/api/auth/session` | No | End the session |
- **Passphrase:** verified by constant-time comparison; the endpoint fails
  closed when the configured reference is unset.
- **Brute force:** the login endpoint is rate-limited (global + per-IP, Redis),
  surfacing a locked state to the UI.
- **Frontend:** the shell gates the app on a `GET /auth/session` bootstrap;
  login screen has idle / submitting / error / locked states; session-expiry
  returns to login while preserving in-app location; a claims affordance shows
  subject / role / permissions / expiry. Stack is browser-Babel React 18 (no
  build step), gate sits at the shell above the iframe routing.

## Open questions (need a decision before/within implementation)

The spec lists these unresolved. Recommended resolutions, informed by how mature
OSS admin tools handle them:

1. **Passphrase at rest** — accept an argon2id hash in the env
   (`*_HASHED`), plaintext only as a dev escape hatch with a startup warning
   (cf. code-server, Jupyter). Keeps a reusable secret out of `docker inspect` /
   `/proc/<pid>/environ` / systemd `Environment=`.
2. **Logout / revocation** — strongest reframe: use a **server-side session**
   (opaque id in the cookie, record in Redis) for the browser, keep PASETO for
   the Bearer/API/MCP path. Logout deletes the key; revocation becomes real;
   the cookie carries nothing sensitive. This collapses (2) and shrinks (3).
   Fallback if staying token-in-cookie: `jti` claim + Redis denylist, key
   rotation as kill-switch.
3. **CSRF depth** — cookie auth re-arms the currently `csrf=exempt` mutations.
   Re-audit every exempt marker; add a strict Origin check (and/or framework
   CSRF token if a session exists) on state-changing routes. SameSite alone is
   not sufficient for destructive operations.
4. **401 vs 403** — correctness bug, not a tradeoff: Otto returns 401 for both
   expired-token and permission-denial, so the UI cannot tell "log in again"
   from "you lack this permission." Fix the strategy to emit distinct codes
   (likely an Otto-level change).
5. **Rate-limit thresholds** — ship conservative configurable defaults
   (~5 failures → escalating backoff/lockout); do not block on the exact number.
6. **Dev TLS posture** — Secure cookie on by default, auto-relaxed on loopback,
   proxy-aware via trusted `X-Forwarded-Proto`, explicit dev override.

## In scope

- Browser login screen (single passphrase field, four states).
- Cookie sessions for the browser; Bearer header for tooling.
- Login / logout / session-introspection endpoints.
- Rate-limited login with locked state.
- Session-expiry detection and in-place re-authentication.
- Current-session claims display.

## Out of scope

- Per-operator accounts, usernames, or credential stores.
- SSO / OAuth / federated identity.
- Self-service passphrase reset or recovery.
- Multiple roles or login-time permission selection.
- "Remember me" beyond token TTL.
- Token refresh without re-entering the passphrase.

## Dependencies

- Existing PASETO mint/verify facility and signing key (`lib/familia/admin/auth.rb`).
- Route auth strategy (`Auth::PasetoStrategy`, registered in `config.ru`).
- A configured shared passphrase reference in the environment.
- Redis/Valkey for rate-limit counters and (if adopted) session state.
- TLS termination for any non-loopback deployment.

## Acceptance criteria

- With no session, opening the admin shows the login screen, not the app.
- Correct passphrase replaces the login screen with the app and sets a session
  cookie not readable via `document.cookie`.
- Incorrect passphrase keeps the login screen with a generic error.
- Exceeding the failed-attempt threshold returns a locked response until the
  window elapses.
- A valid `Authorization: Bearer` request succeeds on every route that worked
  before the feature, with no cookie present.
- After token expiry, an in-app action returns the operator to authentication;
  completing it restores the prior location.
- A permission denial reports the denial without logging the operator out.
- The session endpoint returns subject / role / permissions / expiry, never the
  token.
- With the passphrase reference unset, every login attempt is rejected.
- A non-development boot with a development-default or malformed signing key is
  refused.

## Definition of done

- All acceptance criteria observable against a live Valkey.
- Tryouts coverage in `try/` (login success/failure, cookie issuance, session
  bootstrap, logout, locked state, Bearer-path regression) — follows the
  `try/security_try.rb` gate pattern; proven RED before the fix.
- The six open questions resolved and reflected in the spec.
- `csrf=exempt` markers re-audited; the decision recorded.
- Docs updated: spec moved from open-questions to settled; run instructions note
  the new passphrase env var.

## Testing strategy

- Tryouts integration via `rack-test` against live Valkey for the endpoints and
  the auth strategy's dual-source extraction.
- Node adapter test extended for the login call and cookie-mode requests.
- Browser smoke of the full login → app → expiry → re-login loop.

## Complexity

Medium. Backend surface is small (one controller, a strategy tweak, three
routes, rate-limit counter). The load is in the cross-cutting decisions (session
model, CSRF re-audit, 401/403 split) rather than line count.

## Suggested branch

`feature/<this-issue>-auth-ui` from `main` (created via `/gh:issue-start`, not here).
