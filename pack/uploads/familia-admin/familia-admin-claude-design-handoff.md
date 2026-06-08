# Claude Design Handoff: familia-admin

How to take everything in this folder into Claude Design and get a functional,
not merely clickable, prototype. The key lever: Claude Design's interactive
prototypes can call the Claude API, so the static fixtures become a live backend
and the genuine UI-to-AI features can be demonstrated for real, not faked.

This document assumes the artifacts already produced:
`familia-admin-ui-ux-brief.md`, `familia-admin-integrity-console-spec.md`, and
the `familia-admin/` folder (`routes`, `design-tokens.css`, `lib/familia/admin/*`,
`fixtures/*`).

---

## 1. What to feed Claude Design

| Input | Use |
|---|---|
| Codebase: point at `familia-admin/` | Picks up `design-tokens.css` as the design system, `routes` as the endpoint map, `descriptor.rb`/`api.rb` as the data contract, and `fixtures/` as content. This is the highest-value input. |
| Upload: `familia-admin-integrity-console-spec.md` | The hero screen, fully specified (states, transitions, bindings). Start the project here. |
| Upload: `familia-admin-ui-ux-brief.md` | Screen inventory and global UX rules for the rest of the app. |
| Upload: the `fixtures/*.json` | Real content so generated screens are populated, not lorem ipsum. |

Onboarding note: when Claude Design builds the design system, confirm it adopts
`design-tokens.css` (the `--admin-*` and `--otto-*` variables) and the density and
dark-theme rules from section 2 of the hero spec. Correct it toward power-user
density if it drifts consumer-spacious.

Build order: integrity console first (it sets the language), then record
list/detail, then the migration cockpit, then the raw explorer. Derive each from
the previous so the system stays consistent.

---

## 2. The prototype backend: wire interactions to the Claude API

Instead of hardcoding one static screen state, back the prototype with a Claude
API call that plays the familia-admin server and returns JSON in the fixture
shapes. This makes the prototype stateful and explorable: create a record and it
shows up in the next list, run a repair and the next health check comes back
clean. That is the difference between a demo and a believable tool.

Paste this as the system prompt for the prototype's backend calls, with the
fixture files concatenated into the seed block.

```
You are the backend for "familia-admin", a model-aware admin for Familia
(a Ruby object layer over Redis/Valkey). You receive one JSON request describing
an admin action and you return ONLY a JSON response that matches the familia-admin
API contract. No prose, no markdown, JSON only.

SEED DATA (treat as the live dataset; mutate it as actions occur this session):
<paste descriptor.sample.json, records.sample.json, health_check.sample.json,
 migrations.sample.json here>

CONTRACT
- GET _meta -> the descriptor object.
- list records -> { model, offset, limit, count_fast, records:[...] } using the
  record shapes from the seed. Encrypted fields are "[CONCEALED]"; transient
  fields are absent.
- read record -> one record object (+ "_key").
- create/update/destroy -> apply to session state and echo the result. A created
  record appears in later lists; a destroyed one disappears.
- reveal field -> return a clearly fake plaintext (prefix "sk_demo_") plus an
  "_audit" object. Never invent a realistic secret.
- query index -> results for an indexed field. For a NON-indexed filter return
  { "error":"scan_required", "hint":"add an index or pass force=true",
    "estimated_rows": <n> } unless the request sets force=true.
- integrity (health check) -> the health_check shape. IMPORTANT STATE RULE: after
  a successful repair this session, return healthy:true with empty issue arrays.
- repair -> if dry_run, return a preview of what would change; if applied, return
  the change summary AND mark the dataset healthy for subsequent checks.
- migrations status/drift -> the migrations shapes. Applying a migration moves it
  from pending to applied and clears its entry from drift.
- streaming actions (check, repair) -> return an ARRAY of progress events in the
  stream_repair shape (phase, current, total, result), ending with a done event.

RULES
- Maintain consistency within the session. State changes persist across requests.
- This is a prototype. Never claim a real database connection. Destructive
  actions are simulated; say so in a "_simulated": true field on mutations.
- Respect permission tier if the request includes one: if tier lacks the action,
  return { "error":"forbidden", "required_tier": "<tier>" }.
```

Request envelope to send from UI elements (keep it small and uniform):

```json
{ "action": "health_check", "model": "customer", "params": { "dry_run": true }, "tier": "permission:repair" }
```

Because these responses match the exact shapes that the real `api.rb` emits, the
prototype and the production backend speak the same language. See section 5.

---

## 3. In-product UI-to-AI features (design and demo these for real)

These are not prototyping tricks. They are genuine product features that the
admin should ship, and Claude Design can demonstrate them live because it has API
access. Each is a place where AI earns its spot in a data admin. Design the
surface and wire the call.

### 3.1 Natural-language query bar
- Where: top of the record list.
- Trigger: user types "active customers in the EU created this quarter".
- Prompt contract: give the model the model's descriptor (fields + indexes) and
  ask it to produce a query plan: which index to use, or an honest
  `scan_required` with an estimated row count and a "create an index on X"
  suggestion. Then run the resulting indexed query.
