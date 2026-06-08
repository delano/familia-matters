# Familia Admin: Three Implementations Compared

*Discovery pass, 2026-06-08. A side-by-side reading of three independent attempts
at the same plan, none of which had seen the others when written.*

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
- **in-progress** also leaves the seam untouched, which is consistent with its
  stage (foundation only).

### Surprise 2: only the unfinished one kept the decided auth scheme

The plan marks PASETO bearer tokens as DECIDED. The result inverts expectation:

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

## Per-axis comparison

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

## Source references

- Plan: `~/.claude/plans/we-want-to-bring-stateful-engelbart.md`
- in-progress: `lib/familia/admin/{api,auth,audit_log,boot,descriptor}.rb`, `config.ru`
- clever-thompson: `lib/familia/admin/{api,token_strategy,audit_log,streaming,raw_command,openapi}.rb`, `config.ru`, `try/`, `pack/prototype/backend-client.js`
- blissful-pascal: `lib/familia/admin/{api,auth,audit_log,app,boot,security,seed,migrations,raw,streaming}.rb`, `config.ru`, `web/src/backend/familia-backend.js`, `try/`
