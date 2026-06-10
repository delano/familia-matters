# ADR 0001 — Admin UI Authentication Flow

- **Status:** Accepted
- **Date:** 2026-06-09
- **Context spec:** [`docs/familia-admin-auth-ui-spec.md`](../familia-admin-auth-ui-spec.md)
- **Gap analysis:** [`docs/0608-auth-ui-gap-analysis.md`](../0608-auth-ui-gap-analysis.md)

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

#### Client-IP trust for the rate-limit key

Because the limiter is the *only* brute-force control on the shared passphrase, its
key (`@req.ip`) must be an address the client cannot forge. `Otto::Request#ip` returns
the **TCP peer** (`REMOTE_ADDR`) unless the peer is in Otto's
`security_config.trusted_proxies`, which **defaults to empty** — so by default
`X-Forwarded-For` is never consulted and the key is unspoofable.

**Re-analysis of security finding 0609 (HIGH "spoofable X-Forwarded-For", and its
linked MEDIUM "Valkey memory-amplification DoS") — both FALSE POSITIVES.** The review
reasoned that `@req.ip` was spoofable because Rack's default trusted-proxy filter
trusts all RFC1918 ranges. That filter is never consulted: `Otto::Request` does not
override `#ip`, but it *does* override `#trusted_proxy?` — the predicate `#ip` uses to
decide whether to read `X-Forwarded-For` — to consult Otto's `trusted_proxies` (empty
by default). With nothing trusted, `#ip` returns `REMOTE_ADDR` and never reads the
header. Verified end to end: even with Rack's stock RFC1918-trusting filter restored,
a rotating `X-Forwarded-For` from a private peer keys every attempt on the same TCP
peer and the lockout holds. With no attacker-driven key cardinality, the
Valkey-amplification DoS does not arise either. Pinned by regression tests in
`try/auth_try.rb`; the misleading mechanism is called out in a comment at
`Sessions#client_ip` so a future reader doesn't repeat the false-positive analysis.

**Deliberately NOT changed:** an earlier draft of this fix added a second, parallel
trusted-proxy config for the rate-limit key. Rejected — Otto's single `trusted_proxies`
already governs `@req.ip` *and* the IP-privacy masking consistently; a second knob
would let the two diverge (a footgun) and reimplements logic Otto already provides.
The key derivation stays on Otto's single config.

**Operational note (a real, separate consideration):** deploy behind a reverse proxy
and *not* registering it in Otto's `trusted_proxies` means every request keys on the
proxy's address — one attacker's failures then lock out all operators, and legitimate
per-client throttling is lost. Registering the proxy there makes `@req.ip` (and the
IP-privacy masking) resolve the real client. (Otto's IP-privacy middleware masks a
*public* peer to its /24; a public-IP proxy is handled once it is trusted, because the
middleware then resolves and masks the real client into `REMOTE_ADDR`.)

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
