# Gap Analysis — Auth UI Spec vs Current Code (2026-06-08)

> **SESSION UPDATE — 2026-06-09 (evening): SHIPPED TO MAIN + GATEWAY LIVE.** PR #7
> merged the backend AND frontend to `main` (`8046a0d`); otto 2.2.0 published and
> the path-gem dependency removed; `npm ci` fixed; and the **/login gateway** now
> serves the src/ auth SPA and gates the prototype UI behind the session cookie —
> the rake-token-paste flow is deleted. The spec's flow is operator-visible end to
> end. See "## Session update — 2026-06-09 (evening)". **Open: the backend
> security-verification findings (HIGH: spoofable rate-limit IP) — now on main.**
>
> Earlier strata below are preserved as history: the 2026-06-08 analysis ("~0%
> built"), then the 2026-06-09 backend/frontend build updates.

**Input:** `docs/familia-admin-auth-ui-spec.md` (local spec, not a GitHub issue).
**Branch (original):** `main`, clean tree, no feature branch. **Then:** backend on
`feature/auth-ui-backend`; the Otto 403 enhancement on otto `feature/strategy-authz-failure-403`.
**Now (evening):** all merged to `main` (`8046a0d` via PR #7); the gateway + fixes on
`claude/wizardly-ramanujan-gwf7t1`. This document moved `tmp/` → `docs/` (it was
uncommitted and nearly lost; the ADR's link is updated to match).
**Verdict (original, 2026-06-08):** Login/session flow is **~0% built**. Only the spec's
*named dependencies* (PASETO mint/verify, the Bearer auth strategy, the 1h TTL, the
fail-closed boot guard) pre-exist — those are preconditions, not progress on this feature.

---

## Session update — 2026-06-09 (evening) — merged, unblocked, operator-visible

**Status: the entire spec deliverable is on `main`, and the browser flow is now real:
open `/` → redirected to `/login` → passphrase → HttpOnly cookie → handed back to the
prototype UI, whose same-origin fetches authenticate via the cookie.** Work landed on
`claude/wizardly-ramanujan-gwf7t1` (three commits) on top of merged main.

### Merge

- **PR #7 merged `feature/auth-ui-frontend` (incl. the backend stack) into `main`**
  at `8046a0d` — all 8 commits, ~5,200 lines. The "done but unmerged" framing of the
  earlier updates is obsolete; everything below the line shipped.

### Dependency + build health (fresh clones work again)

- **otto 2.2.0 published to rubygems** (was: `path: '../otto'`, unbundleable without
  a sibling checkout on the right branch). Verified the published gem carries the
  strategy-level `AuthorizationFailure` → 403 support (`authorization_failure.rb`,
  `route_auth_wrapper.rb`), switched the Gemfile to `gem 'otto', '~> 2.2'`, and ran
  the full `try/` suite against it: green.
- **`npm ci` fixed**: the lockfile merged in PR #7 was stale against `package.json`
  (EUSAGE on any fresh checkout/CI). Regenerated and verified (`npm ci` + suite).

### The /login gateway (spec flow, end to end)

- **src/ is now served** (the prior "not yet served — separate follow-up" caveat is
  closed): `RackApp.login_app` serves the Vite build (`base: '/login/'`) under
  `/login`, with SPA fallback and a 503 "run `npm run build`" operator hint when
  `dist/` is absent.
- **The prototype root is gated**: unauthenticated browser hits on the static designs
  302 to `/login?return_to=<original path+query>`; a verifiable session cookie passes.
  The API is never redirect-gated — Bearer clients still see 401/403 statuses.
- **Post-login handoff**: the SPA navigates back to `return_to`, sanitized against
  open redirects (same-origin absolute paths only; `//host`, `/\host`, schemes all
  collapse to `/`). Direct visits to `/login` (no param) keep the in-app shell.
- **The Rejected Alternative is deleted, not just superseded**: `backend-client.js`
  no longer reads `window.FAMILIA_ADMIN_TOKEN`/localStorage or sends Authorization;
  the cookie rides along on its same-origin fetches. 401 → top-window redirect to the
  gateway (location preserved); 403 → gated UI states render in place, no logout.
- **Coverage from the start** (per session requirement): return_to sanitizer vectors,
  App gateway-handoff tests, SessionBar/PermissionNotice/ReauthOverlay component
  tests (previously untested), cookie-era node tests for the prototype client, and
  `try/login_gate_try.rb` driving the full Rack stack (gate, no-loop on /login, API
  pass-through, SPA serving, missing-build hint). Totals: **vitest 106 pass, `tsc`
  clean; node client tests 9 pass; `try/` 146 pass**. Flow additionally verified live
  (rackup + Valkey, curl): redirect → SPA → 401 wrong passphrase → 200 claims+cookie
  (token never in body) → gated root opens → cookied API 200 → logout → gate closes.
  (Nuance: a cookie-auth logout without an Origin header is 403 by OriginGuard
  design; browsers always send Origin on non-GET, so only bare curl trips it.)

### Corrections to earlier claims

- **PR #6's description is wrong about main — in a good way.** Its body claims the
  Phase-3 security guards were removed from `api.rb` (collection allowlist/RCE fix,
  `mask_encrypted_fields!`, run_command cap, unique-index 409) and that `exp` became
  optional. The merged code **retains all of them**, and `auth.rb` still rejects
  no-`exp` tokens. The "PASETO hardening … already on main" line below remains true.

### Still open (prioritized)

1. **Backend security findings — now live on `main`, unchanged:** the **HIGH**
   (login rate limiter keys on `@req.ip`, spoofable via `X-Forwarded-For` under
   default trusted proxies; zero `trusted_proxies`/`ip_filter` pinning anywhere),
   the **MEDIUM** (no passphrase strength floor at boot), and the LOWs (OriginGuard
   vs strategy Bearer-regex divergence, persistent lock if the first `EXPIRE` fails,
   `FAIL_LIMIT=0`/`WINDOW=0` accepted, limiter fails open on Valkey outage,
   no `__Host-` prefix, otto `samesite:` dead code).
2. **The findings JSON is committed** — *[resolved 2026-06-09 evening]*: now at
   `docs/0609-auth-security-verification-findings.json` (was tmp-only), alongside
   the orchestration handoff (`docs/0608-familia-admin-orchestration-handoff.md`,
   archived verbatim). The local-only artifacts that remain are
   `tmp/0608-phase3-security-report.md` and the plan file the handoff references.
3. **Prototype has no logout control** (logout = `DELETE /admin/api/auth/session`
   or cookie expiry).
4. **Real admin screens in src/** — the gateway hands off to the prototype; porting
   Records/Models/Integrity/Migrations/Explorer into src/ is the next major effort
   (recommendation on record: keep the prototype as the feedback surface, port one
   screen first — Models for the cheap win or Integrity for maximum learning).

---

## Session update — 2026-06-09 (backend complete, frontend pending)

**Status: the entire BACKEND deliverable is built and green; the six blocking design
decisions are resolved (ADR `docs/adr/0001-auth-ui-flow.md`); the frontend is the
remaining work.** Tests: `bundle exec try --agent try/` → **134 pass / 0 fail**
(was 112; +20 `auth_try.rb`, +2 boot-guard). Otto security suite → **178 pass / 0 fail**.
An adversarial security-verification workflow (cookie/CSRF/401-403/passphrase/rate-limit)
is running; findings will be folded in.

### Built this session (the ❌/⚠️ items below, now done)

- **3 auth routes** — `POST /admin/api/auth/login`, `GET /admin/api/auth/session`,
  `DELETE /admin/api/auth/session` (`resources/00-assets/routes.txt`), controller
  `Admin::Sessions` (`lib/familia/admin/sessions.rb`).
- **Passphrase verify** — `Familia::Admin::Passphrase` constant-time compare,
  reject-all when unset; boot guard extended to fail closed on a missing passphrase
  in non-dev (`boot.rb`).
- **Cookie session** — HttpOnly + SameSite=Strict always; Secure except dev-loopback;
  response body = claims, **never the token** (verified by test).
- **Strategy cookie branch** — `PasetoStrategy` reads cookie OR Bearer, **header
  precedence** (`auth.rb`).
- **401 vs 403** (Open Q#4) — resolved via an **Otto framework enhancement**
  (`AuthorizationFailure` → 403); authn failures stay 401. Backward-compatible,
  with Otto specs. Existing `try/` authz-denial assertions flipped 401/302 → 403 as
  intentional contract updates.
- **CSRF** (Open Q#3) — SameSite=Strict + `Familia::Admin::OriginGuard` middleware
  (cookie-auth mutations require an allowlisted Origin/Referer; Bearer clients bypass).
- **Rate limit** (Open Q#5) — `Familia::Admin::RateLimit` Valkey counter, 5 fails /
  15 min → 15 min lockout (env-tunable); locked → 429 before the passphrase compare.
- **Shared stack** — `Familia::Admin::RackApp` assembles config.ru AND the test
  harness identically, so the CSRF layer is under test.

### Open Questions — all resolved (ADR 0001)

Q1 passphrase-at-rest → plaintext + constant-time (env is the secret boundary).
Q2 revocation → TTL-only (jti+denylist deferred). Q3 CSRF → SameSite + OriginGuard.
Q4 401/403 → Otto `AuthorizationFailure` → 403. Q5 rate-limit → 5/15min/15min.
Q6 dev TLS → Secure except dev-loopback + passphrase boot guard.

### Remaining — UPDATE 2026-06-09 (later)

- **Frontend** (spec items 9–11): **DONE.** Built on `feature/auth-ui-frontend`
  (commit `ccdb358`, pushed; stacked on `feature/auth-ui-backend`). Real React auth
  shell under `src/` (React 19 + TS + Vite): API client (same-origin cookie session,
  never touches `localStorage`/`document.cookie`/token), pure auth reducer, AuthProvider
  (bootstrap indeterminate → app-or-login gate, 401→reauth overlay preserving in-app
  location, 403→notice without logout, lockout recovery off `retry_after`), Login
  (idle/submitting/error/locked, generic error), SessionBar (claims, never the token),
  PermissionNotice, ReauthOverlay; dark-first styles on the Otto/admin tokens. Replaces
  the rejected `window.FAMILIA_ADMIN_TOKEN`/localStorage Bearer path. Tests: vitest +
  jsdom + testing-library, **78 pass**; `tsc --noEmit` clean; `vite build` green.
  Reviewed by `feature-dev:code-reviewer` — no blocking issues. 403/429 are
  untriggerable end-to-end (browser session grants all perms; lockout needs real
  rate-limit state) so they are covered at the logic layer with mocked responses.
  NOTE: `src/` is not yet served — `config.ru` serves the `resources/01-designs`
  prototypes statically; wiring the Vite build into the served app is a separate,
  unscoped follow-up (dev: `npm run dev` proxies `/admin/api` → Ruby :9292).
  *[Superseded 2026-06-09 evening: src/ is served at /login and the gateway gates
  the prototypes — see the evening session update.]*
- **Security-verification findings: RECORDED, backend-branch follow-up (not folded
  into the frontend).** The adversarial workflow returned **FAIL** — full output in
  `tmp/0609-auth-security-verification-findings.json` *(now committed:
  `docs/0609-auth-security-verification-findings.json`)*. All findings are **backend**:
  - **HIGH** — the login rate limiter keys on `@req.ip` (`sessions.rb:133`), which
    Rack 3.2.6 derives from a spoofable `X-Forwarded-For` under the default
    `trusted_proxies` (loopback + all RFC1918). An in-scope internal attacker rotates
    the header per request to get a fresh counter, defeating the *only* login
    brute-force control. Fix: pin `trusted_proxies`/`ip_filter` to the known proxy (or
    loopback-only for a direct deploy); document the topology in ADR 0001. Same fix
    closes a confirmed MEDIUM Valkey memory-amplification DoS.
  - **MEDIUM** — no passphrase strength floor (`passphrase.rb`, `boot.rb` check
    presence only); enforce a minimum length/entropy at boot.
  - Plus LOW/INFO: OriginGuard vs strategy Bearer-regex divergence, persistent-lock if
    the first `EXPIRE` fails, `FAIL_LIMIT=0`/`WINDOW=0` accepted, limiter fails open on
    a Valkey outage (declare it), no `__Host-` cookie prefix (deferred), Otto
    `samesite:`-typo dead code.
  These belong on `feature/auth-ui-backend` (the code under review), not the frontend
  branch; the no-rebase constraint keeps them separate. Awaiting user go-ahead.
- **Commits/PRs:** otto 403 (`feature/strategy-authz-failure-403`) → admin backend
  (`feature/auth-ui-backend`) → frontend (`feature/auth-ui-frontend`, pushed). PRs and
  the backend security fix pending user go-ahead.
  *[Superseded 2026-06-09 evening: PR #7 merged everything to main; otto 2.2.0
  published. The security fixes remain the open item.]*

Method: direct primary-source verification (the skill's 3-agent fan-out targets "current
branch changes," of which there are none). Grounded in `routes.txt`, `auth.rb`,
`src/App.tsx`, `backend-client.js`, and a `lib/` cookie/session sweep.

---

## ✅ Implemented (dependencies only — predate this spec)

| Item | Evidence | Note |
|---|---|---|
| PASETO mint/verify facility | `auth.rb` `mint`/`verify` | v2.local (no v4 gem); `exp` enforced |
| Bounded token lifetime ~1h | `auth.rb:48` `DEFAULT_TTL = 3_600` | At the **mint** layer only — no cookie "session" exists to expire |
| Non-dev boot fails closed on dev-default/malformed **keys** | Phase-3 bug 7 (`boot.rb`), `auth.rb:95` no-`exp` reject | Covers PASETO/encryption keys; does **not** yet cover the absent **passphrase** reference the spec also requires |
| Redis/Valkey available for rate-limit counters | infra present | Not wired to any login limiter |

## ⚠️ Partial (primitive present, feature wiring absent)

- **Mint-on-success** — `Auth.mint` exists, but no login endpoint calls it and there is no
  passphrase to gate it. (FR line 41)
- **Strategy accepts a token** — `PasetoStrategy#bearer_token` reads `HTTP_AUTHORIZATION`
  only (`auth.rb:157`). The spec's "cookie **or** Bearer, header precedence" needs a new
  cookie branch. Bearer half works; cookie half is absent. (FR line 51)

## ❌ Missing (the actual deliverable — none of it exists)

Routes: **no** `POST /admin/api/auth/login`, `GET /admin/api/auth/session`, or
`DELETE /admin/api/auth/session` in `routes.txt`. Backend cookie/session/HttpOnly handling:
**zero matches** in `lib/` (the two `Session` hits are the Familia *data model*, not HTTP).

- Login screen + idle/submitting/error/locked states — `src/App.tsx` is a one-line stub
  (`<div>Familia Admin</div>`); the prototype still uses `window.FAMILIA_ADMIN_TOKEN` /
  localStorage Bearer — **the exact "Rejected Alternative" the spec names** (`backend-client.js:24-48`).
- Passphrase field, constant-time server compare, generic error
- HttpOnly + Secure + SameSite=Strict cookie; response body = claims, never the token
- Session-introspection endpoint (claims for UI bootstrap) + logout cookie clear
- Cookie not readable via `document.cookie`; Secure/TLS-only transmission
- UI session bootstrap (indeterminate-while-in-flight) and claim display
- Re-auth on expiry that preserves prior in-app location
- Passphrase-absent → reject all; passphrase never in logs/response/errors

## 🚧 Blocked on the spec's own Open Questions (not buildable as-specified yet)

- **401 vs 403 disambiguation (Open Q#4)** — the strategy returns one generic `AuthFailure`
  for both expired/absent and authz-denied (`auth.rb:123,126`; Otto collapses to 401). The
  UI requirement to separate "re-auth" from "you lack permission" needs a *backend* signal
  change first.
- **Rate-limit lockout (Open Q#5)** — thresholds/backoff numerically unagreed.
- **CSRF depth (Open Q#3)** — see headline finding below.

## 🔴 Headline security interaction — CSRF activation on ship

The Phase-3 report found `csrf=exempt` currently **inert** (no ambient cookie credential).
This spec introduces a cookie. The moment it ships, every `csrf=exempt` mutating route
becomes cross-site reachable: `routes.txt:30,32,33,36,42,54,70`
(create / update / destroy / reveal / mutate_collection / repair / run_command). Building
the spec as written **introduces** a CSRF exposure unless SameSite=Strict + an Origin/Referer
allowlist (and a re-audit of every `csrf=exempt` marker) land **in the same change**. This is
the most consequential spec↔code interaction, not a checklist item.

## 🔍 Out of Scope / beyond-spec already in tree

PASETO hardening shipped in Phase 3 (collection-send RCE fix, identifier/created_at drop,
unique-index 409, encrypted-field mask, run_command cap) — orthogonal to auth UI, already on `main`.

---

## Status label

**No label** (0% — open ticket). Per the rubric, `revisit` would require partial work *on this
feature*; the partial items are spec-listed dependencies that predate it. The handoff agrees:
"DESIGNED, not built … this auth work has no branch yet."

*Advisory only:* the input is a local spec, not a GitHub issue, so there is no `gh` label to apply.

## Action items (prioritized)

**Blocking design decisions (resolve before coding):**
1. Open Q#3 CSRF defense depth — decide SameSite-only vs Origin allowlist + `csrf=exempt` re-audit. Gates safe ship.
2. Open Q#4 — add a distinguishable 401-vs-403 signal in `PasetoStrategy`/Otto before the UI can branch.
3. Open Q#1 passphrase-at-rest (plaintext+constant-time vs argon2id/bcrypt); Open Q#5 rate-limit thresholds; Open Q#6 dev TLS/Secure-cookie posture.

**Core build (backend):**
4. Add the 3 `auth/*` routes + controller actions (login/session/logout).
5. Passphrase verify (constant-time) against a configured reference; reject-all when unset; extend the fail-closed boot guard to the passphrase.
6. Set-Cookie: HttpOnly, Secure (loopback-conditional), SameSite=Strict; response body = claims, never the token.
7. Cookie branch in `PasetoStrategy` with Bearer precedence.
8. Rate-limited login with locked state (Valkey counters).

**Core build (frontend):**
9. Real login screen (idle/submitting/error/locked) replacing the `window.FAMILIA_ADMIN_TOKEN` path.
10. Session bootstrap via `GET auth/session` (indeterminate state) → app-or-login gate.
11. Claim display (subject/role/permissions/expiry); expiry re-auth preserving location; 403-without-logout handling.
