# Security review — familia-admin

This is the security pass on the four surfaces flagged before anything talks to
a real database: **reveal gating**, the **raw-command allowlist**, **CSRF**, and
the **audit trail**. Each section states the threat, what the code does, where it
lives, and the residual risk. Findings/decisions are called out as `DECISION`,
`OK`, or `TODO`.

The admin is a developer/operator tool with read + repair power over the entire
object graph. Treat it as a production-critical surface: it can reveal secrets,
mutate records, repair indexes, and run migrations.

---

## 0. Authentication & authorization (foundation)

**Two layers** (`lib/familia/admin/auth.rb`, `lib/familia/admin/api.rb`):

1. **Edge — `AdminStrategy`.** Otto runs the strategy for every route
   (`auth=role:admin` / `auth=permission:*`). It resolves the bearer token
   (`Authorization: Bearer …` or `X-Admin-Token`) to a `Principal` and requires
   the `admin` role. A missing/invalid token **fails closed with 401 before the
   controller runs**. Verified: `security_try.rb` (401 for no token / bad token).
2. **Handler — `require_permission!`.** Elevated actions (`reveal`, `repair`,
   `run_migrations`, `rollback`, `run_command`) re-check the specific permission
   tier and return `403 {error:'forbidden', required_tier, held}` *before any
   side effect*. This keeps the fine-grained check next to the dangerous code
   (defense in depth) and yields the exact body the UI consumes.

- `OK` Tokens are never stored in the clear — the registry is keyed by the
  SHA-256 digest of the token (`Auth.register` / `resolve_token`).
- `OK` Tokens are read from headers only — never the query string or cookies —
  so they stay out of access logs and `Referer`.
- `DECISION` Token→principal mapping is seeded from `ENV['ADMIN_TOKENS']` (JSON).
  A loud, dev-only fallback token is seeded when none is configured and
  `RACK_ENV != production`. Production boot **requires** real tokens.
- `TODO` (deploy) Put the admin behind TLS and a network boundary; rotate
  tokens; consider per-action rate limiting (Otto supports
  `configure_rate_limiting`).

---

## 1. Reveal gating

**Threat:** unauthorized disclosure of encrypted secrets; secret leakage into
logs.

**Controls** (`API#reveal_field`, `lib/familia/admin/api.rb`):

- `OK` Route requires `auth=permission:reveal_secrets`; the controller also
  calls `require_permission!(:reveal_secrets)` → 403 for an admin without the
  tier. Verified: `records_try.rb`, `security_try.rb` (read-only admin → 403 +
  `required_tier: permission:reveal_secrets`).
- `OK` Only fields whose descriptor category is `:encrypted` can be revealed;
  any other field → 400 (`reveal on a non-encrypted field is a 400`).
- `OK` Decryption uses Familia's `ConcealedString#reveal { |plaintext| … }`
  block form; the plaintext is returned once in the response body and never
  retained.
- `OK` **The reveal is audited by field name only — never the value.** The audit
  entry is `{action: reveal, actor, model, id, field}`. Verified:
  `security_try.rb` asserts an audit entry exists for the reveal **and** that no
  audit entry contains the `sk_live_` secret material.
- `OK` Encrypted fields are masked (`[CONCEALED]`) everywhere else: list, read,
  and the raw explorer (see §2). Transient fields (`password`) are never sent.

**Residual:** the operator who reveals a secret sees the plaintext (by design,
audited). There is no rate limit on reveals yet — `TODO` consider one.

---

## 2. Raw-command allowlist

**Threat:** the raw console is a direct line to the database. An over-broad
console can wipe the keyspace (`FLUSHALL`), stall the server (`KEYS`, `DEBUG`),
exfiltrate secrets, or change server config.

**Controls** (`lib/familia/admin/raw.rb`, `API#run_command`):

- `OK` Route requires `auth=permission:raw_command`; controller re-checks the
  tier (403 otherwise). Verified: `security_try.rb`.
- `OK` **Read-only allowlist.** Only side-effect-free read commands execute
  (`GET/HGETALL/SCAN/ZRANGE/SMEMBERS/TYPE/TTL/MEMORY/INFO/…`). Anything else is
  rejected `unknown_command` and never reaches the database. Verified:
  `raw_try.rb` (`SET` → `unknown_command`).
- `DECISION` **Hard-deny list, even when "forced".** `KEYS`, `FLUSHALL`,
  `FLUSHDB`, `CONFIG`, `SHUTDOWN`, `DEBUG`, `MONITOR`, `SWAPDB`, `MIGRATE`,
  `RESTORE` return `command_blocked` and **never execute — regardless of tier or
  `force:true`.** The prototype contract allowed a forced override; we
  deliberately do not. The admin is a read/diagnostic surface; destructive work
  goes through the dedicated, dry-run-gated, audited repair/migration endpoints,
  never an ad-hoc `FLUSHALL`. Verified: `raw_try.rb` (`KEYS` blocked, `FLUSHALL`
  blocked even with `force:true`).
