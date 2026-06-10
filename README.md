# Familia Admin

A model-aware web admin for applications built on [Familia](https://github.com/delano/familia)
(a Ruby object layer over Redis/Valkey), served via [Otto](https://github.com/delano/otto).

## What it is

Familia Admin browses, edits, audits, and migrates Familia models over
Redis/Valkey. Unlike generic Redis GUIs, which show raw keys and values, it
understands that a key is a `Customer` record with typed fields, encrypted
columns, relationships, and indexes. It is introspection-driven: it derives its
entire surface from the model classes at runtime, so it needs no per-model
scaffolding. It is an operator tool, not a consumer product: dense, keyboard
first, dark first.

## Why it exists

Redis/Valkey has no schema and no referential integrity. The "schema" for a
Familia app lives in the Ruby model classes, and the integrity of the object
graph (instance timelines, unique and multi indexes, participations, cross
references) is maintained in application code, so it can drift. Two consequences
shape this project: a model-aware tool must run with the app's classes loaded (or
read an exported descriptor), and the highest-value feature is surfacing the
application-level integrity the database cannot enforce. That integrity console
is "fsck for the object graph," and no Redis GUI or SQL admin offers it.

## How it works

```
host app (Rack 3)
└── mount Familia::Admin at /admin
      ├── Otto routes (plain text: auth=, response=json, csrf=, MCP/TOOL)
      │     ├── JSON admin API (generic, introspection-driven)
      │     └── /_mcp JSON-RPC 2.0 (agent-drivable)
      ├── Descriptor    -> reflects Familia.members into a UI contract
      ├── API controller-> read / integrity / migration / raw actions
      └── Integrity + Migration services -> Familia's audit/repair + migration runner
```

The frontend is not generated. The backend emits a self-describing descriptor
(`GET /admin/api/_meta`) and the UI builds itself from it. The same routes are
exposed as MCP tools, so an AI agent can run audits and repairs through the same
contract a human uses.

## What is in this repo

### docs/

Design docs (kept alongside the repo): `docs/familia-admin-ui-design.md` (the full
study and datasheets), `docs/familia-admin-ui-ux-brief.md`, `docs/familia-admin-integrity-console-spec.md`,
and `docs/familia-admin-claude-design-handoff.md`.

### resources/00-assets/

| Path | Role |
|---|---|
| `design-tokens.css` | the design system (Otto tokens + admin density + dark theme) |
| `routes.txt` | Otto route file: the full endpoint map (HTTP + MCP) |
| `lib/familia/admin/descriptor.rb` | reflects models into the `/_meta` descriptor (DB-free) |
| `lib/familia/admin/api.rb` | the controller wiring routes to Familia |
| `fixtures/` | worked models, sample payloads, and the contract shapes |
| `prototype/backend-simulator.md` | the single stateful backend the Claude Design prototype runs on |

## resources/01-designs/

From Claude Design, based on the ui design doc and the integrity console spec. The full study and
datasheets are in `docs/` as `docs/familia-admin-ui-design.md`.

## Running locally

Development is two processes plus Valkey/Redis on `127.0.0.1:6379`:

```bash
# terminal 1 — the Ruby backend (:9292)
FAMILIA_ADMIN_PASSPHRASE='correct horse battery staple' bundle exec rackup

# terminal 2 — the Vite dev server (proxies /admin/api to :9292)
npm run dev
```

Or run both under one process manager: copy `Procfile.example` to `Procfile`
(or `Procfile.dev`, both git-ignored) and start it with
[overmind](https://github.com/DarthSim/overmind) or
[hivemind](https://github.com/DarthSim/hivemind). The passphrase can live in a
git-ignored `.env` file, which both managers load automatically. The comments
in `Procfile.example` cover the gotchas — most importantly that an unset
passphrase makes every login fail with a generic "Authentication failed" while
the server otherwise boots and runs normally.

## Status

The design study is complete and a high-fidelity, interactive prototype is built
in Claude Design across the core screens (Integrity Console, Records, Models, with
Migrations and Explorer following), all running on one shared simulator backend
that keeps a single mutable state object, so a repair in one screen reflects in
the counts of another. The Ruby scaffolding implements the read, integrity, and
migration actions against the verified Familia 2.10.1 API; create/update,
collection mutation, the raw explorer, and the streaming endpoints are marked
TODO with correct skeletons.

## The seam (prototype to production)

The prototype's simulator and the real `api.rb` speak the same request envelope
and response shapes (see `resources/00-assets/fixtures/`). Going live is one transport swap: replace
the in-browser `window.familiaBackend` simulator with `fetch()` calls to the Otto
`/admin/api/*` endpoints. The fixtures become contract tests so the two ends
never diverge.
