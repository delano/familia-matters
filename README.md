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
      ├── Otto routes (plain text: auth=, response=json, csrf=)
      │     └── JSON admin API (generic, introspection-driven)
      ├── Descriptor    -> reflects Familia.members into a UI contract
      ├── API controller-> read / integrity / migration / raw actions
      └── Integrity + Migration services -> Familia's audit/repair + migration runner
```

The frontend is not generated. The backend emits a self-describing descriptor
(`GET /admin/api/_meta`) and the UI builds itself from it. The admin surface is
plain REST, so the same contract a human's browser drives is scriptable from
`curl` or CI with a Bearer token. (An agent-drivable MCP projection over this
contract was an early aspiration but was never built; the routes T5 removed
never existed. Whether to build one is an open decision — see the functional
spec, R-PLAT-3.)

## What is in this repo

### docs/

**Start with [`docs/familia-admin-functional-spec.md`](docs/familia-admin-functional-spec.md)**
— the anchor document: the problem restated, the clarified product definition,
the full requirement inventory (`R-…` IDs new issues should cite), and the
roadmap. The rest are design docs and decision records: `docs/early-designs/`
(the full UI design study and datasheets, the UX brief, and the
production-hardening plan/ticket template), `docs/features/` (the integrity
console spec, the auth-UI spec, and feature issues), and `docs/adr/`
(architecture decision records).

### resources/00-assets/

| Path | Role |
|---|---|
| `design-tokens.css` | the design system (Otto tokens + admin density + dark theme) |
| `routes.txt` | Otto route file: the full HTTP endpoint map |
| `lib/familia/admin/descriptor.rb` | reflects models into the `/_meta` descriptor (DB-free) |
| `lib/familia/admin/api.rb` | the controller wiring routes to Familia |
| `fixtures/` | worked models, sample payloads, and the contract shapes (the shared truth both ends honor; back the contract tests) |
| `prototype/backend-simulator.md` | historical: the system prompt that drove the archived prototype's simulator backend |

### resources/archive/

`resources/archive/01-designs/` is the original Claude Design prototype (per-screen
JSX, HTML shells, the simulator transport, and the extracted design system),
retired and kept only as historical design reference — the SPA under `src/`
replaced it (#23 / T7). See `resources/archive/01-designs/ARCHIVE.md`. The full UI
design study and datasheets are in `docs/early-designs/familia-admin-ui-design.md`.

## Running locally

For first-time setup, `./install-dev.sh` installs dependencies, generates a
git-ignored `.env` with a login passphrase, and copies the Procfile into
place (idempotent; safe to re-run).

Development is two processes plus Valkey/Redis on `127.0.0.1:6379`:

```bash
# terminal 1 — the Ruby backend (:9292)
FAMILIA_ADMIN_PASSPHRASE='correct horse battery staple' bundle exec rackup

# terminal 2 — the Vite dev server (proxies /admin/api to :9292)
pnpm dev
```

Or run both under one process manager: copy `Procfile.example` to `Procfile`
(or `Procfile.dev`, both git-ignored) and start it with
[overmind](https://github.com/DarthSim/overmind) or
[hivemind](https://github.com/DarthSim/hivemind). The passphrase can live in a
git-ignored `.env` file, which both managers load automatically. The comments
in `Procfile.example` cover the gotchas — most importantly that an unset
passphrase makes every login fail with a generic "Authentication failed" while
the server otherwise boots and runs normally.

## Admin your own application's models

The admin is introspection-driven: every screen (and the SPA itself) builds from
the models registered in `Familia.members` at runtime via `GET /admin/api/_meta`,
so pointing it at your own application is the whole job — no per-model
scaffolding, no frontend change. Out of the box the standalone server loads three
demo fixtures (`Customer`/`Session`/`ApiKey`); two env vars replace them with your
application's models. (Dev examples use `rackup`; production boots with `puma` —
see "Deploying to production".)

### The app owns its Familia config — `FAMILIA_ADMIN_APP` (recommended for a real app)

A real application (e.g. OneTimeSecret) already configures Familia — the
connection URI, the encryption keys, the key version — and registers its own
`Familia::Horreum` models when its code loads. Point `FAMILIA_ADMIN_APP` at the
require target(s) that do that:

```bash
FAMILIA_ADMIN_APP=/path/to/onetimesecret/lib/onetime \
FAMILIA_ADMIN_PASSPHRASE='your shared admin passphrase' \
  bundle exec rackup
