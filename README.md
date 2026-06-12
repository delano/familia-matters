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

## Deploying to production

Familia Admin runs as a **separate process** on the production host. It must
never share the OTS public Puma: never mount the admin app into the public
server, and never reuse the public server's listener. The public Puma binds
`0.0.0.0`; the admin tool's destroy/repair/reveal surface, guarded by a
single shared passphrase, must never ride along on a public bind.

The listener is pinned in config, not operator memory: `config/puma.rb`
hardcodes `tcp://127.0.0.1:<port>`. Only the port is tunable
(`FAMILIA_ADMIN_PORT`, default `9292`); the bind host is deliberately not an
env var, so no deployment mistake can expose the process beyond loopback.

Production must boot with `bundle exec puma`, **never `rackup`**: rackup
injects its own host/port defaults at Puma's highest config precedence,
which discards the config-file bind and listens on `0.0.0.0:9292` when
`RACK_ENV=production` (verified against rackup 2.3.1 + puma 7.2.1). In
development rackup is fine — its dev default host is localhost.

This rule is enforced, not just documented: rackup's puma handler loads
`config/puma.rb` before clobbering its bind, and that file aborts the boot
when `RACK_ENV=production` and rackup is driving (verified: production
rackup exits 1 with a targeted error; no listener opens). The residual gap
is explicit operator overrides — `puma -b/-p` flags outrank the config
file, and a non-Puma server pointed at `config.ru` never loads it. Those
stay procedural; owner: @delano (deployment runbook).

Operators reach the tool through an SSH tunnel; SSH itself is reachable only
over VPN via the jumphost. The network perimeter is SSH, and the passphrase
login covers the remaining local-process threat on the host.

### systemd unit

Run the admin process under systemd as the OTS app user. Two placeholders
must be substituted before the unit can start — both are deliberately
strings systemd rejects verbatim, so an unedited unit fails loudly instead
of booting the wrong app:

- `<ADMIN_ROOT>` is the directory containing the **admin's** `config/puma.rb`
  and `config.ru` — its final location inside the OTS tree is not settled
  yet and lands with the OTS integration work (plan T2+). Keep both paths
  absolute: relative names resolved against the OTS application root would
  pick up the **host app's** `config/puma.rb` and `config.ru` and boot the
  wrong server.
- `<BUNDLE_BIN>` is the absolute path to `bundle` **as resolved for the
  service user**: `sudo -u ots sh -lc 'command -v bundle'`. systemd does
  not run login shells, so its default `PATH` never includes version-manager
  shims — under rbenv/rvm/chruby, `/usr/bin/env bundle` fails (or worse,
  resolves to a system Ruby that violates the `>= 3.2` pin). Use the shim's
  absolute path (e.g. `/home/ots/.rbenv/shims/bundle`) or the manager's
  exec wrapper.

```ini
# /etc/systemd/system/familia-admin.service
[Unit]
Description=Familia Admin (internal, loopback-only)
After=network.target valkey.service

[Service]
Type=simple
User=ots
WorkingDirectory=<ADMIN_ROOT>
Environment=RACK_ENV=production
# FAMILIA_ADMIN_PASSPHRASE and friends belong in an EnvironmentFile
# readable only by the service user, never in the unit itself.
EnvironmentFile=/etc/familia-admin/env
ExecStart=<BUNDLE_BIN> exec puma -C <ADMIN_ROOT>/config/puma.rb <ADMIN_ROOT>/config.ru
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Do not pass `-b`/`-p`/`-o` flags in the unit: explicit flags override
`config/puma.rb`, and the bind must come from the config file.

### SSH tunnel

```bash
# local machine (VPN + jumphost assumed by your ssh config)
ssh -N -L 9292:127.0.0.1:9292 prod-host

