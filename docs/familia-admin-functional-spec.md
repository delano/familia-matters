# Familia Admin — Functional Specification

- **Status:** draft for review
- **Owner:** @delano
- **Date:** 2026-07-05
- **Audience:** anyone doing work on this repo (human or agent). New issues and PRs
  should cite the requirement IDs below (`R-…`) so every change traces back to a
  stated goal.

This is the anchor document for the project. The earlier documents remain valid
in their lanes — `docs/early-designs/` is the design vision, `docs/features/` are
per-feature specs, `docs/adr/` are settled decisions — but none of them states
what the product *is now*, what it is *for*, and what happens *next*. This one
does. Where this spec conflicts with an older doc, this spec wins; where it is
silent, the older docs still apply (see §10 for the map).

---

## 1. The problem we are solving

Three layers, from substrate to daily reality:

**1. The substrate has no schema and no integrity.** Redis/Valkey stores keys
and values; it enforces no types, no foreign keys, no uniqueness across keys,
no referential integrity. For an application built on
[Familia](https://github.com/delano/familia), the *schema* lives in Ruby model
classes (`Familia::Horreum` subclasses), and the *integrity* of the object graph
— instance timelines, unique and multi indexes, participations,
cross-references — is maintained by application code at write time. Anything
maintained by convention drifts: crashed processes half-complete writes, old
code versions leave stale formats, ad-hoc `redis-cli` fixes bypass the model
layer entirely. Drift is structural, not exceptional.

**2. No existing tool understands the model layer.** Generic Redis GUIs
(RedisInsight and kin) show raw keys and values — they cannot tell you that
`customer:abc123:object` is a `Customer` with an encrypted `api_secret`, a
unique email index, and a participation in `Organization#customers`, let alone
that its index entry is stale. SQL-era admins (Django admin, ActiveAdmin, Ash
Admin) have the right anatomy — model list, record CRUD, typed forms driven by
declared schema — but do not run over a schemaless store. The gap between them
is exactly where Familia apps live, and the highest-value capability in that
gap is the one nothing else offers: **surfacing and repairing the
application-level integrity the database cannot enforce** — "fsck for the
object graph."

**3. The driving application has real, current maintenance needs.**
OneTimeSecret (OTS) runs ~18 Horreum models in production (Customer, Secret,
Receipt, Organization, CustomDomain, …) with heavy use of Familia features:
encrypted fields, dual object/external identifiers, migration fields, counters,
safe-dump allowlists. Its operators need to, today:

- look up and fix individual records during incidents, without dropping to
  `redis-cli` and hand-editing hashes;
- verify object-graph integrity before and after deploys, and repair drift with
  a preview of what will change;
- run and track data migrations — concretely, the familia 2.10 → 2.11 → 2.12
  upgrade track (encryption salt/personalization rotation, verifiable-identifier
  re-minting; see onetimesecret#3630, familia#333/#334/#335) is exactly the kind
  of staged, reversible, audited data-maintenance work this tool exists for;
- reveal an encrypted value occasionally, with the reveal audited;
- do all of the above against production data where **operator error is the
  dominant daily risk** — so the tool must be honest (never fabricate data),
  deliberate (dry-run before danger), gated (elevated actions behind
  permissions), and audited (every elevated action recorded).

**The one-line problem statement:** *Familia applications carry their schema in
code and their integrity in convention, and no existing tool can inspect,
verify, or repair that object graph — so operators are left doing production
maintenance blind, over `redis-cli`.*

---

## 2. What Familia Admin is (the clarified product)

A model-aware operations console for applications built on Familia, served as a
self-contained Rack app (Otto backend + Vite/React SPA) that derives its entire
surface from the host application's model classes at runtime. It is an
**operator tool, not a consumer product**: dense, keyboard-first, dark-first,
deployed loopback-only behind an SSH tunnel, read-only by default in
production.

Its identity, ranked — when priorities compete, higher wins:

1. **Health and maintenance console.** Integrity checking and repair,
   migrations, schema drift, stale-index detection, the operator audit trail,
   encryption-aware operations. This is the reason the tool exists and the part
   nothing else offers.
2. **Model-aware inspection and surgery.** Browse models and records as typed
   objects, follow indexes, read collections, make individual audited edits.
   This is the daily surface, in service of #1 (incident response, verification).
3. **Raw substrate access.** SCAN-based key browsing, typed key inspection,
   server info, an allowlisted read-only command console. The escape hatch for
   whatever the model layer can't express.

What it is **not**: a general-purpose Redis GUI (RedisInsight exists), a
replacement for the host app's own admin features, a dashboarding/BI tool, a
multi-tenant SaaS, or a place where "convenience" ever outranks honesty about
production data.

### The architectural thesis (settled, load-bearing)

One introspection contract drives everything. The backend reflects
`Familia.members` into a self-describing descriptor (`GET /admin/api/_meta`);
the SPA builds every screen from that descriptor at runtime. No per-model
scaffolding, no code generation, no hand-synced frontend. Pointing the admin at
a new application (`FAMILIA_ADMIN_APP` / `FAMILIA_ADMIN_MODELS`) is the whole
integration. This thesis survived every pivot in the project's history and is
not up for renegotiation.

---

## 3. How we got here, and where "here" is

The project ran hot between 2026-06-06 and 2026-06-14 and passed through three
identities. Understanding them explains both the current shape and the scars.

**Era 1 — Design study + simulated prototype (Jun 6–9).** The full UI design
study, UX brief, and integrity-console spec were written first. Five screens
were prototyped in Claude Design against a *simulator backend that was a system
prompt* — an LLM returning contract-shaped JSON from a shared in-session state
model seeded from fixtures. This was the original plan the team remembers:
structured dummy data to get UI/UX right before writing a backend. It worked —
the contract shapes in `resources/00-assets/fixtures/` and the screen designs
all date from this era.

**Era 2 — The wobble (Jun 8–9).** A real Otto backend was stood up in a day,
then PR #6 reversed course: it deleted a just-created Vite/TS scaffold as
"superseded by the prototype-first approach" and stripped freshly-added backend
guardrails (result caps, collection allowlists, encrypted-field masking, token
expiry) "for the prototype phase." This is the "went off the rails" moment: the
project briefly optimized for prototype velocity at the cost of production
safety, and everything removed had to be re-earned over the following days
(the auth epic #5, PRs #7/#8/#12, and ultimately T5's "kill the liars").

**Era 3 — Salvage by hardening (Jun 10–14).** The production hardening plan
(PR #18) re-scoped the project from "design study with a dev harness" to
"internal production tool for OTS," with a concrete deployment shape (separate
loopback process, SSH tunnel, VPN + jumphost) that changed the threat model:
operator error against production data became the dominant risk. Tickets T1–T8
executed it: loopback-only bind (T1), embedded boot that asserts and never
overwrites the host's Familia config (T2), simulator deletion (T3),
truth-telling plumbing (T4), removal of every lying or dead surface — the fake
`force` param, fabricated empty results, the leaking command stream, the
nonexistent MCP routes (T5), read-only-by-default + destroy snapshots + the
audit API (T6), the full port of all five screens to the production Vite SPA
and the archival of the prototype (T7), and the attribution decision (T8 /
ADR 0003). The "super simplified UI and backend" the team remembers is the
output of this era — and it was the right call: what was simplified away was
almost entirely *fabrication* (offline seed mirrors, fake progress animations,
force buttons with no backing escalation path), not capability.

**Where "here" is (verified against the code, 2026-07-05):**

- The SPA has five live screens (Records, Models, Integrity, Migrations,
  Explorer), all descriptor-driven, all rendering explicit error/unavailable
  states, never seed data. The backend implements the full route surface in
  `resources/00-assets/routes.txt` against Familia 2.10.1.
- The current SPA is a **faithful but austere subset** of the design vision. It
  kept the thesis (descriptor-driven), the spine (dry-run before apply), the
  auth split (401 reauth overlay vs 403 in-place denial), and the hero flow
  (integrity check → dry-run → streamed repair over SSE). It has not yet built
  the vision's connective and operational tissue — see §6 for the itemized gaps.
- **Known drift to correct:** the README still describes an MCP/JSON-RPC
  surface ("`/_mcp` JSON-RPC 2.0", "the same routes are exposed as MCP tools")
  that T5 removed because it never existed. The Gemfile pins familia `~> 2.10`
  (locked 2.10.1) while OTS — the driving app — pins `~> 2.11.1`, and the
  gem's project-wide introspection layer (`Familia.stale_indexes`,
  `IndexDescriptor`) only exists in 2.11+, so the admin's stale-index endpoint
  currently degrades to "introspection unavailable" (§7).
- **Not yet done at all:** actually deploying the admin against OTS. The
  embedded boot path, the worked example (`examples/onetimesecret-config.ru`),
  and the systemd unit exist, but the admin has never been validated against
  OTS's real 18-model surface, and its location inside the OTS tree is
  explicitly "not settled" (README, T2+).
- **Issue hygiene:** #5 (auth epic) and #23 (T7) are open with their work
  merged but final checklists unattested; #9 is open despite being proven a
  false positive; #13 proposes upstreaming the rate limiter into familia;
  dependabot PRs #40/#41 are open.

---

## 4. Users and jobs

| Persona | Jobs to be done | Surfaces |
|---|---|---|
| **App developer / operator** (primary — concretely, the OTS team) | Diagnose and fix a record during an incident; run an integrity check before/after a deploy and repair drift with a preview; run/roll back a data migration; check what the last operator session did | Integrity, Migrations, Records, Audit |
| **Support / ops** | Look up a record by id or indexed field; read its non-secret contents; check status/TTL | Records, Models |
| **Security-sensitive operator** | Reveal one encrypted field with the reveal audited; run a repair; execute a raw read command | Reveal flow, Integrity, Explorer console |
| **AI agent** (future, deliberately deferred) | Run the same audits/repairs through the same contract a human uses | MCP surface — see R-PLAT-3 |

Design center: make the everyday read/inspect path fast and calm; make the
dangerous paths feel deliberate. (Unchanged from the UX brief.)

---

## 5. Principles (settled — carried forward, not up for debate)

These were earned through the project's history and are enforced in code and
process. Every future change is expected to conform.

1. **The descriptor is the architecture.** Screens build from `/_meta` at
   runtime. Adding a model to the host app requires zero admin changes.
2. **Honesty over fabrication.** No seed data, no offline mirrors, no fake
   progress, no affordances that imply capabilities the backend lacks (force
   buttons, escalation toggles). A failed or refused response renders an
   explicit error/unavailable state. "An operator acting on fake records during
   an outage is an incident-on-incident."
3. **Dry-run before danger.** Repairs, migrations, and destroys are reached
   through a preview/apply spine with explicit confirmation. There is no
   one-click destructive path.
4. **Elevated actions are gated and audited.** Reveal, repair, migrations, and
   raw commands sit behind distinct permissions and write audit entries.
   Destroys snapshot the record into the audit trail first.
5. **Read-only by default in production.** Mutations require an explicit,
   deliberate flip (`FAMILIA_ADMIN_READ_ONLY=off`) for a maintenance window.
6. **The network perimeter is SSH.** Loopback-only bind hardcoded in config
   (not an env var), reached through a tunnel; browser protections (SameSite,
   OriginGuard) stay load-bearing against local CSRF.
7. **Embedded boot asserts, never overwrites.** When running against a host
   app, the admin adopts the host's Familia config; clobbering the host's
   encryption keys is the single worst failure available and is structurally
   prevented.
8. **Attribution is a process control.** One shared passphrase, one `actor:
   "admin"` principal; individual attribution happens via SSH/jumphost log
   correlation (ADR 0003). Not revisited unless the operator population grows.
9. **Agent-proof discipline.** Agent-executed work ships with executable
   acceptance criteria and adversarial review; a "done" report without evidence
   is not done (ADR 0002).
10. **The stream never reconnects.** SSE consumers close on every terminal
    condition; a reconnect would re-run the server-side operation.

---

## 6. Functional scope by surface

Legend — each item is one of:

- **[shipped]** implemented and verified today;
- **[R-…]** a numbered requirement: designed intent not yet met, or a gap this
  spec now commits to. These are the units future issues should cite;
- **[ext]** proposed extension, valuable but unscheduled;
- **[out]** explicitly out of scope (with reason).

### 6.1 Discovery & the descriptor

- [shipped] `/_meta` reflects every registered model: fields with categories
  (plain/encrypted/transient/identifier), datatypes, indexes, participations,
  key patterns, TTL policy, safe-dump list, JSON schema, permitted actions.
  Internal `Familia::Admin::*` models are excluded from the surface.
- [shipped] `FAMILIA_ADMIN_APP` (host-owns-config, embedded) and
  `FAMILIA_ADMIN_MODELS` (admin-owns-config, standalone) load real
  applications' models.
- **[R-DESC-1] Validate the descriptor against the full OTS model surface.**
  The demo fixtures are three simple models; OTS has ~18 with heavy feature
  mixins (object_identifier, external_identifier, safe_dump, migration fields,
  counter fields, `through:` participations). Reflect all of them, snapshot the
  descriptor, and fix whatever reflection chokes on or misrepresents. This is
  the cheapest way to de-risk everything else and should happen first.
- **[R-DESC-2] Descriptor version/feature signaling.** The descriptor should
  state which optional capabilities the connected backend actually has
  (stale-index introspection, migration runner present, cross-ref audit
  available) so screens can render "unavailable on this backend" states from
  contract rather than probing errors.

### 6.2 Home / health dashboard (currently a stub — this is the identity gap)

The web root today shows session claims and a demo button. For a tool whose
identity is "health and maintenance console," the landing surface should answer
**"is my data healthy?"** at a glance. This is the highest-leverage unbuilt
screen (UX brief screen #10, previously "optional" — no longer).

- **[R-HOME-1] Fleet health overview.** One row per model: record count
  (fast count, badged approximate), integrity status from the most recent
  health check (healthy / issues / never-checked / checking), stale-index
  flag, TTL policy. Cached last-check results with timestamps — never
  auto-run scans on page load.
- **[R-HOME-2] Recent operator activity.** The latest audit-trail entries
  (action, actor, timestamp, target) inline, linking to the full audit screen
  (R-AUD-1).
- **[R-HOME-3] Server vitals strip.** The subset of `/raw/info` an operator
  checks reflexively: memory, connected clients, keyspace per logical DB,
  uptime. Read-only, no charts for their own sake.

### 6.3 Integrity console (the hero screen)

- [shipped] Per-model health check (`GET /integrity/:model`) rendering the
  full report: instances (phantoms/missing), unique indexes, multi indexes,
  participations, cross-references; `complete: false` renders a
  "reflection incomplete" flag. Dry-run via `POST repair?dry_run=true` with
  planned-write preview; apply streams real per-phase progress over SSE with
  no-reconnect discipline; partial-failure and connection-lost panels;
  permission-aware button gating from session claims.
- **[R-INT-1] Count-mismatch callout.** The timeline-vs-scan count pair with
  delta ("timeline 1,284 · scan 1,282 · 2 phantoms") as a distinct header
  element linking to the phantom list. Spec'd as hero-spec state 5; the data is
  already in the report.
- **[R-INT-2] Drill-down.** Summary chips scroll to and filter their section;
  issue rows link to the offending record (Records deep link, needs R-UX-1)
  and show points-to vs actual context. Today chips are inert and rows link
  nowhere.
- **[R-INT-3] Checking progress.** Health checks on large models are long;
  the gem's `health_check` already emits `{phase, current, total}` progress
  callbacks. Add a check-progress stream (mirroring the repair stream) and
  render phase progress with cancel, replacing the blind spinner (hero-spec
  state 2).
- **[R-INT-4] Per-stage repair retry.** The gem's `repair_all!` isolates stage
  failures; the partial-failure panel should offer retry of the failed stage
  only, not just whole re-apply (hero-spec state 9).
- **[R-INT-5] Cross-database refusal as a first-class state.** A repair that
  spans logical DBs must render the specific refusal (which DBs, why, remedy),
  not the generic ErrorState (hero-spec state 11).
- **[R-INT-6] All-models sweep.** Run health checks across every model
  sequentially (server-paced), feeding R-HOME-1's cache. The gem has no global
  entry point; iterating `Familia.members` is ours to do.
- [ext] True op-level repair dry-run. The gem's `repair_all!` has no dry-run;
  today's "preview" is a fresh audit report plus a write count. An op-level
  plan (remove X, re-add Y, rebuild Z) needs gem support or bespoke plan
  synthesis — see R-GEM-2.
- [out] Auto-repair of cross-reference drift — report-only by explicit gem
  design; repairs there need human judgment.

### 6.4 Migrations cockpit

- [shipped] Status + drift views with honest "no migration runner" /
  "drift unavailable" states; preview-run (dry-run) → irreversible-ack →
  apply → honest result including incomplete-run panel; per-id rollback behind
  ack; drift cards with digest pair and field diff.
- **[R-MIG-1] Migration discovery convention.** The gem has no file-loading
  convention; migrations self-register only when required. Define and document
  how migrations reach the admin process (host app requires them at boot in
  embedded mode; `FAMILIA_ADMIN_MIGRATIONS` glob for standalone), so the
  cockpit is non-empty in real deployments.
- **[R-MIG-2] Run a single selected migration.** The gem's `run_one` exists;
  the UI only offers "run everything pending." Per-card run with dependency
  awareness (deps satisfied/pending chips existed in the prototype).
- **[R-MIG-3] Migration run progress.** Long migrations are the norm (OTS
  re-mint/re-encrypt jobs). Stream records-processed progress like the repair
  stream instead of a synchronous POST the operator stares at. Honors the
  "progress streams, not spinners" rule, currently honored only by Integrity.
- [ext] Draft-migration-from-drift: synthesize a migration skeleton from a
  drift diff (prototype had the button; real codegen is a bigger bite).
- [out] Concurrent-runner locking — single-operator tool behind a tunnel;
  revisit only if that changes.

### 6.5 Records

- [shipped] Descriptor-driven model picker, columns, and actions; phantom-aware
  pagination (`has_more`); indexed-query bar with honest `scan_required`
  refusal (no force affordance, by design); record detail with category-aware
  field rendering; audited single-field reveal (confirm → reveal-once →
  conceal); create with descriptor-driven form; destroy behind confirm with
  audit snapshot; read-only collection listings; encrypted edit semantics
  (blank = keep).
- **[R-REC-1] Client-side validation from `json_schema`.** The descriptor
  carries per-field JSON schema and the contract says it drives validation;
  today inputs are raw text and errors arrive as server 400s. Validate live on
  create/edit (format, enum, min/max) while keeping the server authoritative.
- **[R-REC-2] Save preview.** Edit mode should show a change review (old →
  new, N fields, one atomic write) before apply — same preview/apply spine as
  everywhere else. Prototype had it; SPA saves blind.
- **[R-REC-3] Destroy impact preview.** The confirm should enumerate actual
  blast radius (index entries, collection keys, timeline entry) rather than a
  static sentence. Requires a small backend impact endpoint or a dry-run flavor
  of destroy.
- **[R-REC-4] Writable collections.** Typed, paginated editors per structure
  (list add/remove/reorder; set add/remove; zset member+score with score-as-time
  toggle; hash key/value edit; counter incr/decr) using the existing-but-unused
  `POST …/:collection {op, args}` contract. Mutations audited, blocked in
  read-only mode like everything else. This is the largest shipped-backend /
  missing-frontend gap.
- **[R-REC-5] Row-level actions from the descriptor.** The descriptor's
  `actions` includes `rebuild_index`; no UI exposes it. List rows should offer
  the descriptor-declared actions (open / reveal / rebuild index entry /
  destroy) gated by tier.
- [ext] Query-plan explanation card (access path, complexity, estimated rows,
  "add an index" guidance) — the prototype's planner pedagogy, minus the force
  button. Valuable teaching surface, not load-bearing.
- [out] Natural-language query parsing; ad-hoc unindexed filtering (the
  refusal is the feature); optimistic concurrency on updates (single-operator
  reality — documented, deferred since the hardening plan).

### 6.6 Models

- [shipped] Registry table and per-model detail (fields, datatypes with
  declared-vs-index-internals partition, indexes, participations, raw
  descriptor JSON), cross-links to Records/Integrity.
- **[R-MOD-1] Make the model list the fleet view it was designed to be** —
  record counts and integrity status dots per model (shares R-HOME-1's cache;
  UX brief screen #1).
- [ext] Participation-following navigation ("show me this customer's api_keys
  as records") — the lightweight, useful core of the designed "relationship
  navigator," without the graph.
- [out] Relationship graph visualization — high effort, low operational value
  relative to the health surface; revisit after M4 (§8).

### 6.7 Raw explorer + console

- [shipped] SCAN key browser with MATCH/type filter and cursor paging; typed
  key inspector (TYPE/TTL/MEMORY/DB, per-structure viewers, concealed-value
  flagging, model-bridge banner); parsed server info; allowlisted read-only
  command console with history recall and truncation notices; blocked commands
  render terminally, no escalation.
- **[R-EXP-1] Complete the model bridge.** "Open in Records" should land on
  the specific record, not the bare screen (needs R-UX-1 deep links).
- [ext] zset score-as-time toggle and `counter` type filter (small prototype
  affordances that got dropped).
- [out] Live command feed / MONITOR-style streaming — removed in T5 for real
  resource-leak reasons; do not re-add without a new design that solves the
  worker-pinning problem. Standalone raw-key *editing* — the model layer is
  the write path; the explorer stays read-only.

### 6.8 Audit trail (backend shipped, UI missing)

- [shipped] Backend: every elevated action audited with actor/timestamp/
  action/params; destroy snapshots; retention trim; `GET /admin/api/audit`.
- **[R-AUD-1] Audit trail screen.** Reverse-chronological entries with action
  filtering, expandable detail (including destroy snapshots), and links to the
  affected record where it still exists. Operators currently cannot see their
  own audit trail without curl. Feeds R-HOME-2.

### 6.9 Auth & session

- [shipped] Shared-passphrase login → HttpOnly PASETO cookie (SameSite=Strict +
  OriginGuard); 401 → reauth overlay preserving app state, 403 → in-place
  denial; session bar with claims; permission-narrowing env; login rate
  limiter with tunnel-aware off switch; boot guards (min passphrase length,
  no dev keys outside dev).
- **[R-AUTH-1] Close the paper trail.** Issue #5's open questions are resolved
  by ADR 0001; annotate and close #5. Close #9 with a comment pointing at PR
  #14's false-positive analysis and the documented residual footgun (an
  unregistered reverse proxy collapses all clients to one rate-limit bucket).
- [out] Per-operator identity, SSO, roles-at-login — rejected in ADR 0003 /
  the auth spec's non-goals; the operator population doesn't justify it.

### 6.10 Cross-cutting UX (the ergonomics debt)

- **[R-UX-1] URL-addressable state.** Screens hold state component-locally;
  nothing deep-links. Encode model/record/tab in the hash route so Integrity
  rows, Explorer bridges, audit entries, and plain browser refresh all land
  somewhere specific. Prerequisite for R-INT-2, R-EXP-1, R-AUD-1.
- **[R-UX-2] Keyboard-first operation.** The design promised an operator tool
  that lives on the keyboard; today only the console has history recall. Global
  shortcuts (screen nav, run check, confirm/cancel), focus-trapped confirms
  defaulting to the safe action, live-region announcements on progress feeds
  (hero-spec §9).
- **[R-UX-3] Theme control.** Dark-first was a design mandate; tokens exist
  but there is no user-facing toggle. Ship dark as the default, light as the
  option, persisted.
- **[R-UX-4] Operation feedback.** Mutations currently re-render silently. A
  minimal toast/notice vocabulary echoing what happened ("destroyed
  customer:abc… · snapshot audited") — honest confirmation, not decoration.
- **[R-UX-5] Read-only mode visibility.** When the API is in production
  read-only mode, the UI should say so globally (banner/frame) instead of
  letting every mutation discover a 403 individually. (The viewport-frame
  treatment sketched in the closed simulated-UX issue is the right shape,
  repurposed.)

### 6.11 Platform & deployment

- [shipped] Loopback-only puma config (bind not env-tunable), production boot
  guards, read-only default, systemd unit template, SSH-tunnel runbook,
  embedded-boot assertion path, worked OTS example config, CI (Ruby contract
  suites vs live Valkey; Node typecheck/test/build; version matrices).
- **[R-PLAT-1] Deploy against OTS for real (the validating milestone).**
  Settle the admin's location relative to the OTS tree, run it embedded under
  the OTS bundle in a staging/production-mirror environment, read-only, against
  real data. Every gap this spec lists is hypothetical until this happens.
- **[R-PLAT-2] Raise the familia floor to `~> 2.11.1`.** See §7. This aligns
  with OTS, un-deadens the stale-index endpoint, and fixes destroy-driven
  index orphaning.
- **[R-PLAT-3] Resolve the MCP question explicitly.** The design named
  agent-drivable administration a headline differentiator; T5 removed the
  routes because the implementation never existed; the README still advertises
  it. Either schedule a real MCP surface (JSON-RPC over the same controller,
  Bearer-authenticated, same audit path) or strike it from the README and park
  it as [ext]. Until decided, the README must stop claiming it (R-DOC-1).
- **[R-DOC-1] Truth-sync the README.** Remove/rewrite the MCP claims and any
  other assertions this spec's audit found stale. The tool's own docs are held
  to the same honesty principle as its UI.

---

## 7. Gem alignment (familia 2.10.1 → 2.11.1 → 2.12)

The admin leans on capabilities the gem genuinely has — per-model
`health_check` / `repair_all!` audits with progress callbacks, a full
migration framework (registry, runner, drift detection, rake tasks), envelope-
driven encrypted fields — plus a version-gated layer it currently can't reach:

| Concern | On pinned 2.10.1 | On 2.11.1 (OTS's version) |
|---|---|---|
| `Familia.stale_indexes` / `IndexDescriptor` introspection | absent → `/integrity/_stale_indexes` returns "introspection unavailable"; descriptor index lookups silently degrade | present — endpoint and lookups come alive |
| `destroy!` unique-index cleanup | **admin-driven destroys orphan index entries** — the tool creates the drift its hero screen then reports | fixed upstream |
| Encryption salt history / per-field algorithm pin | absent | present (needed for the OTS rotation track) |

Since embedded mode runs under the **host app's** bundle, the admin already
executes against whatever familia version the host has — OTS is on 2.11.1
today. The admin's own pin only governs standalone/dev/CI. Keeping it at 2.10
means CI validates a different reality than production. Hence **R-PLAT-2**:
raise the floor to `~> 2.11.1`, drop the 2.10 degradation paths or convert
them into descriptor capability flags (R-DESC-2), and track 2.12 (familia#333
personalization-rotation history, #334 per-field algorithm override) as the
enabler for a future key-rotation workflow [ext].

Where the line sits between admin and gem (so we stop re-litigating it):

- **Admin-side by design:** HTTP surface, auth, operator audit trail, SSE
  streaming (the gem exposes block callbacks; we adapt), dry-run UX, the
  all-models sweep (R-INT-6), migration discovery convention (R-MIG-1).
- **Gem-side candidates (file upstream, don't fork):** op-level repair
  dry-run plans **[R-GEM-2]**; the windowed rate-limiter primitive (existing
  familia-matters issue #13) **[R-GEM-1]**; anything integrity-audit-shaped
  that requires touching internal key formats.

---

## 8. Roadmap

Ordered waves; each wave is shippable and none blocks daily use of what
already exists. Requirement IDs in parentheses.

- **M0 — Truth & hygiene** (hours, not days). Truth-sync the README (R-DOC-1);
  close/annotate stale issues #5, #9, #23 (R-AUTH-1 + the human UI-review
  checklist T7 mandated); merge dependabot #40/#41; adopt this spec.
- **M1 — Foundation alignment.** Familia `~> 2.11.1` floor (R-PLAT-2);
  descriptor validation against the full OTS model surface (R-DESC-1) with
  fixture snapshots added to the contract tests; descriptor capability flags
  (R-DESC-2).
- **M2 — Prove it on OTS.** Embedded read-only deployment against real OTS
  data (R-PLAT-1); run health checks on real models; fix what reality breaks.
  Deliberately before feature work: it converts every remaining gap from
  hypothesis to observation.
- **M3 — The health-first surface.** Home dashboard (R-HOME-1..3); audit
  trail screen (R-AUD-1); integrity console completion (R-INT-1..5);
  all-models sweep (R-INT-6). After M3 the tool's landing experience matches
  its stated identity.
- **M4 — Operator ergonomics.** Deep links (R-UX-1) then the drill-downs it
  unlocks (R-INT-2 fully, R-EXP-1); keyboard + focus discipline (R-UX-2);
  theme control (R-UX-3); feedback vocabulary (R-UX-4); read-only visibility
  (R-UX-5); client-side validation (R-REC-1); save/destroy previews
  (R-REC-2..3).
- **M5 — Maintenance write surfaces.** Writable collection editors (R-REC-4);
  descriptor-driven row actions incl. rebuild-index (R-REC-5); single-migration
  run (R-MIG-2); migration progress streaming (R-MIG-3); migration discovery
  (R-MIG-1 — earlier if M2 demands it).
- **Parked extensions** (revisit after M5, or when a concrete need lands):
  MCP surface (pending R-PLAT-3 decision), query-plan card, participation
  navigation, draft-migration-from-drift, key-rotation workflow (blocked on
  familia 2.12), relationship graph, field-level TTL cockpit.

---

## 9. Open decisions (owner calls, not agent calls)

1. **MCP: schedule or strike?** (R-PLAT-3). The agent-drivable story is a real
   differentiator, but it has been vaporware twice. Recommendation: strike from
   the README now (M0), decide after M3 when the HTTP contract has proven
   itself against OTS.
2. **Where does the admin live relative to OTS?** Sub-checkout, gem dependency,
   or vendored path — T2 left `<ADMIN_ROOT>` unsettled. Must be decided for M2.
3. **Writable collections vs read-only-default posture.** R-REC-4 adds write
   surface to a tool that is read-only in production by default. Confirm that
   maintenance-window semantics (flip, operate, flip back) are the intended
   model for collection surgery too, or scope R-REC-4 down.
4. **Issue #13 (rate limiter → familia).** Upstream it, or accept three
   divergent implementations. Independent of this repo's roadmap; flagging
   because this spec is where it keeps resurfacing.

---

## 10. Traceability

| Document | Status relative to this spec |
|---|---|
| `docs/early-designs/familia-admin-ui-design.md` | Design vision; still the reference for rationale and the Familia API datasheets. Its MCP-first framing is superseded by R-PLAT-3. |
| `docs/early-designs/familia-admin-ui-ux-brief.md` | Screen/IA/UX-rules reference. Screen #10 "Dashboard (optional)" is promoted to required (R-HOME-*); screen #5 "Relationship navigator" is demoted to [ext]. |
| `docs/features/familia-admin-integrity-console-spec.md` | Authoritative for the hero screen's states and visual direction; R-INT-1..5 are its unimplemented states, now committed. |
| `docs/features/familia-admin-auth-ui-spec.md` + `docs/adr/0001` | Shipped; R-AUTH-1 closes the paperwork. |
| `docs/early-designs/0612-…-hardening-plan.md` + ticket template | Executed (T1–T8). Its scope fences (no optimistic concurrency, no O(offset) fix, MCP out) remain in force except where this spec explicitly reopens them. |
| `docs/adr/0002`, `docs/adr/0003` | In force (principles 8–9). |
| `docs/features/issue-*.md` | Historical; superseded by T7 or folded into requirements above. |
| Open issues #5, #9, #23 | To be closed with annotations under M0 (R-AUTH-1). |
| Open issue #13 | Tracked as R-GEM-1 / open decision 4. |

### Requirement index

| ID | One-liner | Wave |
|---|---|---|
| R-DESC-1 | Validate descriptor against full OTS model surface | M1 |
| R-DESC-2 | Backend capability flags in the descriptor | M1 |
| R-HOME-1..3 | Fleet health dashboard, recent activity, server vitals | M3 |
| R-INT-1..5 | Count-mismatch, drill-down, check progress, per-stage retry, cross-DB refusal | M3/M4 |
| R-INT-6 | All-models health sweep | M3 |
| R-MIG-1..3 | Migration discovery, single-run, progress streaming | M5 |
| R-REC-1..3 | Client-side validation, save preview, destroy impact | M4 |
| R-REC-4..5 | Writable collections, descriptor row actions | M5 |
| R-MOD-1 | Model list as fleet view | M3 |
| R-EXP-1 | Explorer→Records deep bridge | M4 |
| R-AUD-1 | Audit trail screen | M3 |
| R-AUTH-1 | Close auth paper trail (#5, #9) | M0 |
| R-UX-1..5 | Deep links, keyboard, theme, feedback, read-only visibility | M4 |
| R-PLAT-1 | Real OTS deployment | M2 |
| R-PLAT-2 | Familia 2.11.1 floor | M1 |
| R-PLAT-3 | MCP decision | M0/M9† |
| R-DOC-1 | Truth-sync README | M0 |
| R-GEM-1..2 | Upstream rate limiter; op-level repair dry-run | upstream |

† strike-from-README now; build/no-build decision deferred until after M3.
