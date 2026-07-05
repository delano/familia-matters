# AGENTS.md

_Updated: 2026-06-13_

## Discovery: Familia Admin

A model-aware Redis/Valkey admin: a Vite + React + TypeScript SPA frontend over a
runnable Otto (Rack 3) Ruby backend, both driven by one introspection contract.
The frontend builds itself from the backend's `/_meta` descriptor — no per-model
scaffolding, no generated code. Dense, keyboard-first, dark-first operator tool.

### Layout

- **`src/`** — the SPA, the *entire* frontend. React 19 + TypeScript, built by Vite
  (`pnpm build` → `dist/`, which the backend serves at `/login` and the
  cookie-gated web root; `pnpm dev` runs it on Vite's port and proxies `/admin/api`
  to the Ruby backend). It has the auth gate (`App.tsx`), a dependency-free hash
  router, a `useResource`/`useMutation` data layer over a typed REST client
  (`src/api/client.ts`), an EventSource helper for the repair stream
  (`src/api/sse.ts`), the shared `ErrorState`, the `/_meta` descriptor types
  (`src/data/descriptor.ts`), and five screens under
  `src/screens/{records,models,integrity,migrations,explorer}/`. Each screen owns
  its own subtree; the route table is `src/screens/index.tsx`.
- **`lib/familia/admin/`** — the runnable backend. `api.rb` (the Otto controller),
  `descriptor.rb` (DB-free reflection → `/_meta`), `rack_app.rb` (the HTTP stack:
  OriginGuard → ReadOnlyGuard → Otto + static SPA), plus `auth.rb`, `sessions.rb`,
  `passphrase.rb`, `rate_limit.rb`, `read_only_guard.rb`, `origin_guard.rb`,
  `audit_log.rb`, `boot.rb`. `config.ru` + `config/puma.rb` boot it.
- **`resources/00-assets/`** — the contract layer (below).
- **`resources/archive/01-designs/`** — the retired Claude Design prototype, kept
  as historical design reference only (see its `ARCHIVE.md`). Not built, not
  served — the SPA replaced it (#23 / T7).

### Contract layer (`resources/00-assets/`) — the source of truth both ends honor

- `routes.txt`: the Otto route map (HTTP), grouped
  Auth/Discovery/Records/Collections/Query/Integrity/Migrations/Audit/Raw/Streams.
  Encodes auth tiers (`role:admin` vs `permission:{reveal_secrets,repair,run_migrations,raw_command}`)
  and `csrf=exempt` on mutations. T6 added `GET /admin/api/audit` (the
  operator-facing audit-trail view) and the ReadOnlyGuard: production defaults to
  read-only, refusing mutating methods `403 read_only` unless
  `FAMILIA_ADMIN_READ_ONLY=off`.
- `lib/familia/admin/{descriptor,api}.rb`: reference copies of the backend's
  descriptor + controller. The *runnable* ones live under the top-level `lib/`;
  treat top-level `lib/` as authoritative when they diverge.
- `fixtures/models.rb`: three worked models (`Customer` rich/encrypted/indexed,
  `Session` on `logical_database 1`, `ApiKey` participation) the rest derives from.
- `fixtures/*.sample.json` + `stream_repair.sample.jsonl`: contract-shaped payloads
  (descriptor, records, health_check, migrations, repair stream). `fixtures/README.md`
  documents two subtleties (index-backing structures leak into reflection;
  sorted-set score representation).
- `design-tokens.css`, `design-system-notes.md`: Otto-derived tokens at operator
  density, dark-first. The SPA copies the tokens it needs into `src/styles.css`
  (it does not load `resources/` CSS at runtime).

### Architecture

One contract, REST transport. `Descriptor.app` emits `/_meta`; the SPA reflects it
at runtime and builds every screen from it (the model list, identifiers, fields,
indexes, collections, index queries) — nothing is generated or hand-synced. Reads
and writes go over same-origin `fetch` to Otto `/admin/api/*` with the HttpOnly
session cookie riding along; the integrity console consumes a server-sent-events
stream for live repair progress.

```
Descriptor.app ──emits──▶ /_meta ──▶ SPA (src/) builds itself (no generated frontend)
SPA ──fetch /admin/api/* (cookie, same-origin)──▶ Otto ──▶ Admin::API ──▶ Familia (Redis/Valkey)
                       └── GET /admin/api/stream/repair/:model ──▶ SSE repair progress
```

Auth model: Otto enforces the tier from `routes.txt` *before* the controller runs;
`Admin::API` reads the authenticated actor from `env['otto.strategy_result']` and
assumes the gate passed. Elevated actions (`reveal`, `repair`, migrations,
`raw.command`) are audited via `audit!`. The 401/403 split is load-bearing in the
SPA: 401 mid-session opens the reauth overlay (the app stays mounted, location
preserved); 403 is reported without logging out.

### Dependencies

- **Frontend**: React 19 + ReactDOM, Vite 8, Vitest, all via pnpm — no CDN, no
  in-browser Babel. The client reads/writes no token or cookie (no localStorage,
  no `document.cookie`); the session is an HttpOnly cookie carried automatically by
  same-origin requests.
- **Backend**: Familia 2.10.1 (the Redis/Valkey object layer), Otto (Rack 3
  routing/auth/CSRF). Needs Valkey/Redis on `127.0.0.1:6379`. Familia and Otto
  source repos live as siblings at `../`.

### Observations

- **The descriptor is the architecture.** The frontend reflects `/_meta` at
  runtime, so new models need zero scaffolding.
- **Honesty over fabrication.** There are no offline mirrors and no seed data
  anywhere in the SPA — a failed, empty, or refused response renders an explicit
  `ErrorState` or honest "unavailable" state, never anything an operator could
  mistake for live data. `count_fast` is flagged O(1)-but-phantom-prone (the
  integrity screen reconciles it against a SCAN count); encrypted → `[CONCEALED]`,
  transient omitted, plaintext only via audited single-field reveal; migrations
  with no runner render an explicit "no runner" state; the raw command console is a
  read-only allowlist with **no** escalation/force.
- **The repair stream never reconnects.** `src/api/sse.ts` closes the EventSource
  on every terminal condition (done / named error / connection error /
  unparseable), because each reconnect would re-audit and re-run the repair
  server-side.

### Validate

- Frontend: `pnpm install --frozen-lockfile` then `pnpm typecheck && pnpm test && pnpm build`.
- Backend: `bundle exec try --agent try/` (the contract, security, and login-gate
  suites). CI runs both, across Node 22/24 and Ruby 3.3/3.4/4.0.