- Output: a plan chip ("uses status_index, cheap" or "full scan, ~1,282 rows,
  add index?") followed by results. This makes the no-SQL constraint a feature,
  not a footnote.
- Guardrail: never silently run an expensive scan; require an explicit confirm.

### 3.2 Explain this issue
- Where: any row in the integrity console.
- Trigger: click a phantom, orphaned key, or cross-reference mismatch.
- Prompt contract: pass the issue object and the model descriptor; ask for a
  plain-language explanation of what it means, how it likely happened, and what
  Repair will do to it.
- Output: a short, calm explanation inline. Turns an intimidating report into a
  teachable one.

### 3.3 Drift to migration draft
- Where: migration cockpit, on a drifted model.
- Trigger: "Draft migration" on a `schema_drift` entry.
- Prompt contract: pass the drift differences and the available Familia Lua
  operations (rename_field, copy_field, delete_field, rename_key_preserve_ttl,
  backup_and_modify_field); ask for a reversible migration plan with backup
  enabled and an estimated record count.
- Output: a reviewable plan (the `run_dry_run` shape in `migrations.sample.json`),
  never auto-applied. Human approves, then it runs as a normal dry-run/apply.

### 3.4 Record summary and anomaly flag
- Where: record detail.
- Trigger: automatic on open, or a "Summarize" affordance.
- Prompt contract: pass the safe-dumped record plus collection sizes; ask for a
  one-line summary and any internal inconsistencies (for example login_count is 0
  but recent_logins is non-empty).
- Output: a one-line summary and an optional caution chip. Encrypted and transient
  values are never sent to the model.

### 3.5 Agent console (the MCP thesis, made visible)
- Where: a dedicated console, mirroring the `MCP`/`TOOL` routes already in
  `routes`.
- Trigger: "run a health check on Customer and repair anything safe".
- Prompt contract: expose the admin's read tools and the gated action tools; let
  the model call them, with the same permission tiers and the same dry-run-then-
  apply gate a human gets.
- Output: a transcript of tool calls and results. This demonstrates the
  agent-drivable admin directly, which no other DB admin tool does.

### 3.6 Command-stream narration
- Where: raw explorer live feed.
- Trigger: streaming Redis commands.
- Prompt contract: periodically pass a window of recent commands; ask for plain
  annotations (a slow command, a hot key, an unusual pattern).
- Output: inline annotations on the feed. Optional, lower priority.

---

## 4. Prototype guardrails (data-admin specific)

A prototype of an admin over real-looking data has its own risks. Bake these in.

- **Secrets stay fake.** Reveal returns a `sk_demo_...` value and shows the
  "this was logged" notice. Never display anything that looks like a real secret.
- **Destructive actions are simulated.** Repair-apply, destroy, run-migration, and
  raw commands return `_simulated: true` and must be visibly labeled "Prototype:
  simulated" in the UI. The prototype never claims a live database.
- **Tier toggles for demos.** Add a tier switch so reviewers can see the gated
  states (reveal blocked, repair blocked) without separate accounts.
- **Honesty about cost.** The NL query feature must surface scan cost rather than
  hide it, even in the prototype, because that honesty is the product's character.

---

## 5. The fixtures are the seam (prototype to production)

The reason this export is clean: the prototype's Claude-API backend returns the
same JSON shapes that `lib/familia/admin/api.rb` and `descriptor.rb` produce
against a real Familia app. So going from functional prototype to real product is
a transport swap, point the same UI at the Otto endpoints instead of the Claude
simulator, not a redesign. When you use Claude Design's handoff-to-Claude-Code
bundle, include `routes`, `descriptor.rb`, and `api.rb` so the generated frontend
binds to the real contract immediately.

Concretely:
- Prototype: UI element -> Claude API (simulator system prompt) -> JSON.
- Production: same UI element -> `GET/POST /admin/api/...` (Otto) -> same JSON.

Keep the request envelope (section 2) and the response shapes (the fixtures)
stable and the two ends never diverge.

---

## 6. One-paragraph project kickoff prompt (paste into Claude Design)

> Build the integrity console for "familia-admin", a model-aware admin for Familia
> (a Ruby object layer over Redis/Valkey). Use the attached spec
> (`familia-admin-integrity-console-spec.md`) for states and layout, the design
> tokens in `familia-admin/design-tokens.css` (power-user density, dark theme by
> default, Otto semantic palette, pink as a sparing accent), and
> `fixtures/health_check.sample.json` as the data. Render the "issues found" state
> first, then the dry-run preview and the live repairing state driven by
> `fixtures/stream_repair.sample.jsonl`. Make it dense, keyboard-first, and
> monospace for keys and identifiers. Then wire the "Run check" and "Repair"
> actions to a Claude API backend using the simulator system prompt so the
> prototype is stateful: after a repair, the next check comes back healthy.