```

`config.ru` requires those targets, then runs the **embedded** boot path: the
admin *asserts* the app's Familia configuration and never overwrites it, so the
app's own keys decrypt its real encrypted fields and no admin mistake can clobber
live key material. The demo fixtures are never loaded.

**Run it under the host app's bundle.** The admin requires your application's
code, so Familia/Otto and your app's other dependencies must resolve to *your*
versions, not the admin's — run the process with `BUNDLE_GEMFILE` pointed at the
host app's `Gemfile` (with the admin available as a dependency or on the load
path). A separate-process deployment that loads the host's classes this way is
exactly what the embedded path (`setup_embedded!`) is built for. A worked example
is in [`examples/onetimesecret-config.ru`](examples/onetimesecret-config.ru).

### You have model files, the admin owns the config — `FAMILIA_ADMIN_MODELS`

When you have model definitions but no app boot that configures Familia, load the
files directly and let the admin own the connection + encryption:

```bash
FAMILIA_URI=redis://127.0.0.1:6379 \
FAMILIA_ADMIN_ENCRYPTION_KEY=<your app's base64 32-byte key> \
FAMILIA_ADMIN_MODELS='/path/to/app/models/*.rb' \
FAMILIA_ADMIN_PASSPHRASE='your shared admin passphrase' \
  bundle exec rackup
```

Each entry is a file, a directory (every `*.rb` under it, sorted), a glob, or a
`$LOAD_PATH`/gem name; separate multiple entries with commas. To reveal real
encrypted fields you must supply the *same* `FAMILIA_ADMIN_ENCRYPTION_KEY` the app
wrote them with — otherwise reveal returns garbage.

### Either way

The admin's authentication (the shared passphrase + PASETO session) is its own,
independent of the application being administered, and the raw Explorer console
stays a read-only allowlist regardless of which models are loaded.

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

### Operator attribution

The admin tool authenticates with **one shared passphrase**. A successful
login mints the session under a single subject claim — `admin` by default,
or whatever `FAMILIA_ADMIN_SESSION_SUBJECT` is set to — and that subject is
written verbatim into the `actor` field of every audit entry (see
`lib/familia/admin/audit_log.rb`). So the audit trail records **`actor:
"admin"` for every operator**: it proves *that* an authenticated session
performed an action, not *who* the human behind it was. Treating the `actor`
field as a verified individual identity would be a mistake — it is the shared
principal, not a person.

Attribution of who actually performed a given action is therefore a
**process control, not a technical control**. To attribute an audit entry to
an individual, correlate it against the SSH/jumphost session logs:

1. Read the audit entry's timestamp (`at`) and `action` — from
   `GET /admin/api/audit`, or `redis-cli` against the audit sink.
2. Operators reach the tool only through the SSH tunnel, and SSH is reachable
   only over VPN via the jumphost (see "SSH tunnel" above). The jumphost and
   prod-host SSH logs record which keyed individual held the session at that
   wall-clock time.
3. Match the audit entry's timestamp + action to the SSH/jumphost session that
   was open against the admin port (default `9292`) at that moment. That
   individual — identified by their SSH key on the jumphost — is the operator
   accountable for the action.

**Limitation (accepted, documented).** This correlation is the *only*
attribution mechanism: the tool itself cannot distinguish two operators who
both hold the shared passphrase — in the audit trail they are indistinguishable,
both recorded as the shared `actor` principal (`"admin"` /
`FAMILIA_ADMIN_SESSION_SUBJECT`). Attribution depends entirely on the integrity
and retention of the SSH/jumphost logs and on those logs and the audit trail
sharing a common clock. There is no in-tool capture of operator identity by
design — the alternatives (an honor-system login-name field, or per-operator
tokens) were considered and not adopted; see issue #24.

**Process owner: @delano.** The owner is accountable for ensuring SSH/jumphost
audit logging is enabled, retained at least as long as the audit trail
(`FAMILIA_ADMIN_AUDIT_LIMIT`), and time-synchronised with the admin host, and
for running the correlation when an audit entry must be attributed to a person.

### Environment variable reference

Every `FAMILIA_ADMIN_*` variable, its default, and what it does. Production
values belong in the systemd `EnvironmentFile` (`/etc/familia-admin/env`),
never in the unit file.

| Variable | Default | Effect |
|---|---|---|
| `FAMILIA_ADMIN_APP` | unset | Comma-separated require targets (file/dir/glob/`$LOAD_PATH` name) for the application whose models the admin manages. Requiring them must configure Familia (connection + encryption) and register the app's `Horreum` models; the admin then runs the embedded path — it *asserts* that config and never overwrites it. Unset ⇒ the bundled demo fixtures. Mutually exclusive with `FAMILIA_ADMIN_MODELS`. See "Admin your own application's models". |
| `FAMILIA_ADMIN_MODELS` | unset | Comma-separated model sources (file/dir/glob) loaded under the **admin-owned** standalone config (the admin supplies the connection via `FAMILIA_URI` and encryption via `FAMILIA_ADMIN_ENCRYPTION_KEY`). For model-only sources that do not configure Familia themselves. |
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

The Vite + React + TypeScript SPA under `src/` is the entire frontend, and all
five screens are live: Records, Models, the Integrity console, Migrations, and
the raw Explorer. Each builds itself from the backend contract — the `/_meta`
descriptor and the integrity/migration/raw endpoints — and renders explicit error
and honest "unavailable" states on failure, never seed data. The Ruby backend
(`lib/familia/admin/api.rb`) implements the full surface against the verified
Familia 2.10.1 API: record CRUD, audited single-field reveal, collection
mutation, indexed query, integrity health-check and repair (with live repair
progress streamed over server-sent events), migration status/drift/run/rollback,
the raw explorer (SCAN paging, typed value inspect, server info, and an
allowlisted read-only command console), and the operator audit trail.

## The seam is closed

The SPA speaks REST directly to the Otto `/admin/api/*` endpoints — same-origin,
with the HttpOnly session cookie riding along — so there is no in-browser
simulator and no transport shim. The contract fixtures under
`resources/00-assets/fixtures/` are the shared shapes both ends honor and back the
contract tests. The original Claude Design prototype that once stood in for the
backend is archived under `resources/archive/01-designs/` as historical reference.
