# Familia Admin: Three Implementations Compared

*Discovery pass, 2026-06-08. A side-by-side reading of three independent attempts
at the same plan, none of which had seen the others when written.*

> **Refresh, 2026-06-08 (later same day).** The in-progress branch has advanced
> well past the "Phase 0 skeleton" this document first described. It is now the
> most complete of the three: the frontend seam is closed, every mutating action
> is implemented, the audit sink is wired, and a full Rack::Test contract suite
> (89 testcases, 0 failing) drives the real controller through Otto + PASETO +
> live Valkey. The original snapshot below is preserved as written; the
> [**Update**](#update--in-progress-refreshed) section after the Headline
> supersedes every in-progress claim, and a [**Recommendation**](#recommendation)
> closes the document. The two rival columns (clever-thompson, blissful-pascal)
> are frozen worktrees and stand exactly as first read.

## What was compared

The plan ([`we-want-to-bring-stateful-engelbart.md`](../../../../.claude/plans/we-want-to-bring-stateful-engelbart.md))
calls for replacing the prototype's in-browser LLM simulator with a real
Otto/Rack 3 backend on Familia 2.10.1 (backed by Valkey), implementing the
controller's outstanding actions, wiring auth and an audit sink, and locking the
fixtures in as contract tests.

Three codebases attempt this:

| Label | Source | Commit |
|---|---|---|
| **in-progress** | `main` working tree (untracked `Gemfile`, `config.ru`, `Rakefile`, `lib/`) | local |
| **clever-thompson** | `origin/claude/clever-thompson-LOqqH` | `8ccc5cf` "Implement familia-admin backend: Otto controller, streaming, audit, security pass" |
| **blissful-pascal** | `origin/claude/blissful-pascal-iQ61Q` | `2b0b4ba` "Implement the real Otto/Familia admin backend" |

The two branches were checked out as worktrees for the reading and left mounted
at `../familia-admin-wt-clever` and `../familia-admin-wt-blissful`. The
in-progress tree is the third attempt mid-flight.

## Headline

All three converge on the **same route contract**. The ~26 `Admin::API#action`
endpoints (discovery, records CRUD, collections, indexed query, integrity,
migrations, raw explorer, streams) are near-identical across the three route
files. The fixtures-as-seam discipline held: each codebase targets the same
RESTful surface and the same Familia read/integrity/migration core.

The divergence is everywhere else: completeness, the auth scheme, audit storage,
whether the frontend was actually connected, and how the app is packaged.

Two findings stand out as genuinely surprising.

### Surprise 1: the most complete backend was never connected to its UI

The plan names a single integration point: `backend-client.js`'s
`request(envelope)`. Swapping its transport from the postMessage/LLM bridge to a
REST/SSE `fetch` adapter is the whole point of the exercise.

- **clever-thompson** has the strongest backend of the three and a full contract
  test suite, yet it left `backend-client.js` on the original postMessage bridge.
  No `fetch`, no bearer header, no `/admin/api` calls. Its UI cannot talk to the
  server it built. The work is a backend-and-tests deliverable; the seam was
  never closed.
- **blissful-pascal** is the only one that closed the seam. It wrote a real
  `web/src/backend/familia-backend.js` that maps every envelope action onto the
  REST API, sends `Authorization: Bearer`, buffers SSE responses into an array
  (matching the plan's client-side buffering decision), and drops the
  client-asserted `tier` from server-bound requests. It also restructured the
  prototype into a proper Vite app under `web/src/`.
- **in-progress** left the seam untouched *at the time of the original reading*.
  **Update:** it has since closed it. `backend-client.js` now does a real
  REST/SSE `fetch`, sends `Authorization: Bearer`, parses `text/event-stream`
  bodies into an array, and drops the client-only `tier` — the same seam
  blissful-pascal closed, reached independently.

### Surprise 2: only the unfinished one kept the decided auth scheme

The plan marks PASETO bearer tokens as DECIDED. The result inverts expectation:

> **Update:** the framing "only the *unfinished* one kept PASETO" no longer
> holds — and inverts a second time. The in-progress branch kept PASETO *and*
> has since become the most complete of the three. So the faithful-to-the-plan
> codebase is now also the most finished one, not the least.

- **in-progress** is the only codebase that actually implements PASETO (via the
  `paseto` gem). It also documents honestly that the gem ships only v2.local, not
  the planned v4.local, and records the version gap as a blocker rather than
  silently substituting a different primitive.
- **clever-thompson** dropped PASETO for a plaintext in-memory ACL
  (`token => {id, role, permissions}`) parsed from an env string.
- **blissful-pascal** dropped PASETO for a registry keyed by the SHA-256 digest
  of the token (so raw tokens are never stored), seeded from `ADMIN_TOKENS` or a
  loud dev default.

Both "completed" branches reached for a simpler opaque-token scheme. Neither flags
the deviation from a plan item that was explicitly settled.

## Update — in-progress, refreshed

*Refreshed against the in-progress tree at `eaa8ba1` plus its uncommitted
working-tree changes to `api.rb` and `boot.rb`. Everything in this section
supersedes the in-progress column elsewhere in the document.*

The in-progress branch independently converged on the synthesis the original
[A synthesis view](#a-synthesis-view) recommended grafting together: it now has
blissful-pascal's frontend wiring and full-stack test discipline **and** its own
PASETO auth — with one verified exception called out below. What changed since
the first reading:

| Axis | Snapshot (first reading) | Now (`eaa8ba1` + working tree) |
|---|---|---|
| Stage | Phase 0 skeleton | most complete of the three |
| `api.rb` size | 327 | 767 |
| Ruby LOC (lib) | ~950 | ~1500 |
| 10 mutating/raw/stream actions | all `not_implemented` | all implemented (only `openapi` is still a stub) |
| Frontend seam | postMessage bridge (untouched) | real REST/SSE `fetch` adapter, `Authorization: Bearer`, SSE→array, `tier` dropped |
| Audit | sink built, `audit!` only `warn`s | **wired and populated** — `audit!` calls `AuditLog.record`; 11 callsites cover create/update/destroy/reveal/mutate_collection/repair/run_migrations/rollback/run_command/stream_commands/stream_repair |
| Tests | none | full `Rack::Test` through Otto + real PASETO + live Valkey; **89 testcases pass, 0 fail** across 10 files |
| Auth | PASETO (v2.local) | unchanged, plus a fail-closed `guard_production_keys!` that refuses to boot a non-development env on the public dev-default PASETO/encryption keys |

Hardening visible in the working-tree diff (not yet committed):

- **Unique-index query leak fixed.** `query_index` previously called
  `each_record` against a class-level unique index, which returns the whole
  backing hashkey and ignores `value:` — leaking every record. It now resolves a
  unique index through the generated `find_by_<field>` finder and keeps
  `each_record` only for multi indexes.
- **Raw explorer hardened to read-only-only.** `run_command` no longer has any
  elevated write path: anything outside the read allowlist is denied regardless
  of `force` or permission, and the denial returns *before* any audit so a
  blocked command leaves no trace it ran. (This closes the audit-erasure and
  data-corruption paths through the raw explorer.)
- **SSE `done.healthy` reconciled** to track the same `report.healthy?` signal
  `GET /integrity/:model` reports, instead of a phase-emptiness fallback that
  diverged on clean data.
- **Server-stamped timestamps.** `create_record`/`update_record` set
  `created_at`/`updated_at` server-side (only for fields the model declares), so
  the client cannot forge them.

### The one verified correctness gap: `update_record` leaves stale index entries

This is the single rigor point the original document called out by name
([`update_record`: correctness on indexed fields](#update_record-correctness-on-indexed-fields)),
so it was checked empirically against live Valkey rather than read from the code
comments. **In-progress has the bug clever-thompson avoided.**

`update_record` applies field changes inside `rec.atomic_write`, and the
line-136 comment assumes index bookkeeping "rides along" with that write. It does
not, for a *changed* indexed field. Observed after changing a seeded customer's
`email` and `status` inside `atomic_write`:

- **unique_index (`email` → `email_lookup`):** `find_by_email(OLD_value)` still
  returns the record. The old index entry is never removed.
- **multi_index (`status` → `status_index`):** the record appears in **both** the
  old bucket and the new bucket.

This is exactly blissful-pascal's behavior, not clever-thompson's. clever-thompson
snapshots the indexed field values before the write and calls `update_all_indexes`
afterward so stale entries are purged; in-progress does neither. On any model with
indexed mutable fields (Customer has both), an admin edit through this path leaves
a queryable stale index — and because the new `query_index` resolves unique
indexes through `find_by_<field>`, a query on the stale old value will return the
record under a key it no longer has. Inline fix, not an architectural one: snapshot
indexed values before `atomic_write`, reconcile after.

### Smaller nits (cleanup, not blockers)

- The working-tree change made `run_command` read-only-only but left the
  surrounding comments (`api.rb:26-28`, `api.rb:393-396`) describing the old
  "`force` + `permission:raw_command` can elevate" model, and `HARD_DENY_COMMANDS`
  (`api.rb:38-41`) is now dead — no code references it.
- `audit_log.rb:20-21` still states "Wiring it into `Admin::API#audit!` is owned
  by a later phase; api.rb is left untouched here." That wiring has happened; the
  comment is stale.

## Per-axis comparison

*The in-progress column below reflects the **original snapshot** and is superseded
by the [Update](#update--in-progress-refreshed) section above.*

| Axis | in-progress | clever-thompson | blissful-pascal |
|---|---|---|---|
| Stage | Phase 0 only | backend + tests | backend + tests + wired SPA |
| Ruby LOC | ~950 | ~2270 | ~2100 |
| `api.rb` size | 327 | 812 | 509 |
| 10 mutating/raw/stream actions | all still `not_implemented` | all implemented | all implemented |
| Otto response style | writes `@res.body = ...to_json` | returns Hash, `Halt` exceptions for short-circuit | returns Hash, `@halt` sentinel |
| Auth | PASETO (v2.local) | in-memory plaintext ACL | SHA-256 digest registry |
| Audit storage | Horreum `class_sorted_set`, **not yet wired** | raw ZSET, monotonic `INCR` score, sensitive-key scrub, pluggable sink | Redis Stream (`XADD`) |
| Frontend seam | postMessage bridge (untouched) | postMessage bridge (untouched) | real `fetch` adapter |
| Tests | none | controller-direct (synthetic `strategy_result`, skips routing/auth) | full `Rack::Test` through Otto, auth, OriginGuard |
| Static/serving | serves live Babel-in-browser prototype | API only (`run otto`) | built-SPA model (`web/dist` + fallback) |
| Notable extras | honest PASETO version-gap note | `openapi` 3.1 doc, raw-command allowlist class, cross-DB repair guard | `OriginGuard` middleware, request validation, `seed.rb`, `Boot`/`App` decomposition |

## Notable per-axis details

### Audit trail: three primitives, all reasoned

Each picked a different store and argued for it.

- **in-progress** uses a Familia `class_sorted_set` scored by epoch timestamp.
  The model exists but `api.rb#audit!` still only `warn`s; the file states wiring
  is a later phase. So the sink is built but not yet connected.
- **clever-thompson** uses a raw Redis sorted set written with `ZADD` only,
  scored by a monotonic `INCR` sequence rather than a second-granularity
  timestamp, so same-second events keep true append order. It adds a
  `SENSITIVE_KEYS` scrub as a backstop and exposes a configurable sink.
- **blissful-pascal** uses a Redis Stream, arguing that append-only,
  individually-immutable, server-id'd entries are the correct primitive for an
  audit trail. This is a deliberate, defensible departure from the plan's
  "sorted set" suggestion.

### `update_record`: correctness on indexed fields

clever-thompson wraps the edit in `atomic_write` and then explicitly reconciles
indexes (it snapshots class-level indexed field values before the write, then
calls `update_all_indexes` so a changed email or status leaves no stale index
entry). blissful-pascal does a plain field assignment plus `rec.save` and an
`updated_at` bump, without index reconciliation. On models with indexed mutable
fields, clever-thompson's path is the safer one.

### Identifier and timestamp handling

blissful-pascal auto-generates a record identifier (a model-derived stub plus
random hex) and stamps `created_at`/`updated_at` on create when absent.
clever-thompson expects the identifier to arrive in the request and does not
auto-stamp. This shows up directly in their `create_record` paths.

### Packaging philosophy

- **in-progress**: one config.ru dispatcher; `/admin/api` and `/_mcp` go to
  Otto, everything else is served statically from the design assets (with `.jsx`
  MIME hacks so the browser will execute the Babel-compiled prototype). It boots
  through a small `Boot` module.
- **clever-thompson**: inline config.ru, no module decomposition, no frontend
  serving at all. Most configuration knobs are exposed via environment
  (`ADMIN_TOKENS`, `ADMIN_RAW_COMMANDS`, `ADMIN_COMMAND_STREAM`).
- **blissful-pascal**: thin config.ru delegating to `Boot.boot!` + `App.build`,
  with `Boot`/`App`/`Security` modules and a built-SPA deployment model that
  serves `web/dist` with an SPA fallback when present.

### Both over-delivered MCP

Both branches built an `mcp.rb` (clever's is the more substantial) even though
the plan marks MCP/`TOOL` route handlers as out of scope. A convergent extra.

## Where they genuinely agree

Beyond the route contract: the same Familia integrity and migration core
(`health_check`, `repair_all!`, `Migration::Runner`), the same `permitted_fields`
mass-assignment guard, the same reveal-once-via-block discipline that records
only metadata to the audit (never the plaintext), the same CSRF reasoning (a
header bearer credential makes `csrf=exempt` correct, so CSRF middleware stays
off), and the same decision to buffer SSE on the client rather than render
incremental progress.

## A synthesis view

- **blissful-pascal** is the only end-to-end runnable result. The UI drives the
  real server.
- **clever-thompson** has the most rigorous backend (atomic index reconciliation,
  OpenAPI emission, a hardened raw-command path, a cross-database repair guard),
  but it is disconnected from its own UI and its tests bypass the auth and
  routing layers.
- **in-progress** is an honest Phase-0 skeleton and the only one faithful to the
  PASETO decision, with the deviation it could not fully satisfy documented
  rather than hidden.

The strongest combined result would graft clever-thompson's `api.rb` rigor and
blissful-pascal's frontend wiring and full-stack tests onto the in-progress
branch's PASETO auth.

> **Update:** that graft has largely already happened *on the in-progress branch
> itself*, independently. It now carries blissful-pascal's frontend wiring and a
> full Rack::Test suite alongside its own PASETO auth. The one piece of
> clever-thompson rigor it did **not** absorb is `update_record`'s index
> reconciliation — see the [Update](#update--in-progress-refreshed) section. The
> "best of all worlds" is now a short list of inline fixes on one branch, not a
> three-way merge.

## Recommendation

**Do not pause for a fresh-agent re-evaluation of the approach. Continue on the
in-progress branch.**

The premise of a handoff — "step back and assemble the best of all worlds" — has
already been satisfied by the in-progress branch's own progress. It is the only
codebase that simultaneously closes the frontend seam, implements the full action
surface, wires and populates the audit trail, keeps the DECIDED PASETO scheme, and
proves all of it with a green contract suite (89 testcases through the real
controller, auth, and Valkey). A fresh agent handed the synthesis goal would spend
its first budget re-deriving this state from three codebases, and the most likely
outcome is a regression of a working, tested branch toward a paper-cleaner merge.
The cost of re-evaluation is real; the upside is now small.

What remains is a short, well-scoped punch list that does **not** need a new
approach — only execution on the current one:

1. **Fix `update_record` index reconciliation** (the one verified correctness
   bug). Adopt clever-thompson's pattern: snapshot indexed field values before
   `atomic_write`, reconcile indexes after. This is the highest-value item and the
   only one that is a true defect.
2. **Commit the working-tree hardening.** The unique-index leak fix, raw
   read-only-only path, SSE health reconciliation, and server-stamped timestamps
   are currently uncommitted in `api.rb`/`boot.rb`.
3. **Clear the stale comments and dead constant** noted above (`run_command`
   comments, `HARD_DENY_COMMANDS`, `audit_log.rb` header).
4. **Decide `openapi`** — implement from `Descriptor.app` or remove the route. It
   is the only `not_implemented` left.
5. **Optional, lower priority:** consider blissful-pascal's `OriginGuard` as
   defense-in-depth. Not a correctness gap — all three branches correctly reason
   that a header bearer credential makes CSRF middleware unnecessary — so this is a
   judgment call, not a blocker.

One caveat worth stating plainly: this recommendation rests on the contract suite
genuinely exercising the surface it claims to. The suite drives the real Otto app
through Rack::Test with live auth, which is the right shape — but it did not catch
the `update_record` stale-index bug (no update-then-query-old-value assertion
exists). Item 1 should land **with** a regression test that updates an indexed
field and asserts the old value no longer resolves. The test gap is narrow, not
systemic.

## Source references

- Plan: `~/.claude/plans/we-want-to-bring-stateful-engelbart.md`
- in-progress: `lib/familia/admin/{api,auth,audit_log,boot,descriptor}.rb`, `lib/models.rb`, `config.ru`, `try/` (10 contract files + `test_helper.rb`), `resources/01-designs/prototype/backend-client.js`
- clever-thompson: `lib/familia/admin/{api,token_strategy,audit_log,streaming,raw_command,openapi}.rb`, `config.ru`, `try/`, `pack/prototype/backend-client.js`
- blissful-pascal: `lib/familia/admin/{api,auth,audit_log,app,boot,security,seed,migrations,raw,streaming}.rb`, `config.ru`, `web/src/backend/familia-backend.js`, `try/`
