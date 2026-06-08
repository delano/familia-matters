# Familia Admin: UI/UX Design Brief

A streamlined brief for the designer. It covers what the product is, the screens
to design, the components and states they need, the moments that make this tool
different, and the concrete contract the backend provides. The full engineering
study lives in `familia-admin-ui-design.md`; this document is the subset a
designer needs, reframed for design work.

Companion artifacts in `resources/00-assets`: the Otto `routes.txt` file (the endpoint
map), `lib/familia/admin/descriptor.rb` (produces the model descriptor that
drives every dynamic screen), and `lib/familia/admin/api.rb` (the controller
that serves the contract below).

---

## 1. What this is, in one line

A model-aware admin for applications built on Familia (a Ruby object layer over
Redis/Valkey). Unlike generic Redis GUIs, which show raw keys and values, this
tool understands that a key is a `Customer` record with typed fields, encrypted
columns, relationships, and indexes, and lets you browse, edit, audit, and
migrate that object graph safely.

The frontend is not generated. It is built by hand against a self-describing JSON
API. The backend hands the UI a complete description of every model (the
"descriptor"), so tables and forms can be rendered dynamically from data rather
than hardcoded per model.

## 2. Who uses it and what they are trying to do

- **App developers / operators**: inspect and fix real records, follow
  relationships, run an integrity check before or after a deploy, run a
  migration. This is the primary user.
- **Support / ops**: look up a record by id or indexed field, read its
  (non-secret) contents, check status.
- **Security-sensitive actions**: reveal an encrypted field, run a destructive
  repair, run a migration. These are gated and audited.

The design should make the everyday read/inspect path fast and calm, and make
the dangerous paths feel deliberate.

---

## 3. The admin pattern this follows (context for design language)

The category was defined by Django admin, Rails ActiveAdmin/Avo, Laravel
Filament, and Elixir's Ash and Phoenix tooling. Their shared anatomy, which sets
user expectations, is: a model list (sidebar of model types), a record list view
(columns, filter, search, sort, paginate), a record detail/edit form (typed
field widgets, validation, read-only fields), related-record editing, bulk and
custom actions, and per-action permissions. Ash adds the idea that one
declarative model definition drives the admin, the API, and validation at once,
which is exactly how this tool works.

Two of these are worth borrowing directly:

- **Ash's "declare once" feel**: the UI should feel like a faithful projection of
  the model, not a separate hand-built screen. The descriptor makes this literal.
- **Phoenix LiveDashboard's operational view**: this tool has an operational half
  (integrity, live command feed, server stats), which should read like a
  dashboard, distinct from the CRUD half.

---

## 4. Screen inventory (information architecture)

Design these surfaces. Each maps to backend endpoints in section 8.

1. **Model browser (home)**. Sidebar or grid of all model types. Each model card
   shows name, record count (fast count, flagged as approximate), field count,
   index count, and an integrity status dot. Source: descriptor + a cheap count.

2. **Model detail / schema view**. The model's "shape": fields with their
   category (plain, encrypted, transient, identifier), attached DataTypes,
   indexes, participations, TTL policy. This is both reference and the jump-off to
   records. Source: descriptor for one model.

3. **Record list**. Columns chosen from fields, newest-first by default,
   paginated. Search by identifier; query by indexed field. A visible cost
   warning when a non-indexed filter is requested. Source: records endpoint.

4. **Record detail / edit**. Typed field editors, encrypted fields shown
   concealed with a reveal affordance, transient fields absent, related
   DataTypes shown as inline panels or links. Save is atomic. Source: record +
   collection endpoints.

