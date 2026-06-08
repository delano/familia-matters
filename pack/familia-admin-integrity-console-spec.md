# Hero Screen Spec: Integrity Console

The integrity console is the product's signature screen and the one to design
first. It has no equivalent in any Redis GUI or SQL admin, so getting its visual
language and states right sets the tone for everything else. This spec enumerates
every state, the data behind each, the transitions between them, and a global
visual direction (anchored on Otto's design tokens) that the rest of the admin
inherits.

Drive the design from the fixtures: `familia-admin/fixtures/health_check.sample.json`
(the report) and `familia-admin/fixtures/stream_repair.sample.jsonl` (the repair
progress feed).

---

## 1. What it does and why it leads

Redis/Valkey enforces no referential integrity. Familia maintains the object
graph (instance timelines, unique and multi indexes, participations,
cross-references) in application code, so it can drift. The integrity console is
"fsck for the object graph": it runs Familia's audit, shows exactly what drifted,
and repairs it safely with a dry-run preview first. The emotional target is
calm confidence, not alarm. A developer should trust it enough to click Repair.

---

## 2. Global visual direction (inherited by the whole admin)

Anchor on Otto's design tokens (`otto/lib/otto/design_system.rb`) so the admin
matches the framework's existing system, but apply them at power-user density.
This is a developer operations tool, closer to Linear, Datadog, and RedisInsight
than to a consumer SaaS dashboard.

**Reused Otto tokens.** Semantic colors `--otto-success #059669`,
`--otto-warning #D97706`, `--otto-error #DC2626`, `--otto-info #0284C7` and their
`-light` tints; the full `--otto-gray-50..900` scale; `--otto-font-mono`
('SF Mono', Consolas, Menlo); the spacing, radius, shadow, and transition scales.

**Semantic mapping (use consistently across the app):**

| Meaning | Token | Used for |
|---|---|---|
| healthy / success | success | healthy report, completed repair, applied migration |
| caution / drift | warning | stale index, schema drift, approximate-count badge |
| broken / data loss risk | error | phantom, missing, failed repair, cross-ref mismatch |
| preview / informational | info | dry-run mode, plan output, "this was logged" notices |
| neutral | gray scale | surfaces, borders, secondary text, code |

**Brand accent, used sparingly.** Otto's pink/purple
(`--otto-primary #E879F9`, `--otto-secondary #A855F7`) is the accent for the
primary action and active nav only. Do not use it as a background gradient or as
status color. Status meaning always comes from the semantic palette above.

**Density overrides (depart from the example defaults):**
- Base font 13 to 14px, not 16. Tables are compact (row height ~32px).
- Tighten spacing toward `--otto-space-xs/sm`. Reserve `lg/xl` for section gaps.
- Monospace (`--otto-font-mono`) for every machine value: keys, identifiers,
  index coordinates, scores, digests, raw commands.
- Status is a small dot plus a text label, never an emoji.
- Provide a dark theme. Map surfaces to gray-900/800, text to gray-100/300,
  borders to gray-700, and keep the same semantic hues. Developers run these
  tools dark; design dark as a peer, not an afterthought.

**Anti-patterns to avoid (these mark generic AI output):**
- Full-bleed gradient backgrounds and oversized hero cards.
- Decorative charts or progress rings where a number or a dense bar is clearer.
- Rounded-everything and heavy drop shadows; prefer 1px gray borders and
  `--otto-radius-sm/md`.
- Emoji status indicators and exclamatory copy. State the fact, color it, move on.

---

## 3. Layout regions

A single scrollable column inside the admin shell, three regions:

1. **Header bar.** Model selector (or "All models"), last-checked timestamp, an
   overall status dot, and the primary action button (Run check / Repair),
   whose label and color follow the current state.
2. **Summary strip.** A compact row of issue counts by type (phantoms, missing,
   stale indexes, orphaned keys, stale participations, cross-ref issues). Each is
   a clickable chip that scrolls to and filters its section. Zero counts render
   muted, nonzero in the semantic color for that issue.
3. **Issue sections.** One collapsible section per audit component
   (Instances, Unique indexes, Multi indexes, Participations, Related fields,
   Cross-references). Each lists its specific items in a dense table with the
   identifiers/keys in monospace and a short reason per row.

---

## 4. States (enumerate and design all of these)

| # | State | Trigger | What the screen shows | Data source |
|---|---|---|---|---|
| 1 | Idle / never run | first load, no cached report | Empty state with a one-line explanation and a single "Run integrity check" button | none |
| 2 | Checking | user runs a check | Progress by phase (instances, indexes, ...), streamed; counts fill in as phases complete; cancel available | audit progress `{phase, current, total}` |
| 3 | Healthy | check completes, no issues | Calm success banner, all summary counts zero/muted, sections collapsed with "0 issues", no Repair button | `health_check` with empty arrays, `healthy: true` |
| 4 | Issues found | check completes with issues | Summary strip lit by type, sections expanded to nonzero items, Repair button enabled (warning/error toned) | `health_check.sample.json` |
| 5 | Count mismatch | timeline vs scan differ | A distinct callout: "timeline 1284, scan 1282, 2 phantoms" linking to the phantom list | `instances.count_timeline` vs `count_scan` |
| 6 | Dry-run preview | user clicks Repair, preview-first | A diff-style preview of what Repair would change per section, labeled info/preview, with Apply and Cancel | repair with `dry_run: true` |
| 7 | Repairing | user confirms Apply | Live progress feed by phase with per-phase results accumulating; controls locked | `stream_repair.sample.jsonl` |
| 8 | Repaired | repair completes and re-verifies | Success summary of what changed, transitions to Healthy (state 3) on re-check | repair result + `summary` |
| 9 | Partial failure | a repair stage errors | Per-stage outcome list: succeeded stages green, failed stage error with the error and a retry-stage action; other stages unaffected | repair stage errors map |
| 10 | Error / unavailable | audit cannot run | Error banner (connection, missing introspection, etc.) with the reason and a retry | API error |
| 11 | Refused | cross-database or unsafe scope | Explanatory notice that the operation is refused and why (e.g. spans logical DBs); no destructive action offered | `CrossDatabaseError` surfaced |
| 12 | Insufficient permission | user lacks `permission:repair` | Report is readable; Repair is hidden or shown disabled with a tier note | auth tier |

States 5, 9, and 11 are the ones designers usually miss. They are where this tool
earns trust, so design them as first-class, not as toasts.

---

## 5. State flow

```
Idle ──Run──> Checking ──┬─ no issues ─> Healthy
                         └─ issues ────> Issues found
Issues found ──Repair──> Dry-run preview ──Apply──> Repairing ──┬─ all ok ──> Repaired ──re-check──> Healthy
                              │                                  └─ stage err > Partial failure ──retry stage──> Repairing
                              └─Cancel──> Issues found
any ──auth/conn/scope problem──> Error | Refused | Insufficient permission
```

Repair is always reached through the dry-run preview. There is no one-click
destructive Repair without a preview step.

---

## 6. Component-state matrix

Design each component in every listed state.

| Component | States to design |
|---|---|
| Status dot + label | healthy, warning, error, checking, unknown |
| Summary count chip | zero (muted), nonzero-warning, nonzero-error, active/selected, loading |
| Issue section header | collapsed, expanded, 0 items, N items, repairing-this-section, fixed |
| Issue row | normal, monospaced id, with reason, selected for drill-down, being repaired, repaired (struck/faded), failed |
| Count-mismatch callout | hidden (counts match), shown (delta + link) |
| Primary action button | Run check, Checking (spinner+cancel), Repair (preview), Apply (confirm), Repairing (locked), disabled (no permission) |
| Dry-run preview panel | per-section additions/removals, empty (nothing to do), info-toned |
| Progress feed | streaming line append, per-phase result, done summary, stalled/cancelled |
| Banner | healthy, issues, repaired, error, refused, insufficient-permission |
| Confirm dialog (Apply) | default, with record-count impact, irreversible-warning variant |

---

## 7. Interaction details

- **Dry-run then apply** is the spine. Repair opens the preview (state 6). Apply
  requires a confirm that states the impact ("removes 2 phantoms, rebuilds 1
  index, affects ~1,284 records"). This same preview/apply pattern is reused by
  migrations and destructive record actions, so make it a recognizable, shared
  component.
- **Progress streams, never blocks.** States 2 and 7 consume a server-sent event
  feed (`stream_repair.sample.jsonl` is the exact shape). Append phase lines as
  they arrive, show a per-phase bar from `current/total`, and accumulate results.
  No modal spinner that hides until done.
- **Drill-down.** Clicking a summary chip filters to that issue type. Clicking an
  issue row reveals context (the offending key, what it points to vs what it
  should, a link to the record where one exists). Phantoms link to the timeline
  entry; cross-ref mismatches show points_to vs actual side by side.
- **Per-stage retry.** On partial failure (state 9), each repair stage is
  independent. Succeeded stages stay done; only the failed stage offers retry.
- **Cancel.** Checking and Repairing both offer cancel. Cancel during repair must
  be safe to message ("completed stages are already applied").

---

## 8. Data bindings (what feeds what)

| UI element | Field in fixtures |
|---|---|
| Overall status dot | `health_check.healthy` |
| Last-checked time | `health_check.checked_at` |
| Summary chips | `health_check.summary.by_type` |
| Count-mismatch callout | `instances.count_timeline`, `instances.count_scan`, `instances.phantoms` |
| Instances section | `instances.phantoms`, `instances.missing` |
| Unique-index section | `unique_indexes[].stale`, `.missing` |
| Multi-index section | `multi_indexes[].stale_members`, `.orphaned_keys` |
| Participations section | `participations[].stale_members[]` (identifier, collection_key, reason) |
| Cross-references section | `cross_references.in_instances_missing_unique_index`, `.index_points_to_wrong_identifier[]` |
| Repairing progress | each line of `stream_repair.sample.jsonl` |
| Repaired summary | final `done` event `summary` |

---

## 9. Accessibility and keyboard

- Status is never color-only. Always pair the semantic color with a dot shape and
  a text label, and meet contrast in both light and dark themes.
- Keyboard-first: run check, repair, confirm, cancel, expand/collapse sections,
  and move between issue rows all reachable without a mouse. This is an operator
  tool; power users live on the keyboard.
- The progress feed is a live region announced politely, so screen readers hear
  phase completion without being flooded per line.
- Confirm dialogs trap focus and default to the safe action (Cancel), especially
  the irreversible variant.
