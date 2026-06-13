> **ARCHIVED SNAPSHOT — committed 2026-06-09, content preserved verbatim as written
> 2026-06-08 (rev 3).** Much of "Where we are" has since shipped: the Phase-3 fixes
> are on `main`, the auth UI (backend + frontend) was built and merged (PR #7), otto
> 2.2.0 was published to rubygems (the path-gem note below is obsolete), and the
> `/login` gateway replaced the `window.FAMILIA_ADMIN_TOKEN` browser flow described
> in "Run it". Current state: `docs/0608-auth-ui-gap-analysis.md` (evening update).
> The security-verification findings referenced alongside this work are committed at
> `docs/0609-auth-security-verification-findings.json` and tracked as issues #9
> (HIGH), #10 (MEDIUM), and #11 (LOWs) — fixes in progress, merging soon. Some
> referenced artifacts
> (`tmp/0608-phase3-security-report.md`, the plan file under `~/.claude/plans/`)
> remain local-only.

# Familia Admin — Ultracode Orchestration Handoff (2026-06-08, rev 3)

For a fresh dev taking over the multi-agent (ultracode) orchestration. Goal: replace the
in-browser LLM simulator with the real Otto backend so the Claude-Design prototype drives live
Familia data over Redis/Valkey. Full plan + decisions:
`/Users/d/.claude/plans/we-want-to-bring-stateful-engelbart.md` (read it first).

## Where we are

- **Phase 0 ✅ Bootstrap** — runnable Otto app, boots against live Valkey, PASETO auth gating proven,
  seed + encryption + AuditLog work.
- **Phase 1 ✅ Implement** — `api.rb` TODO actions implemented, response layer fixed, `backend-client.js`
  rewritten to a real HTTP/SSE adapter. 11/11 Phase-1 integration checks passed vs live Valkey.
- **Phase 2 ✅ Contract tests + 7-bug fixes** — full Tryouts suite + node adapter test authored; all 7
  known bugs fixed; node adapter test **6/6**, independently adversarially re-verified, and the
  adapter↔server round-trip smoked in a real browser. All committed to `origin/main` (`eaa8ba1` suite,
  `9296bae` api/boot fixes). Details below.
- **Phase 3 ✅ Security pass (THIS SESSION)** — adversarial audit (5 lenses → per-finding skeptic grounded
  in `../familia`/`../otto` source → gate synthesis, run `wf_6793c184-546`). Gate was CONDITIONAL; found
  real defects BEYOND the 7-bug list (1 critical, 1 high, 1 medium, several low), all fixed and pinned by
  `try/security_try.rb` (23 cases, **proven RED pre-fix**). **`try --agent try/` = 112 pass / 0 fail**
  (89 + 23), node adapter **6/6**. Findings + fixes below; full report `tmp/0608-phase3-security-report.md`.
- **NEXT — commit the Phase-3 fixes (uncommitted, see below), then optional follow-ups** (stale-index
  orphan on rename = a Familia-level fix; UI polish from the Phase-2.5 list). No production DB until the
  Phase-3 fixes land.
- **DESIGNED, not built — UI auth/login flow.** Spec:
  [`docs/familia-admin-auth-ui-spec.md`](../docs/familia-admin-auth-ui-spec.md). Replaces hand-pasted
  `window.FAMILIA_ADMIN_TOKEN` with a shared-passphrase login → server-minted PASETO in an HttpOnly
  cookie (Bearer header retained for curl/CI/MCP). Product decisions fixed (shared passphrase, internal
  small-team). Six Open Questions still unresolved in the spec: passphrase-at-rest hashing, logout
  revocation (`jti`+denylist vs TTL-only), CSRF depth on the `csrf=exempt` mutations, 401-vs-403
  disambiguation (Otto collapses both to 401), rate-limit thresholds, dev TLS/Secure-cookie posture.
  Worktrees for issues #2/#3 exist; this auth work has no branch yet.

## ⚠️ FIRST THING: commit the uncommitted Phase-3 fixes

Phase 2 is fully committed to `origin/main` (the rev-2 "commit api.rb/boot.rb first" step is DONE —
`9296bae`). The NEW uncommitted work in the tree is **Phase 3** (verified green WITH these in place):

- **Modified (must commit):** `lib/familia/admin/api.rb` (collection allowlist, identifier/created_at
  drop on update, unique-index conflict 409, raw/key encrypted mask, run_command result cap, reveal doc),
  `lib/familia/admin/auth.rb` (no-`exp` token rejection), `resources/00-assets/routes.txt` (reveal comment).
- **Untracked (must `git add`):** `try/security_try.rb` (the gate — 23 cases), and the docs
  `tmp/0608-phase3-security-report.md` + this handoff.
- On branch `main`; **branch off main before committing** per repo convention. A fresh clone of
  `origin/main` is green at 89 but does NOT have the Phase-3 fixes or `security_try.rb`.

## Run it (dev defaults baked in; needs Valkey on 127.0.0.1:6379)

```
cd /Users/d/Projects/dev/delano/familia-admin
bundle install                           # rack-test (~>2.2) was added to the :test group this session
bundle exec rake db:seed                 # 4 customers, 2 apikeys, 2 sessions
bundle exec rake auth:token              # mint admin PASETO (all elevated perms)
bundle exec rake auth:token:reveal_only  # reduced (role:admin, NO elevated perms) — for gated/forbidden UI
PERMS=raw_command SUB=me bundle exec rake auth:token:custom
bundle exec try --agent try/             # contract + security suite — expect 112 pass / 0 fail
bundle exec try --agent try/security_try.rb   # Phase-3 gate alone — expect 23 pass / 0 fail
node resources/01-designs/prototype/backend-client.test.mjs   # adapter #5/#6 — expect 6/6
bundle exec rackup                       # serves 01-designs frontend at / and /admin/api/*
# Browser: open http://127.0.0.1:9292/ , set window.FAMILIA_ADMIN_TOKEN=<token> (else every call 401s)
```

Note: `boot.rb` now **fail-closes** outside development with dev-default keys. `bundle exec rackup` /
`rake` default to development and boot fine. To boot non-dev you must set real `FAMILIA_ADMIN_PASETO_KEY`
and `FAMILIA_ADMIN_ENCRYPTION_KEY`. `try/test_helper.rb` pins `RACK_ENV=development` before boot so the
suite is unaffected by the guard.

## Phase 2 — the 7 bugs, all fixed and verified

Assert-correct-behavior, then make-live-match. Tests in `try/` (do not weaken them). Per-bug, what landed:

1. **query_index value filter** (`api.rb#query_index`). Root cause: Familia `IndexDescriptor#each_record(value:)`
   ignores `value:` for a class-level **unique** index (`backing` returns the whole hashkey). Fix: branch on
   `desc.unique?` → resolve via the generated finder `klass.public_send("find_by_#{desc.field}", value)`
   (one record or nil). MULTI path keeps `each_record(value:)` (the `_for(value)` bucket already filters).
   GOTCHA baked into the fix: a `Horreum` is `Enumerable`, so `Array(rec)` splats its fields — use `[rec].compact`.
2. **created_at/updated_at** (`api.rb` create/update). Server stamps `Familia.now.to_i`, guarded by
   `persistent_fields.include?` (ApiKey has no updated_at). Stamped into `fields` before `build` (rides the
   atomic write); update re-stamps only `updated_at` inside `atomic_write`, after the empty-body 400 guard.
3. **stream_repair healthy** (`api.rb#stream_repair`). Was already green at baseline (the phase-fallback was
   dead-but-latent because `report.healthy?` short-circuits it on clean data). Fix removes the divergence
   anyway: `done.healthy = report.respond_to?(:healthy?) ? !!report.healthy? : false` — tracks the exact
   signal `GET /integrity/:model` reports; `false` when the report is absent (no fabrication). `repair_phases`
   left untouched (other tests assert phase/total keys).
4. **run_command READ-ONLY** (`api.rb#run_command`). Removed the elevated write path entirely. `allowed =
   READ_ONLY_COMMANDS.include?(cmd)` (cmd upcased); anything else → 403 `{error:'command_blocked'}` **before
   any audit**, regardless of force/permission. Closes audit-log erasure/forgery + data corruption via the raw
   path. (`HARD_DENY_COMMANDS` and `actor_permission?` are now unused dead code — left in place; remove in a
   cleanup if you like.) **Verified live:** DEL/ZADD/HSET/ZREMRANGEBYRANK/FLUSHDB/KEYS against `audit_log:entries`
   all 403, key intact, zero forged audit entries, reads still 200.
5. **adapter command_blocked passthrough** (`backend-client.js`). On 401/403, parse the body; pass a recognized
   `{error:...}` (command_blocked/scan_required) through verbatim; only synthesize `{error:'forbidden',
   required_tier}` for generic/empty auth failures.
6. **adapter stream auth-failure** (`backend-client.js`). Stream fetch uses `redirect:'manual'`; a 3xx /
   opaqueredirect / non-2xx / non-event-stream response resolves `{error:'forbidden',
   required_tier:'permission:repair'}`. 2xx SSE parsing intact.
7. **boot fail-closed** (`boot.rb#guard_production_keys!`, first line of `setup!`). `env = RACK_ENV ||
   'development'` (RACK_ENV is the sole environment signal for this Rack process); in non-dev, raise naming
   the offending dev-default PASETO/encryption key + the override vars.

### Verification evidence (this session)
- `bundle exec try --agent try/` → **89 pass / 0 fail** (10 files); re-run by hand on the working tree, green.
- `node …/backend-client.test.mjs` → **6/6** (covers #5, #6, generic-auth, SSE regression).
- Independent adversarial verify agent: every bug `confirmed`, incl. the bug-4 security check above.
- **Browser round-trip (live server + real Redis):** reveal→200, raw read→200 then blocked write→**403** (#5),
  repair dry-run→200 and `stream/repair`→200; reduced token: reads 200, repair→**401**, `stream/repair`→**302**
  (#6); zero non-`/admin/api` backend calls (no `window.claude`). Records list rendered 5 real customers.
- **Integrity console works on CLEAN data (confirmed after the smoke):** `GET /integrity/customer` →
  `healthy:true`, repair `stream/repair` `done.healthy:true` — they AGREE (bug3). The smoke initially saw
  `healthy:false` ONLY because the keyspace was polluted (see the `rake db:seed` note below); a flush+reseed
  cleared it. Not a defect.

## Files (canonical app at repo root; resources/00-assets fixtures left pristine)

New this session:
- `try/test_helper.rb` — in-process Rack::Test against the SAME app config.ru builds (Boot.setup! +
  Otto.new(routes) + Auth.register!). `reset_and_seed!` flushes db0 **and** db1 (Session is on a distinct db1
  client) + AuditLog, seeds `cust_alice`(active)/`cust_bob`(inactive)/`cust_pending`(pending) + `key_alice_1`
  + `sess_alice_1` with KNOWN values. Token helpers (admin / reduced / custom). Pins `RACK_ENV=development`.
- `try/{smoke,discovery,records,collections,query,integrity,raw,migrations,streams,boot}_try.rb` — per-domain
  contract tests. `boot_try.rb` tests bug 7 via isolated `system({RACK_ENV=…})` subprocesses.
- `resources/01-designs/prototype/backend-client.test.mjs` — node test: shims window/localStorage/fetch, evals
  the IIFE, asserts adapter behavior (#5/#6). The deterministic verifier for the JS-only bugs.

Changed: `lib/familia/admin/api.rb`, `lib/familia/admin/boot.rb` (uncommitted — see top),
`resources/01-designs/prototype/backend-client.js` (committed), `Gemfile`/`Gemfile.lock` (committed).

## Live-shape deltas the tests assert (Phase-3 context; live is truth)

- `health_check => report.to_h`: keys are `model_class` (not `model`), `audited_at` (not `checked_at`),
  `instances` counts are INTEGERS (`count_timeline`/`count_scan`/`phantoms`/`missing`), NO `summary`,
  `related_fields` may be null. Tests assert live keys, not fixture literals.
- `migration_status => {status: nil}`, `schema_drift => {drift: nil}`, run/rollback → 400 'migration runner
  unavailable' — `Familia::Migration` is NOT loaded in this app, so the controller's `safe{}` collapses
  runner/registry to nil. (If you wire migrations, these tests must change.)
- Index coordinate uses `:` (`Customer:email_lookup`) not the fixture's `.`.
- `GET /models` returns CLASS names incl. `Familia::Admin::AuditLog` (it's a registered Horreum member, so it
  also appears in `_meta`).
- Auth denials: `response=json` routes deny **401** (Otto `{error:'Authentication Required'}` shape); the two
  NON-json `stream/*` routes deny with a **302 redirect** — the exact shape adapter bug #6 handles.
- `stream_commands` still emits open/heartbeat/close but NO `command` events (capture middleware
  `DatabaseCommandCounter` is off); its 25s heartbeat body is asserted via headers only.

## Phase 3 — security pass ✅ DONE (results)

Method: read-only multi-agent audit (5 lenses → per-finding adversarial skeptic grounded in
`../familia`/`../otto` source → gate synthesis, workflow `wf_6793c184-546`), then serial live-repro +
fixes. 24 candidate findings: 14 real, 10 refuted. The Phase-2 items were re-confirmed in one line each;
the real value was **new surface the 7-bug list never covered**. Full report:
`tmp/0608-phase3-security-report.md`.

**Confirmed + fixed (all in `lib/familia/admin/api.rb` unless noted):**
1. **CRITICAL — collection `send` RCE.** `read_collection`/`mutate_collection` passed the attacker-controlled
   `:collection` path segment straight into `rec.send`, so a `role:admin` GET `.../records/cust_alice/destroy!`
   (or `clear`/`delete!`/`remove_from_instances!`) invoked arbitrary Horreum instance methods, **unaudited**.
   Fix: `collection_for(klass, rec)` allowlists the segment against `klass.related_fields` keys (instance
   DataTypes only; class-level `instances`/index zsets excluded on purpose) before dispatch; unknown → 404.
2. **HIGH — identifier rewrite.** `update_record` let the body rewrite the identifier (`custid`), redirecting
   the HMSET onto a victim's key. Fix: drop the identifier field in `update_record` (NOT in shared
   `permitted_fields` — `create`'s `build` REQUIRES the client `custid`; dropping it there breaks create).
3. **MEDIUM — unique-index hijack.** `update`-ing one record's email onto another's value hijacked
   `email_lookup`. Fix: `unique_index_conflict` pre-validates via `find_by_<field>` → 409.
4. **LOW — raw/key encrypted leak.** `inspect_key` returned raw `hgetall`, exposing the at-rest encrypted
   value past serialize's `[CONCEALED]` mask on a `role:admin` (not `reveal_secrets`) route. Fix:
   `mask_encrypted_fields!`. (Note: `run_command` HGETALL is NOT masked — accepted as out-of-scope escape hatch.)
5. **LOW — created_at forgery on update.** Fix: `update_record` deletes `created_at` from `fields`.
6. **LOW — run_command unbounded read (DoS).** Fix: `RUN_COMMAND_RESULT_MAX=1000` caps Array/Hash with a
   `truncated` flag.
7. **INFO — reveal "exactly once" claim false** (re-revealable, each call audited): doc fix in `api.rb` +
   `routes.txt`. **INFO — no-`exp` token never expired:** `auth.rb#verify` now `return nil unless exp`.

**Verified sound (refuted, no change):** PASETO tamper/garbage/downgrade(`v2.public`)/expired rejection +
every denial → `AuthFailure`; `tier` never read by server authz; role/permission are independent OR gates
by design; `csrf=exempt` inert (no cookie/session); `resolve_class` no `const_get`/`eval`; AuditLog
unreachable for mutation via record/collection/raw routes; `destroy_record` cannot report `destroyed:false`;
bug-7 boot fail-closed; MCP/TOOL routes dead at boot.

**Tests — `try/security_try.rb` (23 cases), proven non-vacuous.** Stashed the fixes and confirmed 11
fix-proving cases go RED for the RIGHT symptom (the `destroy!` GET is red because the record is actually
destroyed, `survived=404`, not a vacuous route 404); 12 invariant/guard cases correctly stay green either way.

**Open follow-up (non-blocker, Familia-level):** the medium fix closes the unique-index *collision* but a
legitimate email change still orphans the OLD `email_lookup` entry — Familia's `auto_update_class_indexes`
is add-only. The "non-colliding email change allowed" test does not assert old-entry cleanup.

**PASETO v2.local** deviation (no v4 gem; same XChaCha20-Poly1305 AEAD) stands, accepted.

## Saved workflows / resume

- Phase 1: `.claude/workflows/familia-admin-phase1.js` (`Workflow({name:"familia-admin-phase1"})`).
- Phase 2: `Workflow({name:"familia-admin-phase2"})`. Run ID `wf_8d1b2fcb-b84`; script at
  `…/workflows/scripts/familia-admin-phase2-wf_8d1b2fcb-b84.js`. Shape: serial test-author (shared Valkey
  can't take concurrent `try`; `ruby -c` can't validate Tryouts comment-expectations) → 2 parallel disjoint
  fixers (backend Ruby suite / frontend node test) → serial adversarial verify. Browser smoke driven manually
  after.
- Phase 3: run ID `wf_6793c184-546`; script at `…/workflows/scripts/familia-admin-phase3-security-wf_6793c184-546.js`.
  Shape: **read-only** parallel (no Valkey, no edits) — `pipeline(5 lenses → per-finding skeptic → ) ` then a
  gate-synthesis agent. Each skeptic MUST cite `../familia`/`../otto` source or flag `needs_live_probe`. The
  live repro + fixes were done **serially in the main loop** after (shared Valkey), then the gate was proven
  RED-pre-fix via `git stash`. Not saved as a named workflow.
- Pattern carried forward: phased, single-owner-per-file, fixers may not edit `try/` (no cheating), each fixer
  has a `test-looks-wrong` escape hatch, bug root-causes confirmed against Familia source before asserting.

## Follow-ups surfaced by the browser smoke (frontend prototype; OUT of the 7-bug scope)

The adapter + backend + integrity feature all work. These are React-prototype display/contract gaps in
`resources/01-designs` (not adapter/backend bugs) — record for a Phase-2.5 / UI polish pass:
- **Create form omits custid → 400.** The New Customer form treats custid as "server-assigned", but
  `Customer`'s identifier is a CLIENT-supplied `custid`, so create returns 400 `"No identifier for Customer"`,
  and the UI then shows an OPTIMISTIC row that isn't in the backend. Fix = a custid input in the form (or a
  server-generated identifier). Server create works given a custid (curl-verified: 200, timestamps stamped).
- **Repair console may render canned numbers.** The browser agent reported the IntegrityConsole showing
  "Healthy / 11 writes / 2 phantoms removed" that looked preview/fixture-derived rather than from the SSE
  `done.summary`. Observed on polluted data; re-confirm on clean data and wire the display to the real stream
  summary if it is indeed canned.
- **Cosmetic:** raw explorer labels a real `DBSIZE` result "SIMULATED" though the server returns
  `simulated:false`.

## ⚠️ `rake db:seed` does NOT flush — it layers

`rake db:seed` is additive (create/update), so re-running it over a keyspace that held a DIFFERENT data shape
(e.g. after the try-suite's flush+seed, or older seeds) leaves STALE keys that `health_check`'s keyspace scan
chokes on (raises `Familia::NoIdentifier` from the deserialize-issue logger). That polluted state is what made
the browser smoke see `healthy:false`. To get a clean integrity demo, FLUSH FIRST:
```
bundle exec ruby -Ilib -e 'require "familia/admin/boot"; Familia::Admin::Boot.setup!(Dir.pwd); Familia.dbclient.flushdb; Session.dbclient.flushdb'
bundle exec rake db:seed
```
(Worth making `db:seed` flush-first, or adding a `db:reset` task.)

## Deferred / noted (not blockers)

- Dead code: `HARD_DENY_COMMANDS` + `actor_permission?` in `api.rb` (post-bug-4).
- `stream_commands` live capture needs `Familia.enable_database_counter` / `DatabaseCommandCounter`.
- Instrumentation `on_command` closure leak (no unregister hook); `Admin::MCP` route-load noise.
- Contract-test coverage gap: `reset_and_seed!` seeds bare-ish records; the integrity tests don't exercise a
  keyspace with leftover/stale entries. Clean `health_check` passes either way, but a stale-entry resilience
  test would have caught the pollution confusion faster.
