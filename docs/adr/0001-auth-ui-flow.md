# ADR 0001 — Admin UI Authentication Flow

- **Status:** Accepted
- **Date:** 2026-06-09
- **Context spec:** [`docs/familia-admin-auth-ui-spec.md`](../familia-admin-auth-ui-spec.md)
- **Gap analysis:** [`tmp/0608-auth-ui-gap-analysis.md`](../../tmp/0608-auth-ui-gap-analysis.md)

## Context

The admin replaces hand-pasted `window.FAMILIA_ADMIN_TOKEN` browser storage with a
shared-passphrase login that mints a PASETO into an HttpOnly cookie. Programmatic
clients keep using `Authorization: Bearer` unchanged. The deployment target is a
small, trusted team on an internal network.

The spec left six Open Questions that gate a safe implementation. This ADR records
the decision for each. They were resolved for long-term codebase health, not for
the fastest path; revisiting any is cheap because each is isolated behind a seam.

## Decisions

### 1. Passphrase at rest — plaintext reference + constant-time compare

The reference passphrase is held as plaintext in `FAMILIA_ADMIN_PASSPHRASE` and
compared in constant time (`OpenSSL.fixed_length_secure_compare` over SHA-256
digests of both sides, which also removes the length oracle).

**Why not argon2id/bcrypt:** the environment is already the secret boundary for
this app — the PASETO signing key and the Familia encryption key both live there
in plaintext, and the signing key is strictly *more* powerful than the passphrase
(it mints any token, bypassing login entirely). Hardening the weaker secret with a
hashing dependency while the stronger one stays plaintext is inconsistent and buys
little against the realistic threat (environment compromise yields the signing key
regardless). The spec's FR literally specifies a constant-time comparison.

**Seam:** `Familia::Admin::Passphrase#verify` is the only comparison site; swap its
body for a digest verify if the threat model ever changes.

### 2. Logout & revocation — TTL-only, no denylist

Logout clears the cookie. PASETO v2.local is stateless, so this ends the browser
session but does not revoke the token before its expiry. The bounded ~1h TTL is the
accepted revocation bound, matching the spec's non-goals (no "remember me", no
refresh) and the small-trusted-team model.

**Deferred:** real revocation (a `jti` claim + Redis denylist, signing-key rotation
as the kill switch) is out of scope; record it as future work if multi-operator or
untrusted-network requirements appear.

### 3. CSRF defense depth — SameSite=Strict + server-side Origin allowlist

Introducing an ambient cookie makes every `csrf=exempt` mutating route reachable
cross-site (the gap-analysis headline). Defense is layered:

1. **SameSite=Strict** on the cookie (browser won't attach it cross-site).
2. **`Familia::Admin::OriginGuard`** Rack middleware: for state-changing methods on
   `/admin/api` (and `/_mcp`), when the request is cookie-authenticated *and* has no
   Bearer header, the `Origin` (or `Referer` origin) must be in the allowlist
   (`FAMILIA_ADMIN_ALLOWED_ORIGINS`, default same-origin). Missing Origin/Referer is
   refused.

**Bearer clients bypass the Origin check** — CSRF rides ambient cookie credentials
a browser attaches automatically, which curl/CI/MCP never have. This is why
programmatic clients see no regression.

**`csrf=exempt` re-audit:** the markers stay. Otto's built-in CSRF is token-based,
off by default here, and inappropriate for a Bearer JSON API; SameSite + OriginGuard
is the cookie-era replacement. Every existing `csrf=exempt` mutating route is now
covered by the guard for the cookie case.

### 4. 401 vs 403 disambiguation — distinct HTTP status from the strategy

The UI must tell "authenticate again" (expired/absent session → back to login) from
"you lack this permission" (stay authenticated, report denial). We use the correct
HTTP semantics: **401** for authentication failure (missing/invalid/expired token),
**403** for authorization denial (valid token, wrong role / missing permission).

Otto previously collapsed both to 401 from a combined authn+authz strategy (its only
403 path was the Layer-1 `role=` check, which cannot express *permissions*). This
required an **Otto framework enhancement** (Otto is an owned path gem): a strategy
may now return `AuthorizationFailure`, which `RouteAuthWrapper` maps to 403. The
change is additive and backward-compatible (existing strategies never return it).
See the otto branch `feature/strategy-authz-failure-403`.

**Contract impact:** authorization-denial assertions across `try/` flipped from 401
(and 302 on non-JSON stream routes) to 403. These are intentional contract updates,
documented in each test.

### 5. Rate-limit thresholds — 5 failures / 15 min → 15 min lockout (per IP)

Failed logins are throttled by a Valkey counter keyed on client IP (a single shared
passphrase has no per-account lockout). Defaults: **5 failures within 900 s** locks
the source for the remainder of the window; a locked source gets `429` *before* the
passphrase is checked (so it learns nothing). Successful login resets the counter.
All three are env-tunable (`FAMILIA_ADMIN_LOGIN_FAIL_LIMIT`,
`FAMILIA_ADMIN_LOGIN_WINDOW`). Implemented in `Familia::Admin::RateLimit`, not Otto's
Rack::Attack limiter (which is global/middleware-only, not per-endpoint).

### 6. Development TLS posture — Secure on, except dev over loopback

The cookie is always `Secure` except when `RACK_ENV=development` *and* the request is
loopback (`Otto::Request#local?`: localhost server name + local client IP).
`HttpOnly` and `SameSite=Strict` are unconditional. The fail-closed boot guard is
extended: a non-development boot now also refuses to start when
`FAMILIA_ADMIN_PASSPHRASE` is unset (an unusable reject-all login is a
misconfiguration, surfaced at boot rather than at first login attempt).

## Login grant

A single correct passphrase mints **the** admin session: role `admin` with the full
elevated permission set (`reveal_secrets repair run_migrations raw_command`), since
"possession of the passphrase grants an admin session" and login-time permission
selection is a non-goal. Subject and grant are env-overridable
(`FAMILIA_ADMIN_SESSION_SUBJECT`, `FAMILIA_ADMIN_SESSION_PERMISSIONS`) for an
operator who wants to narrow the browser session.

## Consequences

- Backend surfaces: `POST /admin/api/auth/login`, `GET /admin/api/auth/session`,
  `DELETE /admin/api/auth/session`; cookie branch in `PasetoStrategy` (Bearer
  precedence); `OriginGuard`; `RateLimit`; passphrase boot guard.
- The HTTP stack is assembled once in `Familia::Admin::RackApp` and shared by
  `config.ru` and the contract suite, so the CSRF layer is under test.
- New/changed coverage: `try/auth_try.rb` (20 cases), `try/boot_try.rb` (passphrase
  guard), and 401→403 / 302→403 flips across the suite. Otto:
  `route_auth_wrapper_spec.rb` gains the strategy-level-403 cases.
- The token is delivered only as the cookie; it never appears in a response body or
  the session-introspection payload, and the passphrase never appears in any
  response, error, or log.
