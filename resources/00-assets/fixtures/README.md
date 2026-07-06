# Design fixtures pack

Realistic, self-consistent sample data so design work (and Claude-driven design
generation) runs against real content instead of lorem ipsum. All payloads match
the shapes produced by `lib/familia/admin/descriptor.rb` and `lib/familia/admin/api.rb`.

| File | Drives |
|---|---|
| `models.rb` | the three worked models the rest is derived from |
| `descriptor.sample.json` | model browser, schema view, and every dynamic table/form |
| `records.sample.json` | record list, record detail, reveal flow, collection editors, indexed query |
| `health_check.sample.json` | the integrity console (all issue types present) |
| `migrations.sample.json` | migration cockpit (status, drift, dry-run plan) |
| `audit.sample.json` | the audit trail screen (`GET /admin/api/audit`: `{entries, count, limit}`, newest-first; a destroy entry carries a masked `snapshot`) |
| `stream_repair.sample.jsonl` | repair progress stream (one JSON event per line) |

## Two honest caveats for accurate designs

1. **Index-backing structures appear in reflection.** A `unique_index` /
   `multi_index` is itself stored as a hashkey, so live reflection of
   `related_fields` can surface `email_lookup` / `status_index` as
   class-scoped datatypes in addition to listing them under `indexes`. The
   samples here keep `datatypes` limited to developer-declared collections for
   clarity. In the real UI, filter index-backing structures out of the
   collection list by cross-referencing `indexes[].index_name`, or show them in a
   separate "internals" group.

2. **Sorted-set score representation is a UI decision.** Familia's
   `SortedSet#each` iterates members; scores are available but how the collection
   endpoint returns them is a design choice. The samples return
   `{ member, score }` pairs because sorted-set scores are meaningful (often
   timestamps) and the editor should show and sort by them. Decide this contract
   once and keep it consistent.

## Notes baked into the data

- `count_fast` is the O(1) timeline count and may include phantoms; the integrity
  console reconciles it against a SCAN count. Badge it as approximate.
- Encrypted fields arrive as `[CONCEALED]`; transient fields are absent. Plaintext
  appears only in the single-field reveal response, which is audited.
- `Session` sits on `logical_database: 1` to exercise the multi-database
  constraint (no cross-database atomic writes).
- Timestamps are real Unix seconds in the 2024 to 2025 range so date formatting
  looks right.
