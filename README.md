# familia-admin

A model-aware web admin for applications built on **[Familia][familia]** — a Ruby
object layer over Redis/Valkey — served via the **[Otto][otto]** framework.

It reflects your Familia models and gives operators typed CRUD, an **integrity
console** (fsck for the object graph: phantoms, missing, stale/orphaned indexes,
cross-reference drift, with dry-run → repair), **migrations** (status, schema
drift, run, rollback), a guarded **raw key explorer**, and **live SSE streams**.
The descriptor *is* the frontend's source of truth.

This repository is the real backend (Ruby ≥ 3.2, Familia 2.10.1, Otto 2.1.0,
Rack 3) plus the operator-console UI under [`web/`](web/). It grew out of a
design prototype whose in-browser LLM "backend" simulator is replaced here by
the actual Otto/Familia implementation.

## Architecture

```
routes (plain text)         Otto maps each line to an Admin::API action + auth tier
  └─ Admin::API             lib/familia/admin/api.rb — the controller
       ├─ Descriptor        pure reflection of the loaded models (no DB reads)
       ├─ Serializers       record / collection / AuditReport → frontend shapes
       ├─ Auth              bearer-token strategy + Principal (role/permissions)
       ├─ AuditLog          append-only Redis Stream (XADD)
       ├─ Raw               SCAN listing + key inspect + command allowlist
       ├─ Streaming         Rack 3 SSE bodies (repair progress, command feed)
       └─ Migrations        adapter over Familia::Migration::Runner / Registry
```

- **Reads & integrity & migrations** run against Familia's verified 2.10.1 API
  (`health_check`, `repair_all!`, `index_descriptors`, `Migration::Runner`, …).
- **Mutations** (create/update/destroy/collection ops) are atomic, create-only
  where appropriate, and mass-assignment-safe.
- The gem's `AuditReport#to_h` returns *counts*; the console needs the
  *identifier arrays* + a summary, so `Serializers.audit_report` projects the
  report's raw attributes into the contract shape.

## Quickstart

Requires Ruby 3.2+ and a Redis/Valkey server.

```bash
redis-server --daemonize yes            # or point FAMILIA_URI at your instance
bundle install
cp .env.example .env                    # set FAMILIA_ENCRYPTION_KEY, ADMIN_TOKENS, …

bin/seed                                # demo data + integrity drift + migrations
bin/server                              # Puma on http://127.0.0.1:9292
bin/test                                # the Tryouts contract + security suite
```

Then, with the dev token:

```bash
curl -s -H 'Authorization: Bearer dev-admin-token' \
  http://127.0.0.1:9292/admin/api/integrity/customer | jq .
```

## API surface (`routes`)

| Method | Path | Action | Auth tier |
| --- | --- | --- | --- |
| GET | `/admin/api/_meta` | descriptor (source of truth) | role:admin |
| GET | `/admin/api/models/:model` | model descriptor | role:admin |
| GET/POST | `/admin/api/models/:model/records` | list / create | role:admin |
| GET/PUT/DELETE | `…/records/:id` | read / update / destroy | role:admin |
| POST | `…/records/:id/reveal/:field` | reveal one encrypted field | **permission:reveal_secrets** |
| GET/POST | `…/records/:id/:collection` | read / mutate a DataType | role:admin |
| GET | `…/index/:index` | indexed lookup | role:admin |
| GET | `/admin/api/integrity/:model` | health check (audit report) | role:admin |
| POST | `/admin/api/integrity/:model/repair` | dry-run / apply | **permission:repair** |
| GET | `/admin/api/migrations[/drift]` | status / schema drift | role:admin |
| POST | `/admin/api/migrations/run\|rollback` | run / rollback | **permission:run_migrations** |
| GET | `/admin/api/raw/keys\|key\|info` | SCAN / inspect / INFO | role:admin |
| POST | `/admin/api/raw/command` | allowlisted read command | **permission:raw_command** |
| GET | `/admin/api/stream/repair/:model` | repair progress (SSE) | permission:repair |
| GET | `/admin/api/stream/commands` | live command feed (SSE) | role:admin |
| GET | `/admin/api/audit` | append-only admin trail | role:admin |

## Auth

Bearer-token, two layers (see [SECURITY.md](SECURITY.md)): the Otto strategy
authenticates the token and requires the `admin` role for every route (401
otherwise); elevated actions re-check the specific permission tier in the
controller and return `403 {error:'forbidden', required_tier, held}`. Tokens are
configured via `ENV['ADMIN_TOKENS']` and stored only as SHA-256 digests.

## Security

A full security pass on **reveal gating**, the **raw-command allowlist**,
**CSRF**, and the **audit trail** — including the decision to use bearer-token +
Origin-allowlist CSRF defense rather than Otto's cookie-based CSRF — is written
up in [SECURITY.md](SECURITY.md) and exercised by `try/security_try.rb`.

## Tests

`bin/test` runs the [Tryouts][tryouts] suite under `try/`, which boots the app
against an isolated test database, seeds it, and asserts that **live responses
match the shapes in `fixtures/*.json`** (the contract the prototype consumed),
plus the security behaviours. 57 tests across 8 files.

## Layout

```
lib/familia/admin/   the backend (api, descriptor, serializers, auth, audit_log,
                     raw, streaming, migrations, security, boot, app)
routes               Otto route table (HTTP + auth tiers + MCP, commented)
examples/            demo models.rb + migrations.rb the admin reflects/runs
fixtures/            the JSON/JSONL contract fixtures (also the test targets)
try/                 Tryouts contract + security suite
config.ru  bin/      Rack entry point + seed/server/test/console scripts
web/                 the operator-console SPA (design implementation)
docs/                the original design handoff + specs
SECURITY.md          the security pass
```

[familia]: https://github.com/delano/familia
[otto]: https://github.com/delano/otto
[tryouts]: https://github.com/delano/tryouts