5. **Relationship navigator**. Follow an index ("all customers with status X"),
   follow a participation (a record's membership in a collection), and a graph
   view of how models connect. Source: index query + participations in descriptor.

6. **DataType editors**. One editor per Redis structure (see section 6). Reused
   inside record detail and available for standalone keys.

7. **Integrity console**. Run a health check on a model, see phantoms, missing
   entries, stale indexes, orphaned buckets, and cross-reference drift, then
   repair with a dry-run preview. Live progress while it runs. This is the
   signature screen.

8. **Migration cockpit**. Migration status (applied/pending), schema drift
   (model changed vs stored), run with dry-run, rollback. Source: migration
   endpoints.

9. **Raw explorer + terminal**. The schemaless layer: key search, per-key
   type/TTL/value, server info, and a guarded command console. Live command feed.

10. **Dashboard (optional)**. Aggregate integrity status across models, recent
    admin actions (audit log), server health.

---

## 5. Field display and the reveal flow (security-critical UX)

Fields come in categories. The UI must treat them differently. This is not
cosmetic; it prevents secret leakage.

| Category | What it is | Default display | Editable | Reveal |
|---|---|---|---|---|
| plain `field` | normal value | the value | yes | n/a |
| identifier | the record's primary id | the value, badged | usually no | n/a |
| `encrypted` | secret stored encrypted | `[CONCEALED]` chip | value hidden | explicit, permission-gated, audited, returns plaintext once |
| `transient` | never stored | not shown at all | no | never |

Reveal flow to design: a concealed field shows a lock chip. Reveal is a distinct
action (not an inline toggle that feels casual). It requires the elevated
permission tier, it is logged to the audit trail with who/when, and the revealed
plaintext is shown once with a clear "this was logged" note. Show the field's
encryption key version near it (rotation is a real workflow). Never put plaintext
in a list view, only in a deliberate single-field reveal.

Design states for fields: normal, concealed, revealed-once, read-only,
validation-error, dirty/unsaved.

---

## 6. Component inventory: DataType editors

Familia maps model attributes to native Redis/Valkey structures. Each needs a
purpose-built editor. The "type" string in the descriptor tells the UI which to
render.

| Descriptor type | Structure | Editor behavior | Notes for design |
|---|---|---|---|
| `list` | ordered list (dups allowed) | ordered rows, add/remove, reorder | paginated (large lists); show length |
| `set` | unique unordered values | chip/tag input; add/remove | membership is the point; no order |
| `sorted_set` | members with numeric scores | rows of member + score, sortable by score; range filter | scores often timestamps; offer a time view |
| `hashkey` | field to value map | key/value table, add/edit/remove rows | filter by field-name pattern |
| `string` | scalar string | single value editor | |
| `json_stringkey` | JSON-encoded scalar | JSON editor with validation | render structured, not raw text |
| `counter` | atomic integer | value + increment/decrement controls | edits are atomic; show as a stat |
| `lock` | mutex with holder/TTL | read-only status, holder, TTL, guarded force-release | destructive to release; confirm |

Shared behaviors: all collections paginate (never load-all), sorted sets support
time-range browsing, hashes and sets support pattern filtering. Every mutation is
atomic on the backend; the UI should reflect success/failure per operation.

---

## 7. The moments that make this different (lean into these)

Generic Redis GUIs and even SQL admins do not have these. They are the product's
reason to exist, so give them strong, distinctive design.

- **Integrity console as the hero.** Redis enforces no referential integrity, so
  this tool surfaces application-level integrity the database cannot: phantoms
  (timeline entries with no record), missing entries, stale index formats,
  orphaned index buckets, drifted cross-references. Design it like a health
  report with a confident "repair" path that always offers a dry-run first.
  This is "fsck for your object graph." Nothing else offers it.

- **Relationship graph over a schemaless store.** Visualize the object graph the
  backend derives from indexes and participations, including which Redis
  structure backs each edge and the score semantics of sorted-set edges.

- **Encryption-aware operations.** Concealed-by-default fields, audited reveal,
  visible key version, and a key-rotation workflow. A database admin that treats
  secrets as first-class is rare.

- **Schema-drift to migration.** "Your model changed since last deploy, here is
  the drift, here is a reversible, backed-up migration." Closer to Rails/Ash
  migration tooling than to any Redis GUI.

- **Dry-run everywhere for dangerous actions.** Repairs and migrations preview
  before they apply. Make the preview/apply distinction a consistent, recognizable
  pattern across the app.

- **Agent-drivable.** The same API is exposed as MCP tools, so an AI operator can
  run audits and repairs. Not a screen to design, but it informs that actions
  should be discrete and well-named.

---

## 8. What the backend provides (the contract you design against)

The backend is an introspection-driven JSON API plus live streams. Endpoints are
defined in `resources/00-assets/routes.txt`. The shapes below are what the UI consumes.
Auth tiers are enforced server-side; the UI should hide actions the user lacks
the tier for.

### 8.1 The descriptor (the source of truth for dynamic UI)

`GET /admin/api/_meta` returns every model. `GET /admin/api/models/:model`
returns one. Build tables and forms from this, do not hardcode per model. Shape
per model:

```json
{
  "model": "customer",
  "class": "Customer",
  "key_pattern": "customer:{custid}:object",
  "identifier_field": "custid",
  "logical_database": 0,
  "fields": [
    { "name": "custid", "category": "field", "identifier": true },
    { "name": "email",  "category": "field", "json_schema": { "type": "string", "format": "email" } },
    { "name": "api_key","category": "encrypted", "display": "[CONCEALED]" },
    { "name": "password","category": "transient", "client_visible": false, "display": "[REDACTED]" }
  ],
  "datatypes": [
    { "name": "domains",  "type": "sorted_set", "scope": "instance" },
    { "name": "metadata", "type": "hashkey",    "scope": "instance" }
  ],
  "indexes": [
    { "index_name": "email_lookup", "field": "email", "cardinality": "unique",
      "class_level": true, "queryable": true, "coordinate": "Customer.email_lookup" }
  ],
  "participations": [
    { "collection": "all_customers", "type": "sorted_set", "scored": true }
  ],
  "safe_dump_fields": ["custid", "email", "name", "created_at"],
  "expiration": { "policy": "none" },
  "actions": ["list", "read", "create", "update", "destroy", "reveal", "rebuild_index"]
}
```

Design implication: `fields[].category` decides the editor and display state.
`fields[].json_schema` drives form validation. `indexes[].queryable` decides
which columns are filterable cheaply. `actions` decides which buttons appear.

### 8.2 Records

- `GET /models/:model/records?offset=&limit=` returns `{ records: [...],
  count_fast, offset, limit }`. `count_fast` is fast but approximate (may include
  phantoms); badge it as such and point to the integrity console for the true
  count.
- `GET /models/:model/records/:id` returns one serialized record. Encrypted
  fields arrive as `[CONCEALED]`, transient fields are absent.
- `POST/PUT/DELETE` for create/update/destroy. Mutations are atomic server-side.
- `POST /models/:model/records/:id/reveal/:field` returns the plaintext of one
  encrypted field, once, and logs it.

### 8.3 Collections

`GET /models/:model/records/:id/:collection?offset=&limit=` returns paginated
members. `POST` the same path mutates with `{op, args}`. The descriptor's
`datatypes[].type` tells you which editor to show.

### 8.4 Query

`GET /models/:model/index/:index?value=` returns records behind an index bucket.
This is the only cheap filter. For anything not indexed, the UI should warn that
it is a full scan and require an explicit row budget.

### 8.5 Integrity

- `GET /admin/api/integrity/:model` returns a health report:
  `{ healthy, phantoms, missing, indexes, participations, cross_references, ... }`.
- `POST /admin/api/integrity/:model/repair?dry_run=true|false`. With
  `dry_run=true` it returns the report only; without, it repairs and returns what
  changed.
- `GET /admin/api/integrity/_stale_indexes` returns indexes needing a rebuild.

### 8.6 Migrations

- `GET /admin/api/migrations` returns applied/pending status.
- `GET /admin/api/migrations/drift` returns model-vs-stored schema drift.
- `POST /admin/api/migrations/run?dry_run=` and `POST .../rollback`.

### 8.7 Raw explorer

`GET /admin/api/raw/keys` (SCAN-based key search), `/raw/key` (type/TTL/value),
`/raw/info` (server info), and a guarded `POST /raw/command`.

### 8.8 Live streams (design for progressive, not blocking)

`GET /admin/api/stream/commands` and `GET /admin/api/stream/repair/:model` are
server-sent event streams. The command feed emits each Redis command as it
happens; the repair stream emits `{phase, current, total}` progress. Design
these as live, append-only feeds with a progress indicator, not as a spinner that
blocks until done.

### 8.9 Auth tiers (which actions to gate in the UI)

- `role:admin`: all read and ordinary record edits.
- `permission:reveal_secrets`: reveal encrypted fields.
- `permission:repair`: run repairs.
- `permission:run_migrations`: run/rollback migrations.
- `permission:raw_command`: the raw command console.

Hide or disable actions above the current user's tier, and treat the elevated
ones as deliberate (confirm step, audit note).

---

## 9. Cross-cutting UX rules (the constraints that shape good design here)

- **No SQL-style filtering.** Cheap filters are indexed fields only. Everything
  else is a scan. Surface this honestly with a cost warning and a row budget,
  and prompt "add an index" rather than hiding the cost.
- **Counts are two kinds.** Fast/approximate (timeline) vs authoritative (scan).
  Show the fast one by default, badge it, and let the integrity console
  reconcile.
- **Dangerous actions preview first.** Repairs, migrations, destroys, reveals,
  and raw commands all get a deliberate, recognizable confirm/dry-run pattern.
- **Progress streams, not spinners.** Long operations (audit, repair, large
  scans) report incremental progress.
- **Status badges everywhere.** Integrity status per model, stale-index flags,
  TTL/expiry indicators, lock holders. The schemaless substrate has more failure
  modes than SQL, so make state visible.
- **Empty and error states matter.** A model with no records, an index with no
  matches, a record that exists in the timeline but has no key (a phantom), a
  cross-database operation that is refused. Design these explicitly.
