# Familia Admin — Production Hardening Orchestration Plan (2026-06-12)

The orchestration document for taking Familia Admin from "design study with a
working dev harness" to an internal production tool inside the OneTimeSecret
(OTS) codebase. Every agent ticket inherits this document: read it fully,
pass the GATES below, then execute only your ticket.

Lineage: Phase 0 bootstrap → Phase 1 implement → Phase 2 contract tests →
Phase 3 security pass → auth UI (PR #7) → **this: production hardening**.
Prior orchestration record: `docs/0608-familia-admin-orchestration-handoff.md`.

---

## 1. Deployment context (read this before judging any tradeoff)

The tool ships as part of the OTS codebase and runs as a **separate process,
bound to `127.0.0.1` only**, on the production host. Operators reach it by
SSH tunnel; SSH is reachable only over VPN, and only via a jumphost.

What that changes about the threat model:

- The network perimeter is SSH. Brute force from the network is gone as a
  threat class.
- The threats that REMAIN: (1) drive-by CSRF from an operator's browser
  against the tunnel's local end — OriginGuard + SameSite stay load-bearing,
  do not strip them; (2) other unix users/processes on the prod host hitting
  the loopback port — the passphrase login stays; (3) **operator error
  against production data** — now the dominant daily risk; (4) attribution —
  one shared passphrase means the audit trail says `admin` for everyone.
- Every request arrives as `127.0.0.1`, so anything keyed on client IP
  (the login rate limiter) collapses to one global bucket.

Source analysis behind every ticket below: the production evaluation in this
plan's originating session (backend/API/frontend reviewed as distinct apps).

## 2. State and evidence policy

- **Git is the database.** Tasks are GitHub Issues; work-in-progress is a
  branch per ticket; deliverables are PR diffs; verification is CI runs.
  No agent-local state stores (no SQLite, no scratch files outside `tmp/`).
  Sessions run in ephemeral containers — anything not pushed is lost.
- **Evidence = CI links wherever possible** (`.github/workflows/ci.yml`
  runs on PRs). Pasted output is acceptable only for checks CI cannot run
  (state which check and why).
- One branch per ticket, named `claude/<ticket-slug>`. Do not create PRs
  unless the ticket says to.

## 3. SCOPE

```
IN_SCOPE:
  lib/familia/admin/**       src/**          try/**
  config.ru                  config/**       Gemfile
  resources/00-assets/routes.txt
  resources/01-designs/**    (deletions and Vite-migration moves only)
  docs/**                    .gitignore      README.md
  AGENTS.md                  (T5 + T6 only — keep in sync with the API surface)

NOT_IN_SCOPE:
  Anything outside this repository
  OTS core application files (when run inside the OTS tree)
  lib/models.rb              (dev fixture only — never adapt it for OTS work)
  Gemfile.lock               (changes only via `bundle install`, never by hand)
  resources/00-assets/lib/** (pristine contract snapshot — historical record)
```

OTS integration rule: **all Familia configuration in admin code must be
additive and opt-in.** Admin code that can run inside the OTS process must
never call `Familia.uri=` or overwrite `config.encryption_keys` — the host
app owns both. Clobbering the encryption keys makes `reveal` return garbage
on real customer secrets; that is the single worst failure available here.

## 4. GATES — pass all three before your first edit

### 4a. CONSTANTS

These are tripwires, not form fields. Run each command, compare against
EXPECTED, and obey ON-MISMATCH. Populating a value proves nothing; matching
a pre-declared expectation proves the environment is the one this plan was
written against.

| CONSTANT          | COMMAND                                                                            | EXPECTED   | ON MISMATCH |
|-------------------|------------------------------------------------------------------------------------|------------|-------------|
| FAMILIA_VERSION   | `bundle exec ruby -e 'require "familia"; puts Familia::VERSION'`                   | `2.10.x`   | STOP — every Familia call in `api.rb` is unverified |
| RUBY_MINOR        | `ruby -e 'puts RUBY_VERSION'`                                                       | `>= 3.2`   | STOP — `Queue#pop(timeout:)` busy-spins the SSE loop on older Rubies |
| HAS_ATOMIC_WRITE  | `bundle exec ruby -e 'require "familia"; puts Familia::Horreum.method_defined?(:atomic_write)'` | `true` | STOP — the `update_record` path is invalid |
| HAS_INSTANCES     | `bundle exec ruby -e 'require "familia"; puts Familia::Horreum.respond_to?(:instances)'`        | `true` | STOP — `list_records` silently shows zero records |
| HAS_HEALTH_CHECK  | `bundle exec ruby -e 'require "familia"; puts Familia::Horreum.respond_to?(:health_check)'`     | `true` | STOP — the integrity console has no backend |
| HAS_REPAIR_ALL    | `bundle exec ruby -e 'require "familia"; puts Familia::Horreum.respond_to?(:repair_all!)'`      | `true` | STOP — repair endpoints have no backend |
| SMOKE_BASELINE    | `bundle exec try --agent try/smoke_try.rb; echo "exit=$?"`                          | `exit=0`   | STOP — broken before you started; report, do not "fix" |

OTS-integration constants — required only for T2 and any ticket touching the
host boot path. These run against the OTS checkout, not this repo. If you
cannot determine a value, STOP and ask; do not infer from naming.

| CONSTANT          | HOW TO DETERMINE                                                       | ON FAILURE |
|-------------------|------------------------------------------------------------------------|------------|
| OTS_BOOT_FILE     | The file OTS's `config.ru` requires to configure Familia + load models | STOP |
| OTS_MODELS        | Every `Familia::Horreum` subclass OTS registers (grep its lib/)        | STOP |
| OTS_FAMILIA_VER   | The Familia version OTS's Gemfile.lock pins                            | STOP if < 2.10 |
| OTS_REDIS_DBS     | The `logical_database` each OTS model declares                         | STOP |
| OTS_PUMA_BIND     | What OTS's puma config binds (expect `0.0.0.0` — why admin binds separately) | record actual |

### 4b. BASELINE capture

Before the first edit, run the full validation suite (section 7) and record
every failure verbatim in the ticket. Acceptance is then: **baseline failures
unchanged or fixed, zero new ones.** This prevents two failure modes: burning
the session fixing out-of-scope pre-existing breakage, and a regression being
waved through as "pre-existing".

### 4c. RISK RESTATEMENT

One sentence, written in the ticket before the first edit:

> If this ticket is done wrong, the failure is: ___ , affecting: ___ .

This is the comprehension check. Copying command output is mechanical;
articulating the blast radius is not. Example of a passing answer for T2:
"If boot still clobbers encryption keys inside OTS, `reveal` returns garbage
or permanently breaks decryption of real customer secrets, affecting every
encrypted field in production."

## 5. STOP conditions (all tickets)

Stop and report — do not proceed, do not guess — if:

- You are about to modify a file outside IN_SCOPE.
- Any CONSTANT mismatches, or an OTS constant cannot be determined.
- Your reasoning contains "probably", "should be", "likely", or "I assume"
  about OTS app structure or Familia API availability.
- You are about to delete more than 50 lines of frontend without confirming
  the corresponding screen is fully ported (T7 only).
- A validation command fails for a reason you cannot explain.

## 6. Tickets

Sequencing is by **file ownership**, not by theme. Wave 1 tickets touch
disjoint files and may run in parallel. Wave 2 tickets all write `api.rb` /
`routes.txt` and MUST run serially (each rebases on the previous). Wave 3
is the large interactive ticket and runs last.

### Wave 1 — parallel (disjoint files)

#### T1 — Deployment safety: loopback bind, Ruby pin, deployment doc
- **Files**: `config/puma.rb` (new), `config.ru` (boot note only), `Gemfile`
  (add `ruby '>= 3.2'`), `README.md` (deployment section).
- **Why**: with `RACK_ENV=production`, both `rackup` and `puma` default to
  binding `0.0.0.0` — the "internal-only" tool would listen on all
  interfaces. The bind must live in config, not operator memory.
- **AC1**: `config/puma.rb` exists and binds `tcp://127.0.0.1:<port>`,
  port env-tunable, and never reads a bind host from env (loopback is not
  a tuning knob).
- **AC2**: `Gemfile` pins `ruby '>= 3.2'`; `bundle check` passes.
- **AC3**: README documents the systemd-unit + SSH-tunnel deployment shape
  and states explicitly that the admin process must never share the OTS
  public Puma.

#### T2 — Boot defers to the host app's Familia configuration
- **Files**: `lib/familia/admin/boot.rb`, `try/test_helper.rb`,
  `try/boot_try.rb`.
- **Why**: `Boot.configure_connection!`/`configure_encryption!` overwrite
  `Familia.uri` and the encryption keys. Inside OTS the host app owns both.
- **Design**: split `setup!` into the standalone-dev path (current behavior,
  used by `config.ru`/rake/tests in this repo) and a host-embedded path that
  loads admin code only and asserts — never sets — Familia configuration.
  The split must be explicit (a method or env flag), not inferential.
- **AC1**: a new `try/boot_try.rb` case proves a pre-configured
  `Familia.config.encryption_keys` survives admin boot untouched.
- **AC2**: the standalone dev flow is unchanged — `SMOKE_BASELINE` still
  `exit=0` with no env changes.
- **AC3**: `guard_production_keys!` still fail-closes in non-dev when the
  standalone path is used.

#### T3 — Remove simulator artifacts and dead frontend weight
- **Files**: `resources/01-designs/**` and `.gitignore` only.
- **Remove**: `prototype/seed.js`, `prototype/backend.js`,
  `prototype/SimulatedBadge.js`; the `window.claude` / `createFamiliaBackend`
  / postMessage-answering script block in `Familia Admin.html`; the entire
  `_ds/onetime-secret-design-system-*/` directory (unused, belongs to a
  different product); tracked `.DS_Store` files (and gitignore them).
- **Why**: `backend-client.js` now fetches the real API directly; the
  simulator plumbing is dead code served to production browsers, and the
  stores' offline mirrors (handled in T7, not here) fall back to it.
- **AC1**: `grep -r "createFamiliaBackend\|window.claude\|familia-backend-ping" resources/01-designs/` → no matches.
- **AC2**: screens still load and reach the API through `backend-client.js`
  (manual check via `npm run build:prototypes` + served app, or the node
  adapter test `resources/01-designs/prototype/backend-client.test.mjs`).
- **AC3**: `git ls-files | grep -i ds_store` → empty.

### Wave 2 — serial (every ticket below writes `api.rb` / `routes.txt`; rebase between)

#### T4 — Truth-telling plumbing: shared Util, logging `safe{}`, limiter switch, Secure-cookie fix
- **Files**: `lib/familia/admin/util.rb` (new), `api.rb`, `sessions.rb`,
  `rate_limit.rb`, `try/auth_try.rb` (+ cases).
- **safe{}**: one shared helper that logs (`warn`, tagged, with exception
  class+message) instead of silently returning nil. Replaces the three
  duplicate definitions in `api.rb`/`sessions.rb` and the duplicated
  `body_json`/`json` helpers. `descriptor.rb`'s `safe` may stay quiet by
  design (cacheable `/_meta`) — if so, say so in a comment.
- **Rationale**: an ops tool's job is telling the operator the truth during
  an incident; `safe{}` currently converts unexpected exceptions into
  silently missing fields.
- **Rate limiter**: add `FAMILIA_ADMIN_LOGIN_LIMITER=off` (default ON to
  preserve current behavior; deployment docs set it off for the tunnel).
  Through the tunnel every client is `127.0.0.1`: one fat-fingered teammate
  locks out all operators for 15 minutes, and any local process can DoS the
  login deliberately. Do not delete the limiter or the UI locked states in
  this ticket.
- **Secure cookie**: `Sessions#secure_cookie?` keys off `RACK_ENV`, so
  production + plain-http loopback tunnel ⇒ `Secure` attribute on the
  cookie. Chrome/Firefox accept Secure cookies on loopback http; Safari
  historically does not — login silently loops. Key the flag off the actual
  request (scheme/loopback), with an explicit
  `FAMILIA_ADMIN_COOKIE_SECURE` env override.
- **AC1**: a try case proves a raised reflection error surfaces in stderr
  (logged) while the response still degrades gracefully.
- **AC2**: limiter-off env: 6 failed logins then a correct one → 200.
- **AC3**: secure-cookie try cases updated: production + loopback http ⇒
  no `Secure`; production + https or non-loopback ⇒ `Secure`; env override
  wins in both directions.
- **AC4**: `grep -c "def safe" lib/familia/admin/api.rb lib/familia/admin/sessions.rb` → 0.

#### T5 — API hardening: kill the liars and the dead surface
- **Files**: `api.rb`, `resources/00-assets/routes.txt`, `rack_app.rb`,
  `try/raw_try.rb`, `try/query_try.rb`, `try/streams_try.rb`,
  `resources/01-designs/prototype/backend-client.js` (force key only),
  `AGENTS.md` (route counts + MCP architecture description — this ticket
  removes the surface AGENTS.md documents).
- **Remove the inert `force` param** from `run_command`: the allowlist check
  never consults it; it only flows into audit/response, implying an
  escalation path that does not exist. Drop it from the controller, the
  audit entry, the response, and the client's `raw.command` body.
- **Fix `query_index` forced-empty**: `force=true` on an unindexed field
  currently returns `{forced: true, records: []}` — a fabricated empty
  success an operator will read as "no matching records". Return an explicit
  `{error: 'scan_unavailable'}` (4xx) instead.
- **Remove `stream_commands`**: the `on_command` hook is never unregistered
  (permanent closure accumulation per request), boot never enables command
  capture (the stream emits only heartbeats), and each open stream pins a
  Puma worker for 25 s. Remove route + action; leave `stream_repair`.
- **Remove the MCP/TOOL routes** from `routes.txt` (`Admin::MCP` does not
  exist) and then **remove `silence_stderr`** from `rack_app.rb` — its only
  purpose was hiding the MCP load noise, and it blanket-swallows real boot
  errors.
- **AC1**: `grep force lib/familia/admin/api.rb` → no run_command hits;
  raw_try cases updated and green.
- **AC2**: query_try: unindexed + `force=true` → 4xx `scan_unavailable`.
- **AC3**: `grep -c "stream_commands\|Admin::MCP\|silence_stderr"` across
  `api.rb`, `routes.txt`, `rack_app.rb` → 0; streams_try updated (repair
  stream cases remain, commands cases removed).
- **AC4**: boot emits no stderr noise (the MCP lines are gone, so nothing
  to silence) — assert by booting the test helper and checking stderr.
- **AC5**: `grep -ci "mcp" AGENTS.md` → 0; the AGENTS.md route count
  matches the post-T5 `routes.txt`.

#### T6 — Ops baseline: read-only mode, destroy snapshots, audit surface, TTL env
- **Files**: `lib/familia/admin/read_only_guard.rb` (new), `api.rb`,
  `routes.txt`, `audit_log.rb`, `auth.rb` (TTL env), new try file,
  `README.md` (consolidated env-var reference — T6 is the last ticket
  that introduces one), `AGENTS.md` (route count — this ticket adds the
  audit endpoint).
- **Read-only mode**: a small middleware (OriginGuard-shaped) that 403s
  mutating methods under `/admin/api` with `{error: 'read_only'}` when
  `FAMILIA_ADMIN_READ_ONLY` is on. **Default ON when `RACK_ENV=production`**,
  off in development. Day-to-day browsing of production data must not carry
  destroy/repair live-wires; an operator flips it off deliberately.
- **Destroy snapshots**: `destroy_record` serializes the full record
  (`serialize(rec, full: true)`) into the audit entry before deletion —
  cheap forensics/undo for an irreversible action.
- **Audit surface**: `GET /admin/api/audit?limit=` → `AuditLog.recent`
  (role:admin). Operators currently need `redis-cli` to read their own
  audit trail. Add a retention trim (`ZREMRANGEBYRANK` keeping the newest
  N, env-tunable) applied on write.
- **TTL env**: session TTL (`Auth::DEFAULT_TTL`) becomes env-tunable
  (`FAMILIA_ADMIN_SESSION_TTL`), default unchanged.
- **AC1**: read-only on: `POST .../records` → 403 `read_only`; GETs
  unaffected; off: mutation succeeds. Both as try cases.
- **AC2**: destroy audit entry contains the serialized record (try case
  asserts a field value round-trips).
- **AC3**: `GET /admin/api/audit` returns newest-first entries; requires
  auth (401 bare).
- **AC4**: trim try case: write limit+10 entries, count == limit.
- **AC5**: README gains one env-var table covering every `FAMILIA_ADMIN_*`
  variable introduced through T6 — `LOGIN_LIMITER`, `COOKIE_SECURE`,
  `READ_ONLY`, `SESSION_TTL`, and the audit-retention variable this ticket
  names — each with default and effect. Machine check: each name greps
  non-zero in `README.md`.

### Wave 3 — interactive (run last; human reviews the UI)

#### T7 — Consolidate the frontend into the Vite SPA
- **Files**: `src/**`, `resources/01-designs/**` (migration source),
  `vite.config.ts`, `rack_app.rb` (serve the unified build).
- **Scope** (this is the big one — split into sub-PRs per screen if needed):
  - Port the five screens (records, models, integrity, migrations,
    explorer) into the existing Vite SPA as routes behind the auth gate.
    The iframe-per-screen shell + `Familia Admin.html` existed to host the
    simulator's single instance; with real HTTP that reason is gone.
  - **Remove the offline mirrors** (`window.REC` seeds, `mirror` objects in
    every `store.jsx`): on backend failure they silently answer with
    fabricated seed data. Replace with explicit, unmissable error states.
    An operator acting on fake records during an outage is an
    incident-on-incident.
  - **De-hardcode the records screen**: `records/store.jsx` pins
    `MODEL = 'customer'` and regexes the `customer:(...):object` key
    pattern. Drive model/identifier/fields from `/_meta` — this is the
    difference between an admin for one model and the model-aware tool the
    README promises.
  - **SSE via `EventSource`** for `stream/repair` (current `parseSSE`
    buffers the whole body; progress renders only after completion).
  - Production React (drop `vendor/react.development.js`), one build, and a
    strict same-origin CSP once in-browser Babel is gone.
- **AC1**: every screen reachable as an SPA route behind the auth gate;
  401 mid-session opens the reauth overlay (not a top-window redirect).
- **AC2**: `grep -r "window.REC\|mirror" src/` → no offline-fallback hits;
  killing the backend mid-session produces a visible error state, never
  seed data.
- **AC3**: records screen browses at least two different models driven by
  the descriptor (e.g. `customer` and `session` from the fixtures).
- **AC4**: `npm run typecheck && npm test && npm run build` green; new
  screens have at least smoke-level component tests.

### T8 — Attribution (decision required before implementation)

One shared passphrase ⇒ every audit entry says `actor: "admin"`. For a tool
that reveals customer secrets this is a real hole. **Do not implement until
a human picks an option**:

1. Operator-name field at login, recorded as the token `sub` (honor-system,
   corroborated by SSH/jumphost logs). Cheapest; honest about its trust level.
2. Per-operator Bearer tokens minted via `rake auth:token` for elevated
   actions; browser session stays shared for reads.
3. Accept SSH-log correlation only; document it as a known limitation.

## 7. VALIDATION (project-wide; run for baseline and acceptance)

```
SMOKE:       bundle exec try --agent try/smoke_try.rb
AUTH:        bundle exec try --agent try/auth_try.rb
ALL_TRIES:   bundle exec try --agent try/
TYPECHECK:   npm run typecheck
UNIT:        npm test
BUILD:       npm run build && test -f dist/index.html
SCOPE_FETCH: git fetch origin main && git rev-parse -q --verify origin/main
SCOPE_CHECK: git diff --name-only origin/main...HEAD | grep -vE \
             '^(lib/familia/admin|src|try|config|docs|resources/(00-assets/routes\.txt|01-designs))|^(config\.ru|Gemfile(\.lock)?|README\.md|AGENTS\.md|\.gitignore)$' \
             && echo "SCOPE VIOLATION" && exit 1 || echo "scope ok"
```

Tryouts files encode assertions as `#=>` expectation comments; running them
with plain `ruby` skips every assertion and only catches load errors. Always
use the `try` runner (as CI does — `ALL_TRIES` is CI's exact invocation) so
expectation failures exit non-zero.

`origin/main...HEAD` diffs from the merge base, matching PR intent. Run
SCOPE_FETCH first so the base ref exists — it fails loudly when the fetch
refspec can't create `origin/main` (e.g. single-branch clones). In a shallow
clone (CI default fetch-depth) deepen instead: `git fetch --unshallow origin
main`. Never run SCOPE_CHECK without SCOPE_FETCH: if `git diff` errors, the
empty pipe makes grep "pass" and prints a false `scope ok`.

`Gemfile.lock` is allowlisted because `bundle install` rewrites it as a
normal artifact (T1 does exactly this); hand-edits remain out of scope per
§3. `AGENTS.md` is allowlisted only for the T5/T6 documentation sync.

Requires live Valkey on `127.0.0.1:6379` (the try suite flushes db0/db1 —
never point it at real data).

## 8. Evaluator protocol (cold pass, per ticket)

Run as a **separate agent invocation with a fresh context** after the
implementing agent finishes. Its inputs are exactly three things: the PR
diff, the ticket's acceptance criteria, and this document. Pointedly NOT
the implementer's session transcript or self-summary — those are advocacy
documents.

Prompt shape:

> You are a senior engineer reviewing this diff for production deployment
> inside OneTimeSecret. List everything you would block this PR for,
> ordered by severity. Then verify each acceptance criterion by running its
> command, not by reading the code.

Fix by severity, re-run validations, repeat until the list is empty or
every remaining item is a documented known limitation with an owner.
Machine-checkable gates (SCOPE_CHECK exits 0, baseline diff empty, CI green)
are the floor regardless of what the review prose says.

## 9. Out of scope for this phase (recorded so nobody "helpfully" does them)

- Optimistic concurrency on `update_record` (last-write-wins accepted for a
  small team; revisit if two-operator clobbering actually occurs).
- O(offset) pagination fix (`instances.lazy.drop` → explicit `zrevrange`):
  legitimate, but defer until tested against real OTS data volumes.
- MCP implementation (`Admin::MCP`): removed in T5; re-add when built.
- Per-model capability flags in the descriptor (`can_list`,
  `can_health_check`): wanted for OTS models lacking the instances
  timeline; design alongside the OTS model audit, not before it.