# then browse http://127.0.0.1:9292/  (-> /login)
```

The tunnel's local end is an ordinary loopback port on the operator's
machine, so browser protections (SameSite cookies, the Origin guard) stay
load-bearing — they are the defense against drive-by CSRF from other pages
in the operator's browser.

### Read-only by default in production

With `RACK_ENV=production` the API refuses every state-changing request
(POST/PUT/DELETE/PATCH under `/admin/api`) with `403 {"error":"read_only"}`
unless `FAMILIA_ADMIN_READ_ONLY=off` is set explicitly. Day-to-day browsing
of production data carries no destroy/repair/update live-wires; an operator
flips the switch off deliberately for a maintenance window (EnvironmentFile
edit + service restart) and flips it back after. GET requests are never
affected, and the auth endpoints stay reachable so login works in read-only
mode.

### Environment variable reference

Every `FAMILIA_ADMIN_*` variable, its default, and what it does. Production
values belong in the systemd `EnvironmentFile` (`/etc/familia-admin/env`),
never in the unit file.

| Variable | Default | Effect |
|---|---|---|
| `FAMILIA_ADMIN_PASSPHRASE` | unset | The shared login passphrase (min 16 chars). Unset ⇒ every login fails with a generic error while the server otherwise runs. |
| `FAMILIA_ADMIN_PASETO_KEY` | dev key | base64url 32-byte symmetric key for session tokens (PASETO v2.local). The boot guard refuses to start in non-dev with the dev default. |
| `FAMILIA_ADMIN_ENCRYPTION_KEY` | dev key | Familia field-encryption key — standalone boots only (embedded boots defer to the host app's keys). Same non-dev boot guard. |
| `FAMILIA_ADMIN_PORT` | `9292` | The loopback port `config/puma.rb` binds. The bind host is hardcoded `127.0.0.1` and deliberately not tunable. |
| `FAMILIA_ADMIN_READ_ONLY` | `on` when `RACK_ENV=production`, else `off` | Refuse mutating methods under `/admin/api` with `403 read_only`. `on`/`off` override the default in either direction; GETs and `/admin/api/auth/*` are never blocked. |
| `FAMILIA_ADMIN_SESSION_TTL` | `3600` | Browser session duration in seconds: token expiry and cookie max-age. Non-numeric/zero values fall back to the default. |
| `FAMILIA_ADMIN_AUDIT_LIMIT` | `10000` | Audit-log retention: on every write the sink keeps only the newest N entries (`ZREMRANGEBYRANK`), bounding the key's memory growth. |
| `FAMILIA_ADMIN_LOGIN_LIMITER` | on | `off` disables the per-IP login rate limiter. Set `off` for tunnel deployments: every client arrives as `127.0.0.1`, so one global bucket lets a single fat-fingered teammate (or any local process, deliberately) lock out all operators. |
| `FAMILIA_ADMIN_LOGIN_FAIL_LIMIT` | `5` | Failed login attempts per IP before lockout (when the limiter is on). |
| `FAMILIA_ADMIN_LOGIN_WINDOW` | `900` | Lockout window in seconds (when the limiter is on). |
| `FAMILIA_ADMIN_COOKIE_SECURE` | request-aware | Force the session cookie's `Secure` attribute `true`/`false`. Unset: `Secure` when the request is HTTPS or from a non-loopback client; plain http over the loopback tunnel omits it (Safari drops Secure cookies on loopback http). |
| `FAMILIA_ADMIN_ALLOWED_ORIGINS` | same-origin | Comma-separated `scheme://host[:port]` allowlist for the CSRF OriginGuard on cookie-authenticated mutations. |
| `FAMILIA_ADMIN_SESSION_SUBJECT` | `admin` | The `sub` claim (audit actor) browser logins are minted under. |
| `FAMILIA_ADMIN_SESSION_PERMISSIONS` | all elevated | Comma-separated permission grant for browser sessions (default: `reveal_secrets,repair,run_migrations,raw_command`). Narrow it to de-fang a browser session. |

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