- `OK` Listing is **SCAN-only** with a cursor (`API#scan_keys`); `KEYS` is on
  the hard-deny list.
- `OK` **No ciphertext leak.** `inspect_key` masks encrypted fields of a model
  object key to `[CONCEALED]` and transient fields to `[REDACTED]`
  (`Raw.mask_encrypted`). So the explorer cannot surface secret ciphertext.
  Verified: `raw_try.rb` (`api_secret` → `[CONCEALED]`).
- `OK` Every command attempt (executed, blocked, or unknown) is audited
  `{action: raw_command, actor, cmd, blocked, forced}`.

**Residual:** an allowlisted read can still return large payloads. `TODO`
consider a response-size cap and per-key arg validation if exposed widely.

---

## 3. CSRF

**Threat:** a browser the operator is logged into is tricked into issuing a
state-changing admin request from a malicious page.

**Analysis & DECISION:**

- This API is **stateless and bearer-token authenticated** (`Authorization`
  header). Browsers do **not** attach that header to cross-site requests, and any
  non-simple cross-origin call triggers a CORS preflight. A bearer-token API of
  this shape is **inherently CSRF-immune** — there is no ambient credential to
  ride.
- `DECISION` We therefore **do not enable Otto's built-in CSRF middleware**. That
  middleware is cookie/session-oriented: it derives a session id, sets an
  `_otto_session` cookie, and injects a `<meta>` token into HTML responses. It is
  the right tool for cookie-authenticated HTML apps and the **wrong** tool here —
  enabling it rejects *every* token-authenticated mutation regardless of the
  `csrf=exempt` route flag (the global middleware never consults that flag). The
  `csrf=exempt` markers in `routes` document this intent.
- `OK` **Defense-in-depth: `OriginGuard`** (`lib/familia/admin/security.rb`).
  When `ENV['ADMIN_ALLOWED_ORIGINS']` is configured, any state-changing request
  carrying a non-allowlisted `Origin` is rejected `403 forbidden_origin`.
  Requests with no `Origin` (server-to-server, curl) pass; with no allowlist it
  is a no-op so dev stays frictionless. Verified: token mutations succeed with
  the guard active (`security_try.rb`).
- `TODO` (deploy) Set `ADMIN_ALLOWED_ORIGINS` to the admin UI's origin(s) and
  configure CORS to match. If the admin is ever changed to **cookie/session**
  auth, Otto's CSRF middleware **must** be enabled and the routes' `csrf=exempt`
  removed.

---

## 4. Audit trail

**Threat:** privileged actions with no attribution; a tamperable or droppable
trail.

**Controls** (`lib/familia/admin/audit_log.rb`):

- `OK` **Append-only by construction.** The trail is a Redis **Stream**
  (`XADD`): entries are append-only and individually immutable, the stream is
  strictly ordered, and each entry gets a server-assigned id. No update/delete is
  exposed.
- `OK` **Attribution.** Every entry carries `{at, actor, action, …}` where
  `actor` is the authenticated principal. Verified: `security_try.rb` asserts
  every entry has a non-empty actor.
- `OK` **Coverage.** Audited actions: `reveal`, `create`, `update`, `destroy`,
  `mutate_collection`, `repair`, `run_migrations`, `rollback_migration`,
  `raw_command` (incl. blocked/forced attempts).
- `OK` **No secrets in the trail.** Reveal logs the field name only; §1 verifies
  no plaintext appears in any entry.
- `OK` Audit write failures never crash the request but are logged loudly, so a
  broken trail is visible rather than silent.
- `TODO` (deploy) Ship the stream to an external, retention-controlled log
  (SIEM); set a retention/rotation policy; alert on `reveal` / destructive
  events.

---

## Other hardening in this pass

- `OK` **Mass-assignment protection.** `create_record`/`update_record` only
  accept fields declared on the model (`permitted_fields`); unknown keys
  (`role`, `is_admin`, …) are dropped. The identifier is not reassignable on
  update. Verified: `records_try.rb`.
- `OK` **Create is create-only + atomic.** `klass.build` uses a WATCH-guarded
  `save_if_not_exists!`; a duplicate id returns 409 rather than silently
  overwriting.
- `OK` **Encryption keys from the environment.** `FAMILIA_ENCRYPTION_KEY`
  (base64, 32 bytes) is required in production; a dev key is used only outside
  production and logs a warning (`lib/familia/admin/boot.rb`).
- `OK` **Repairs/migrations are gated + previewable.** Repair and migration runs
  require their tier, support `dry_run`, and are audited.

## How to re-run this pass

```bash
bin/test            # the full Tryouts contract + security suite
```

`try/security_try.rb` is the executable form of §0–§4.
