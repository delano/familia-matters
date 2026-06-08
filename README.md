# familia-admin

A model-aware web admin **backend** for applications built on
[Familia](https://github.com/delano/familia) (a Ruby object layer over
Redis/Valkey), served through the [Otto](https://github.com/delano/otto)
framework. It is a developer/operator tool: typed CRUD over your Horreum models,
an integrity console (fsck for the object graph), a migration cockpit, a guarded
raw explorer, and live SSE streams — all driven by runtime reflection, so the UI
builds itself from the descriptor.

This repository began as a Claude-Design prototype (under `pack/`) whose
interactions were answered by an **in-browser Claude-API simulator**. That
simulator has been **replaced by the real Otto backend** implemented here. The
two ends speak the same JSON contract (`fixtures/*.json`), so the swap was a
transport change, not a redesign — see [the seam](#the-prototype--production-seam).

## What's here

```
lib/familia/admin/
  api.rb            Otto controller — all actions implemented against Familia
  descriptor.rb     runtime reflection (the frontend's source of truth)
  serializers.rb    record + audit-report + collection contract serializers
  audit_log.rb      append-only audit sink (the headline security primitive)
  raw_command.rb    read-only, default-deny raw-command allowlist
  streaming.rb      Rack 3 streaming bodies (SSE): repair progress + command feed
  openapi.rb        OpenAPI 3.1 generator (derived from the descriptor)
  token_strategy.rb header bearer-token Otto auth strategy
  mcp.rb            agent-drivable MCP/TOOL surface (read + dry-run only)
routes              Otto routes (plain-text endpoint map)
config.ru           the runnable Otto app (Familia config + auth + models)
fixtures/           the contract fixtures + the three worked models
try/                Tryouts contract + security + integration suite (118 tests)
SECURITY.md         the security review (reveal gating, raw allowlist, CSRF, audit)
pack/               the original design pack (now points at the real backend)
```

## The API at a glance

The descriptor is the source of truth: `GET /admin/api/_meta` returns every
model's fields, datatypes, indexes, participations, and actions, and the frontend
builds itself from it. The rest of the surface (see `routes`):

| Area | Endpoints |
|---|---|
| Discovery | `_meta`, `_openapi`, `models`, `models/:model` |
| Records | typed CRUD on `models/:model/records[/:id]`, `reveal/:field` |
| Collections | `…/:id/:collection` (read + native-op mutate) |
| Query | `models/:model/index/:index` (indexed lookups only) |
| Integrity | `integrity/:model` (audit), `…/repair` (dry-run → apply), `_stale_indexes` |
| Migrations | `migrations`, `migrations/drift`, `migrations/run`, `…/rollback` |
| Raw explorer | `raw/keys` (SCAN), `raw/key`, `raw/info`, `raw/command` (allowlisted) |
| Live streams | `stream/commands`, `stream/repair/:model` (Rack 3 SSE) |
| MCP | `MCP /models`, `MCP /integrity`, `TOOL /repair`, `TOOL /run_migration` |

Elevated, audited tiers gate the dangerous actions: `permission:reveal_secrets`,
`:repair`, `:run_migrations`, `:raw_command`. See **SECURITY.md**.

## Run it

Requires Ruby ≥ 3.2 and a running Redis/Valkey.

```bash
gem install familia otto rack rackup webrick tryouts   # or: bundle install
redis-server --daemonize yes

# boot the admin (safe dev defaults; see config.ru for all env vars)
ADMIN_TOKENS="dev-admin=admin:reveal_secrets,repair,run_migrations,raw_command" \
  bin/dev-server        # http://localhost:9292

# call it (header bearer-token auth)
curl -H 'Authorization: Bearer dev-admin' http://localhost:9292/admin/api/_meta
curl -H 'Authorization: Bearer dev-admin' http://localhost:9292/admin/api/integrity/customer
```

Point it at your own models with `ADMIN_MODELS=path/to/models.rb`. The default is
`fixtures/models.rb` (Customer / Session / ApiKey — the three worked models that
exercise every feature: encrypted + transient fields, every DataType, unique +
multi indexes, a participation, TTL, and a second logical database).

### Configuration (environment)

| Var | Default | Purpose |
|---|---|---|
| `FAMILIA_URI` | `redis://127.0.0.1:6379/0` | database connection |
| `FAMILIA_ENCRYPTION_KEY` | *ephemeral dev key* | base64 32-byte key for encrypted fields |
| `ADMIN_MODELS` | `fixtures/models.rb` | your models file |
| `ADMIN_TOKENS` | `dev-admin=…` (all perms) | `token=role:perm,perm; …` bearer ACL |
| `ADMIN_RAW_COMMANDS` | `false` | enable the raw-command runner |
| `ADMIN_COMMAND_STREAM` | `false` | enable the live command feed (adds per-command overhead) |

## Test it

The suite drives the real controller (and the full Otto app) against a real Redis
on a dedicated test database, and asserts the live responses match the shapes the
prototype consumed (`fixtures/*.json`).

```bash
redis-server --daemonize yes
try try/*_try.rb              # 118 tests across 9 files
```

- `*_contract_try.rb` — descriptor, records, collections, integrity, migrations,
  raw explorer: each pinned to the matching fixture shape.
- `security_try.rb` — reveal gating, raw allowlist, CSRF posture, audit trail,
  model-resolution + mass-assignment hardening.
- `streaming_try.rb` — the Rack 3 SSE bodies (repair progress + command feed).
- `integration_try.rb` — the full Otto stack in-process (routing + token auth +
  permission tiers + csrf-exempt + streaming) via `otto.call`.

## The prototype → production seam

The design pack (`pack/`) is a click-through prototype whose backend was an
in-browser Claude-API simulator answering a uniform request envelope
(`{action, model, params, …}`). Because the simulator returned the **exact JSON
shapes** that `lib/familia/admin/*.rb` produce, going to production was a
transport swap:

- **Before:** screen → `backend-client.js` → Claude simulator → JSON
- **After:**  screen → `backend-client.js` → `backend.js` (HTTP) → Otto → JSON

`pack/prototype/backend.js` is now a real HTTP client: it maps each envelope to a
`/admin/api/...` request (bearer token, `fetch`-based SSE for streams) and returns
the same shapes. The shell (`Familia Admin.html`) points at it via
`window.FAMILIA_ADMIN_CONFIG` (`baseUrl` + `token`). No screen changed.

The fixtures are the seam, and `try/` is what keeps the two ends from diverging.

## Status

Implemented and tested against Familia 2.10.1 / Otto 2.1 / Rack 3: every action
in `api.rb` (discovery, CRUD, reveal, collections, query, integrity, repair,
migrations, raw explorer, streams, OpenAPI), the Rack 3 streaming bodies, and the
audit sink. The security pass (SECURITY.md) is complete and gated by tests. See
SECURITY.md's deployment checklist before pointing it at production data.
