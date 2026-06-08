

Continue the Familia Admin prototype in this project. The Integrity Console and Records is already built with its switchable states, via "Familia - Admin.html". Now make it interactive against a single shared backend.

Use `prototype/backend-simulator.md` as the backend for every interactive element across all screens. Paste its system prompt as the backend, with the `fixtures/*.json` files filled into the SEED block. Maintain one shared StateModel for the whole prototype session, seeded once, and compute every response from current state, not from a fixed fixture.

Wire the Integrity Console first:
- "Run check" calls `integrity.check` and renders the result; if drift is empty it shows Healthy.
- "Repair drift" calls `integrity.repair` with `dry_run:true` to render the preview, then "Apply repair" calls it with `dry_run:false` and `stream:true`, animating the Repairing state from the streamed phase events, then settling on Repaired. After an apply, the next "Run check" must return Healthy and the counts must reconcile (count_fast equals count_scan).
- Keep the Refused state driven by the CrossDatabaseError branch and the No-perm state driven by an insufficient `tier`.

Do not change the visual design. This is wiring only.


---


Build the Records screens (list and detail) for Customer, wired to the same backend defined in `prototype/backend-simulator.md` and the same shared StateModel. `records.create` and `records.destroy` must adjust the timeline count so the Integrity Console reflects the change. Encrypted fields use `records.reveal` (fake plaintext, audited); the natural-language query bar uses `query.index` and shows the scan-cost warning for non-indexed fields. Match the Integrity Console's visual language.


---


\[upload updated backend simulator doc]

Build the Migrations and Explorer screens, wired to the same backend defined in `prototype/backend-simulator.md` and the same shared StateModel. Reuse the Records pattern: an async store layer that talks to `window.familiaBackend`, degrades to the seed when unreachable, and adds the screens to the `Familia Admin.html` shell with sidebar nav and `#migrations` / `#explorer` deep-links. Match the Integrity Console's visual language exactly.

**Migration cockpit** (`migrations.*`). Header shows the status summary (N applied, M pending) and a "Run pending" action gated by `tier: permission:run_migrations`.
- Pending list: one card per migration with id, description, reversible flag, and dependencies. Action is Dry-run, which calls `migrations.run {dry_run:true}` and renders the plan (operation, from/to, estimated records, reversible, backup enabled), then Apply, which calls `migrations.run {dry_run:false, stream:true}` and animates a records-processed progress feed, then settles on applied. Reuse the exact dry-run-then-apply component and confirm-with-impact pattern from the Integrity Console. For irreversible migrations show the irreversible-warning variant of the confirm.
- Applied list: id, applied_at, reversible; Rollback action (gated, confirm) on reversible ones, calling `migrations.rollback`.
- Schema drift cards: one per drifted model showing the added/removed field diff, a "Draft migration" action that proposes a reversible plan from the diff, and a link to the suggested migration. Applying that migration must clear the drift entry and update the model's stored schema digest, so the Models detail and this card reconcile.
- States to provide: status (default), dry-run preview, running (streamed), applied/done, rollback confirm, partial failure, no-perm.

**Raw explorer** (`raw.*`). Two panes.
- Left, key search: `raw.scan_keys` (SCAN-based, never KEYS), glob pattern input and type filter, each row showing key, type, TTL, with cursor "load more".
- Right, key inspector: `raw.inspect_key` header with TYPE / TTL / MEMORY, and a typed value viewer per type (string, hash table, list rows, set chips, sorted-set member+score with a time view, counter). When a key maps to a model, show a "this is a Customer record" banner linking to its model-aware detail, bridging the raw and model layers.
- Server info panel from `raw.info`, parsed into sections (server, memory, clients, stats, keyspace).
- Live command feed: subscribe to the streamed `live.commands` events as an append-only feed with slow-command highlighting.
- Command console: an input that runs `raw.command`. Allowlisted read commands resolve; KEYS, FLUSHALL, FLUSHDB, CONFIG, SHUTDOWN, DEBUG are blocked with a "command_blocked" notice unless `tier: permission:raw_command` and an explicit force confirm. Label everything simulated.
- States to provide: idle/empty, results, key selected, info panel, streaming feed, command result, blocked-command, no-perm.

All responses come from the shared StateModel via the one backend; do not fork a second backend or fall back to per-screen fixtures except when `window.familiaBackend` is absent. Do not change the visual design.




--- 


On bringing the prototype and the Ruby together in Claude Code, briefly:

Use Claude Design's handoff bundle, and make sure it includes both the generated frontend and the existing `familia-admin/` repo files (`routes`, `lib/familia/admin/descriptor.rb` and `api.rb`, `fixtures/`, `design-tokens.css`, `prototype/backend-simulator.md`). The seam is already built for you: the simulator's request envelope and response shapes are the same contract `api.rb` emits, so the whole job is swapping one transport. Point Claude Code at the single integration point, the store layer's `window.familiaBackend`, and have it replace the in-browser StateModel with `fetch()` calls to the Otto `/admin/api/*` endpoints in `routes`. Nothing else in the UI changes.

A tight handoff instruction works well: "Replace the in-browser simulator with the real Otto backend. Implement the unimplemented `api.rb` actions (create, update, mutate_collection, raw, streams) against Familia using `descriptor.rb` reflection; wire the streaming endpoints as Rack 3 streaming bodies; add the audit-log sink. Treat `fixtures/*.json` as contract tests so the live responses match the shapes the prototype consumed, and write them as Tryouts tests. Then run a security pass on reveal gating, the raw-command allowlist, CSRF, and the audit trail before anything talks to a real database." That keeps the fixtures as the contract that stops the prototype and the backend from ever diverging.
