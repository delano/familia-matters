# AGENTS.md

_Updated: 2026-06-12_

## Discovery: Familia Admin

A design-study + interactive-prototype + Ruby-scaffolding repo for a model-aware Redis/Valkey admin. No build system, no running server — three layers that share one contract. 100 tracked files.

### Key Files

**Contract layer (`resources/00-assets/`)** — the source of truth both ends honor:
- `routes.txt`: Otto route map. 28 HTTP endpoints, grouped Auth/Discovery/Records/Collections/Query/Integrity/Migrations/Raw/Streams. Encodes auth tiers (`role:admin` vs `permission:{reveal_secrets,repair,run_migrations,raw_command}`) and `csrf=exempt` on mutations. (The agent-protocol route stubs were removed in T5 — `docs/0612-familia-admin-production-hardening-plan.md` §9 records re-adding that surface when it is actually built.)
- `lib/familia/admin/descriptor.rb`: `Familia::Admin::Descriptor` — pure-metadata reflection of `Familia.members` into the UI contract. **Zero DB reads** (so `/_meta` is cacheable); every reflection call wrapped in `safe{}`. Verified vs Familia 2.10.1.
- `lib/familia/admin/api.rb`: `Admin::API` — thin Otto controller. Read/integrity/migration actions implemented; create/update, `mutate_collection`, raw explorer, and SSE streams are `not_implemented` skeletons with correct hints.
- `fixtures/models.rb`: three worked models (`Customer` rich/encrypted/indexed, `Session` on `logical_database 1`, `ApiKey` participation) the rest derives from.
- `fixtures/*.sample.json` + `stream_repair.sample.jsonl`: contract-shaped payloads (descriptor, records, health_check, migrations, repair stream). `fixtures/README.md` documents two contract subtleties (index-backing structures leak into reflection; sorted-set score representation).
- `prototype/backend-simulator.md`: the LLM system prompt that **is** the prototype backend — one StateModel, seeded from fixtures, mutated by actions.
- `design-tokens.css`, `design-system-notes.md`: Otto-derived tokens at operator density, dark-first.

**Prototype layer (`resources/01-designs/`)** — React-via-CDN (no bundler):
- `Familia Admin.html`: shell. Hosts the *single* backend instance and swaps screen iframes; bridges `familia-backend-{ping,req,res}` and `familia-nav` over `postMessage`.
- `prototype/backend.js`: `createFamiliaBackend()` — drives `window.claude.complete`, keeps state implicitly in the chat transcript.
- `prototype/backend-client.js`: `window.familiaBackend` — bridges to parent shell when embedded, falls back to a local instance standalone.
- `prototype/seed.js`: fixtures inlined as the system prompt + SEED.
- Per-screen dirs (`integrity-console/`, `records/`, `models/`, `migrations/`, `explorer/`): each has `App.jsx` (shell wrapper), a main component, `store.jsx`/`data.js`, `icons.jsx`. `records/store.jsx` shows the pattern: every op → `familiaBackend.request(envelope)`, with a local mirror for graceful offline degradation.
- `_ds/`: two extracted Claude-Design systems (`familia-admin-…`, `onetime-secret-…`) — `_ds_bundle.js` exposes `window.FamiliaAdminDesignSystem_a9098d` (Sidebar/Topbar/Badge/…), tokens, fonts.
- `screenshots/`: 4 PNGs.

**Docs (`docs/`)**: `ui-design.md` (717 lines, the full study/datasheets), `ui-ux-brief.md` (321), `integrity-console-spec.md` (198, the hero screen), `claude-design-prototype-handoff.md` (210).

### Architecture

Three layers, one envelope. The request shape `{action, model, params, tier}` and the JSON response shapes are identical across the prototype simulator and the Ruby `api.rb` — that's "the seam."

```
Descriptor.app ──emits──▶ /_meta (descriptor) ──▶ UI builds itself from it (no generated frontend)
                                  │
Browser shell (Familia Admin.html)
  hosts 1 backend ◀─postMessage─ screen iframes ◀── store.jsx ◀── components
        │                                                  ▲
   backend.js → window.claude.complete (LLM = StateModel)  │ same envelope
                                                           ▼
  PRODUCTION SWAP: replace window.familiaBackend with fetch() → Otto /admin/api/* → Admin::API → Familia
```

Data flow (records.list example): component → `store.jsx` builds envelope → `familiaBackend.request` → (embedded) parent shell → `backend.js` → LLM computes from StateModel → response normalized back. Cross-screen guarantee: `records.create` bumps `timeline.count_fast`, so the Integrity console's next `integrity.check` reflects it — one mutable state object, not per-screen fixtures.

Auth model: Otto enforces tier from `routes.txt` *before* the controller runs; `Admin::API` reads the authenticated actor from `env['otto.strategy_result']` and assumes the gate passed. Elevated actions (`reveal`, `repair`, migrations, `raw.command`) are audited via `audit!`.

### Dependencies

- **Internal**: `api.rb` → `descriptor.rb`. Both depend on the live Familia runtime (`Familia.members`, `index_descriptors`, `health_check`, `repair_all!`, `Migration::Runner/Registry`). Prototype screens → `_ds` bundle + shared `familiaBackend` + `window.REC`/seed data.
- **External**: Familia 2.10.1 (Redis/Valkey object layer); Otto (Rack 3 routing, auth, CSRF); React + ReactDOM via CDN; `window.claude.complete` (Claude Design runtime); `JSON` stdlib. Familia and Otto source repos live as siblings at `../`.

### Observations

- **The descriptor is the architecture.** Frontend isn't generated or hand-synced — it reflects `/_meta` at runtime, so new models need zero scaffolding.
- **The backend is an LLM.** The prototype has no JS state machine; `backend-simulator.md` is a system prompt and state lives in the conversation transcript. Going live is described as a one-transport swap, with fixtures becoming contract tests.
- **Honesty markers in the contract**: `count_fast` is flagged O(1)-but-phantom-prone; encrypted → `[CONCEALED]`, transient omitted, plaintext only via audited single-field reveal; cross-`logical_database` repairs return `CrossDatabaseError` (drives the "Refused" UI state).
- **Status**: read/integrity/migration paths real; mutations/raw/streams are skeletons. The 8-state preview switcher in `integrity-console/App.jsx` (issues→healthy→dryrun→repairing→repaired→partial→refused→noperm) maps the full dangerous-action lifecycle the design mandates (dry-run → confirm-with-impact → apply).
- `.DS_Store` files are tracked (4 of them) — likely unintended.
