# Security review — familia-admin backend

A model-aware admin that can read every record, reveal secrets, mutate data, run
migrations, and (optionally) issue database commands is a high-value target. This
document is the security pass over the four surfaces called out for review —
**reveal gating, the raw-command allowlist, CSRF, and the audit trail** — plus the
hardening that backs them. Every claim here is pinned by an executable test in
`try/security_try.rb` / `try/integration_try.rb` (118 tests, all green) so the
gates can't silently regress.

Posture summary: **default-deny, fail-closed, audited, least-privilege.** The
review was completed against a dedicated test database (`FAMILIA_TEST_DB`, default
15) — nothing here ran against production data, which is the point of doing the
pass before anything talks to a real database.

---

## Threat model (who we defend against)

- A **logged-in admin acting carelessly** (fat-fingering a destructive command,
  revealing a secret they shouldn't). Mitigation: dry-run-then-apply, elevated
  tiers, audit trail, raw commands off by default.
- A **lower-privileged operator** trying to exceed their tier (read-only admin
  attempting a reveal/repair). Mitigation: per-route auth tiers + controller
  defense-in-depth permission checks.
- A **cross-site attacker** trying to ride an admin's browser session.
  Mitigation: header-bearer-token auth (CSRF-immune), no ambient cookie auth.
- An **attacker controlling a path/body parameter** (`:model`, `:collection`,
  `cmd`, field maps). Mitigation: strict allowlists for model resolution,
  collection access, raw commands, and field assignment.
- An **attacker who later reads the logs/audit store**. Mitigation: secrets are
  never written to the audit trail or general logs.

---

## 1. Reveal gating  ✅

Revealing an encrypted field returns plaintext over the wire exactly once, so it
is the most sensitive read in the system.

- **Encrypted-only.** `reveal_field` refuses (`400`) any field whose `field_type`
  category is not `:encrypted`. You cannot "reveal" a plain field to bypass
  serialization.
- **Elevated tier, enforced twice.** The route requires
  `auth=permission:reveal_secrets`; the controller *also* re-checks
  `strategy_result.has_permission?('reveal_secrets')`
  (`enforce_permissions_in_controller`, default on). A dropped route tier, a
  missing principal, or a future refactor still fails closed (`403`).
- **Correct decryption path.** Familia's `ConcealedString#reveal` *requires a
  block* and its `#to_json` *raises* by design (fail-closed). The prototype's
  `rec.send(field).reveal` (no block) silently returned `nil`; this backend uses
  the block form `reveal { |plain| plain.dup }` and never lets a `ConcealedString`
  reach `JSON.generate` (the serializer masks encrypted fields as `[CONCEALED]`
  and has a `concealed?` backstop).
- **Returned once, audited.** The response carries the plaintext and an `_audit`
  record. The audit entry records *which* field was revealed (model, id, field,
  actor, time) — **never the plaintext** (see §4).
- **Secrets never leak into list/read.** `serialize`/`Serializers.record` mask
  encrypted fields and omit transient fields on every record path.

Tests: `reveal requires permission`, `reveal denied with no principal`,
`non-encrypted field can never be revealed`, `reveal returns real plaintext once`,
`no audit entry contains the plaintext`, plus the HTTP-stack reveal/permission
cases in `integration_try.rb`.

---

## 2. Raw-command allowlist  ✅

`POST /admin/api/raw/command` forwards a command to the database. It is the most
dangerous endpoint, so it is the most constrained.

- **Default deny.** Only commands on a curated **read-only allowlist**
  (`RawCommand::ALLOWLIST` — GET/HGETALL/TYPE/TTL/SCAN/ZRANGE/SMEMBERS/LRANGE/
  INFO/…) ever execute. Everything else is refused (`403 command_blocked`).
- **No force unlock.** Holding `permission:raw_command` does **not** unlock
  destructive commands. `FLUSHALL`, `FLUSHDB`, `KEYS`, `CONFIG`, `SHUTDOWN`,
  `DEBUG`, `EVAL`/`SCRIPT`, `SET`/`DEL`/`RENAME`/`EXPIRE`, `MIGRATE`, … are
  categorically refused — there is no tier or `force` flag that runs them. This
  is intentionally stricter than the prototype simulator (which hinted at a
  tier+force unlock).
- **Off by default.** Even a permission holder gets `403 command_disabled` unless
  an operator explicitly sets `Familia::Admin.config.raw_command_enabled`
  (`ADMIN_RAW_COMMANDS=true`).
- **Bounded.** `SCAN`/`HSCAN`/`SSCAN`/`ZSCAN` `COUNT` is capped
  (`SCAN_MAX_COUNT`), argument count is capped, multi-word commands
  (`OBJECT`/`MEMORY`) are restricted to read-only subcommands, and `KEYS` is never
  allowed (use `SCAN`).
- **Audited.** Every command (allowed or blocked) is recorded; arguments are
  reduced to `[first_arg, "+N args"]` so a value can't be smuggled into the log.

> Residual: an allowlisted read (`GET`/`HGETALL`) of an encrypted field's key
> returns the **ciphertext** blob, not plaintext. That is acceptable — it is
> encrypted and useless without the keys — but it is why `run_command` is gated
> behind `permission:raw_command` + off-by-default + audit, and the elevated tier
> should be granted sparingly.

Tests: the whole denylist returns `403`, allowlist membership, `SCAN COUNT`
capped, off-by-default, plus the HTTP-stack `FLUSHALL → 403` case.

---

## 3. CSRF  ✅ (by design: header-token auth)

CSRF is an attack on **ambient credentials** (cookies sent automatically by the
browser). This API authenticates with a **header bearer token**
(`Authorization: Bearer …`, see `TokenStrategy`). A cross-site page cannot attach
that header without a CORS grant the server never makes, so these endpoints are
**CSRF-immune by construction**. The `csrf=exempt` markers on the mutation routes
declare exactly this: they do not participate in a session-based CSRF token flow
because they don't rely on a session at all.

Verified posture (tests): every `POST`/`PUT`/`DELETE` route is gated by a
`auth=role:` or `auth=permission:` tier, every mutation marks `csrf=exempt`, and
**no** mutation uses `auth=session`/cookie auth.

**Important deployment caveat.** Otto 2.1's CSRF protection is a *global*
middleware that protects all non-safe HTTP methods with a session/synchronizer
token — it does **not** honor per-route `csrf=exempt`. So:

- This reference app runs with `csrf_protection: false` (enabling it would break
  the token API while adding nothing a header credential doesn't already give).
- **If you switch to cookie/session authentication, you MUST** add `rack-session`
  + `Rack::Session::Cookie`, pass `csrf_protection: true`, and supply a CSRF token
  on every mutation. Under cookie auth the `csrf=exempt` markers are *wrong* and
  must be removed; Otto's global CSRF will then protect all mutations.

> SSE note: the live endpoints are `GET` (EventSource semantics). Browser
> `EventSource` cannot set an `Authorization` header, so a browser SSE client must
> pass the token another way (short-lived stream token or query param over HTTPS)
> or use `fetch`-based streaming (the shipped `backend.js` uses `fetch` so it can
> send the header). `stream/repair` is a `GET` that can mutate when
> `dry_run=false`; it remains gated by `permission:repair`, but prefer driving the
> apply through `POST /integrity/:model/repair` and using the stream for progress.

---

## 4. Audit trail  ✅

`Familia::Admin::AuditLog` replaces the prototype's bare `warn`.

- **Append-only.** The store is a Redis sorted set written with `ZADD` only;
  nothing in the class removes or rewrites an entry. The score is a monotonic
  sequence (`INCR`), not a second-granularity timestamp, so retrieval order is
  true append order and same-second events can't collide or reorder.
- **Secrets-free.** Reveal/raw/destroy/repair/migration entries record *metadata
  only* (actor, action, model, id, field, command name). A defensive `scrub`
  drops any `value`/`plaintext`/`secret`/`password`/`token` a future caller
  passes by mistake. A test asserts **no** audit entry ever contains a revealed
  plaintext.
- **Fail-open for the request, fail-loud for the operator.** If the store is
  unreachable the audited action is **not** blocked (the audit must never become
  a denial vector), but the entry is still emitted to the logger at error level so
  the gap is visible.
- **What is audited:** `create`, `update`, `destroy`, `reveal`, `repair`,
  `mutate_collection`, `run_migrations`, `rollback`, `raw_command`,
  `stream_repair`. Reads are not audited (high volume, low risk); the reveal —
  the one sensitive read — is.

Tests: reveal/destroy/repair/raw all write entries; the plaintext never appears;
sequence numbers are unique and ordered; the scrub redacts a sensitive value.

---

## Additional hardening (backs the four surfaces)

- **Strict model resolution.** The attacker-controlled `:model` path segment
  resolves **only** to registered Familia models, by `config_name` or exact class
  name (`Descriptor.resolve`). It never falls through to `const_get`/`resolve_class`,
  so `Object`, `Kernel`, `File`, `../etc`, `Familia::Horreum`, etc. all `404`
  (tested) — no arbitrary-constant or path-traversal pivot.
- **Collection allowlist.** `read_collection`/`mutate_collection` accept **only**
  developer-declared instance collections. Index-backing hashkeys
  (`email_lookup`, `status_index`), the `:instances` timeline, the
  `:participations` membership index, and participation-target collections are
  filtered out by the descriptor and `404` — you cannot read or corrupt index
  internals through the collection endpoints (tested).
- **Mass-assignment guard.** `create`/`update` accept only persistent, writable
  scalar fields. Unknown keys, transient fields, and (on update) the identifier
  are silently dropped (tested: `password`, `role`, `_key` cannot be injected).
- **Index integrity on update.** Changing an indexed field (`email`) moves the
  index entry (`update_all_indexes(old_values)`) so no stale entry is left behind
  (tested via `query_index` before/after).
- **Cross-database repair guard.** A repair whose fix-set would span more than one
  logical database is refused (`409 CrossDatabaseError`) rather than applied
  non-atomically.
- **Op allowlist per collection type.** `mutate_collection` only dispatches a
  fixed set of native ops per DataType; unknown ops `400`.
- **Encryption at rest + fail-closed serialization.** Encrypted fields are
  `ConcealedString`s; `to_json` raises and the serializer masks them, so a secret
  cannot leak through an accidental serialization path.

### Bugs found and fixed during the pass

1. `transient_field` was declared without `feature :transient_fields` in the
   fixture models — the models didn't load. Fixed in `fixtures/models.rb`.
2. `reveal_field` called `ConcealedString#reveal` with **no block**, which raises
   and (under `safe`) returned `nil` — reveal was silently broken. Fixed to the
   block form.
3. `query_index` used `IndexDescriptor#each_record(value:)`, which ignores the
   value for **unique** indexes (returns every record — an information-disclosure
   bug). Fixed to `find_all_by_<field>(value)`, which filters for both index
   kinds.

---

## Deployment checklist (before production)

- [ ] **Wire real auth.** Replace the reference `ADMIN_TOKENS` ACL / `TokenStrategy`
      with your identity provider. Grant `reveal_secrets` / `repair` /
      `run_migrations` / `raw_command` to as few principals as possible.
- [ ] **Set a stable `FAMILIA_ENCRYPTION_KEY`.** The dev default is ephemeral
      (encrypted fields won't survive a restart) and prints a warning.
- [ ] **Keep `ADMIN_RAW_COMMANDS` off** unless an operator genuinely needs the raw
      console; it's off by default.
- [ ] **Serve over HTTPS** and restrict the admin's network exposure.
- [ ] **Ship the audit store** to durable, access-controlled storage (swap
      `config.audit_sink`) and alert on `reveal` / `repair` / `raw_command`.
- [ ] **If using cookie auth instead of bearer tokens:** enable Otto CSRF, add
      `rack-session`, and remove `csrf=exempt` from the mutation routes (see §3).
- [ ] **Re-run `try/`** in CI; the 118 tests are the regression gate for every
      claim above.
