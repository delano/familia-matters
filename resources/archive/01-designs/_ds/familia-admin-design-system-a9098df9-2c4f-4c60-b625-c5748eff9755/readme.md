# Familia Admin Design System

A model-aware web admin for applications built on **Familia** — a Ruby object
layer over Redis/Valkey — served via the **Otto** framework. This is a
developer and operator tool, not a consumer product: dense, keyboard-first,
dark-theme-first, with monospace for every machine value (keys, identifiers,
scores, digests, commands).

The admin extends Otto's design tokens (semantic palette, gray scale, SF Mono)
at power-user density. Otto's pink/purple is a sparing accent for primary
actions and active nav only — never a background wash.

> Status color always carries meaning:
> green = healthy · amber = caution · red = broken · blue = preview.

---

## Sources

| Source | Path / link | Purpose |
| --- | --- | --- |
| Codebase | `familia-admin/` (locally mounted, read-only) | Otto routes, descriptor reflection, fixture JSON |
| Tokens | `familia-admin/design-tokens.css` | The canonical token set we extend |
| Notes  | `familia-admin/design-system-notes.md` | The brief that produced this system |
| Fonts  | `uploads/Caskaydia Cove …`, `uploads/agave …` | Nerd-Font binaries used for UI and mono |

The admin API is described in `familia-admin/routes` and the reflection
contract in `familia-admin/lib/familia/admin/descriptor.rb`. Sample payloads
(integrity report, migration plan, record list, repair stream) live in
`familia-admin/fixtures/`.

---

## Index

```
styles.css                     ← global entry-point (only @import lines)
tokens/
  fonts.css                    ← @font-face for Caskaydia Cove + Agave (Nerd Font)
  colors.css                   ← --otto-* + --admin-* color tokens (light + dark)
  typography.css               ← size scale, weights, line-height
  spacing.css                  ← space scale, row heights, radii, shadows, motion
  reset.css                    ← minimal element reset
assets/
  fonts/                       ← shipped font binaries
  logo/                        ← brand marks
guidelines/                    ← specimen cards (Type, Colors, Spacing, Brand)
components/
  core/                        ← Button, IconButton, Badge, StatusDot, Kbd, …
  forms/                       ← Input, Select, Checkbox, Switch
  data/                        ← DataTable, KeyValue, FieldChip, CountPair
  feedback/                    ← Toast, Banner, ProgressStream, DryRunConfirm
  navigation/                  ← Sidebar, Topbar, Tabs, Breadcrumb
ui_kits/
  familia_admin/               ← the admin itself, click-through
SKILL.md                       ← Agent-Skills entry point
readme.md                      ← this file
```

---

## Design rules at a glance

- **Density.** Base 13 px, 32 px table rows, 8 px gutters. Tightness is the
  point — operator throughput beats whitespace.
- **Dark-default.** Surfaces map to gray-900/800, text to gray-100/300,
  borders to gray-700. Light is a peer theme, not a fallback.
- **Mono everything machine.** Keys, ids, scores, digests, coordinates,
  commands, JSON paths — `var(--admin-mono)`. Never proportional.
- **Status carries meaning.** Use `--admin-status-{healthy,caution,broken,preview}`,
  not raw hex. Pair every colored dot with a text label; never color-only.
- **Sparing accent.** Otto pink/purple is for the primary action in a view
  and the active nav item — that's it.
- **Dangerous actions are three-step.** dry-run → confirm with impact → apply.
  See the `DryRunConfirm` component for the canonical shape.
- **Long ops stream.** Repair and migration runs emit phase-by-phase progress
  (`stream_repair.sample.jsonl`). Never block on a spinner past one second.

---

## Content fundamentals

Voice is **operator-direct**. The reader is a developer who runs production
infrastructure; the admin treats them as a peer, not a customer.

- **Casing.** Sentence case for everything except labels in tables, which
  are `Title Case`. Section headers are `UPPERCASE` only when the page itself
  is reproducing CLI output (e.g. raw command output panes). Eyebrows above
  values are `UPPERCASE TRACKED` (`letter-spacing: 0.08em`).
- **First person.** We use **you** for the operator and **we** for the system
  ("we'll log this reveal"). Never marketing "we" ("Familia helps you …").
  Never first-person plural posing as the operator.
- **Terminology is exact.** `phantom`, `missing`, `stale unique index`,
  `stale multi-member`, `orphaned index key`, `cross-reference drift`,
  `schema drift`, `dry-run`, `repair`, `rollback`. These are the names in
  the codebase; do not invent friendlier synonyms.
- **Numbers are precise.** Show `1,284` not `~1.3k`. When the value is
  approximate (a fast-count from a timeline), label it `≈ 1,284 (timeline)`
  and provide the exact SCAN count next to it.
- **Time is dual.** Absolute timestamp in mono (`2026-06-06 18:13:20 UTC`)
  with a relative shorthand muted next to it (`3m ago`). Never relative
  alone — operators reading a postmortem need the absolute.
- **Commands and keys are quoted in mono.** "Run `repair --dry-run` to
  preview." Inline `customer:cust_8f2a91:object` always wraps in mono.
- **No emoji status.** A colored dot + label, never 🟢/🔴.
- **No marketing copy.** No exclamation marks. No "Welcome to" or
  "🎉 You're all set". The empty state for an integrity check that found
  nothing is "No issues found." — full stop.

Examples (from the codebase):

> `Reveal one encrypted field. Elevated + audited. Returns plaintext once.`
> `Ad-hoc filtering is explicitly expensive.`
> `The descriptor IS the frontend's source of truth.`

---

## Visual foundations

**Type.** [Caskaydia Cove](https://github.com/eliheuer/caskaydia-cove) — a
Nerd-Font build of Microsoft's Cascadia Code — does the whole UI. The
proportional variant carries body text and chrome; the `Mono` variant is
strict monospace and carries every machine value. Agave is shipped as a
condensed alternate for diff/log viewers. Body 13 px / line-height 1.45,
mono 13 px / line-height 1.5. Eyebrows use `letter-spacing: 0.08em`.

**Color.** Otto's neutral 50→900 scale plus four semantic hues
(success, warning, error, info) and one accent (Otto pink). Dark surfaces
are `gray-900` (page) and `gray-800` (cards/tables); light surfaces invert
to white and `gray-50`. Status fills in dark theme are 14–16 % alpha of the
status hue — never the `-light` tints. Accent (pink) appears on at most
one primary button per view and the active nav item.

**Spacing.** Scale: 4 / 8 / 12 / 16 / 24 / 32 / 48. Table rows 32 px.
Card padding 16 px. Section gap 24 px. Page gutter 16 px on the side
sidebar abuts. No generous-spaced consumer paddings.

**Backgrounds.** Flat. No gradients, no images, no patterns. The page
background is a single token (`--admin-bg`). Tables and cards sit on
`--admin-surface`. Hover on a row darkens by one step
(`gray-100` / `gray-700`). Selected rows in dark theme get a 6 % accent
tint, never a full pink fill.

**Borders.** 1 px, `--admin-border-color`. Cards have a single border,
no shadow. Tables use horizontal rules only — no vertical column rules.
Sidebar separates from content with a single 1-px rule.

**Radii.** Subtle. 4 / 6 / 8 px. Pills (`9999px`) only on chips and the
status dot. Nothing in this admin is more rounded than 8 px.

**Shadows.** Reserved for floating UI: popovers (`--otto-shadow-md`),
dialogs (`--otto-shadow-lg`). Cards and rows are flat. No inner shadows.
No "card with soft glow."

**Animation.** Functional only. 90 ms for hover/press state changes,
160 ms for menus opening, 260 ms for dialogs entering. Easing
`cubic-bezier(0.2, 0, 0, 1)`. No bounces, no spring physics, no
decorative loops. The repair-stream progress bar animates by *data
update*, not a timer.

**Hover / press.**
- **Hover** on a row: `--admin-surface-sunken` (one step darker).
- **Hover** on a primary button: `--admin-accent-hover` (Otto pink dark).
- **Press**: no scale transform. The press state is a 1-px inset shadow
  + 4 % darker background. Operators click fast; bouncing buttons feels
  toy-like.
- **Focus**: a two-ring outline — the surface color, then a 2-px Otto
  pink ring at 45 % alpha. Always visible on keyboard focus.

**Transparency / blur.** Used only for the dialog scrim
(`rgba(0,0,0,0.55)` + `backdrop-filter: blur(2px)`). Nowhere else.

**Imagery.** Functional only — code, JSON, key listings, audit-log lines.
No marketing photography. No illustrations. The brand mark is a single
glyph (the `Familia` wordmark + monogram). When we need a "hero" we show
the descriptor as actual JSON.

**Layout rules.** Fixed left sidebar (232 px), fixed top bar (48 px) on
every page. Content scrolls under both. Tables expand to fill; data
columns left-aligned, numeric/score columns right-aligned and mono.
Action column right-most, fixed width.

---

## Iconography

We ship **no proprietary icon font**. The codebase uses inline glyphs from
the Nerd-Font private-use area for terminal UIs; in the web admin we
substitute open-source SVG icons styled to the same visual weight.

- **Primary set:** [Lucide](https://lucide.dev) (1.5 px stroke). Lucide
  matches the Caskaydia Cove stroke weight closely and is CDN-available,
  so we link it rather than vendoring SVGs.
- **Embedding:** Inline `<svg>` with `stroke="currentColor"` so icons
  inherit text color and respect the semantic tokens
  (`color: var(--admin-status-broken)` for an icon in an error row).
- **Sizing:** 14 px for inline (matches mono x-height), 16 px for buttons,
  20 px for the sidebar. Never larger than 20 px in chrome.
- **Status icons.** A colored 8-px dot is always preferred to a colored
  icon. When an icon is needed, pair it with a text label — the dot
  alone is enough in tables.
- **Brand glyph.** A single SVG mark in `assets/logo/`. Used at 20 px in
  the sidebar header, 24 px in the topbar. Never animated.
- **Emoji.** Never. Status uses a dot, not 🟢/🔴; checkmarks use the
  Lucide `check` glyph, not ✅.
- **Unicode-as-icon.** Allowed for keyboard hints (`⌘`, `⌥`, `⇧`, `↵`)
  inside `<kbd>`. Nowhere else.

> **Flagged substitution.** We are using Lucide because no proprietary
> icon font was attached. If Familia/Otto has a canonical icon set, share
> it and we'll swap in.

---

## Foundations

The Design System tab renders every specimen card in `guidelines/`. The
canonical groups are:

- **Type** — display, body, mono, eyebrow, code blocks.
- **Colors** — neutrals, accent, status, theme-mapped surfaces.
- **Spacing** — scale, radii, shadows, row heights, focus ring.
- **Brand** — logo, status pattern, the `[CONCEALED]` / `[REDACTED]` chips.

Each card is a small (~700 × 150 px) standalone HTML file that links
`styles.css` so it renders with the real tokens.

---

## Components

Authored under `components/`. Each is a single self-contained
`<Name>.jsx` with a sibling `<Name>.d.ts` and `<Name>.prompt.md`. The
bundler exposes them on `window.FamiliaAdminDesignSystem_<hash>` —
see `check_design_system` for the live namespace.

| Group | Components |
| --- | --- |
| core | `Button`, `IconButton`, `Badge`, `StatusDot`, `Kbd`, `Tag`, `Mono` |
| forms | `Input`, `Select`, `Checkbox`, `Switch` |
| data | `DataTable`, `KeyValue`, `FieldChip`, `CountPair` |
| feedback | `Toast`, `Banner`, `ProgressStream`, `DryRunConfirm` |
| navigation | `Sidebar`, `Topbar`, `Tabs`, `Breadcrumb` |

The signature primitive of this system is `DryRunConfirm`. Every
destructive action in the admin (repair, migrate, destroy, reveal) goes
through the same three-step shape — dry-run preview → confirm with
impact → apply — and `DryRunConfirm` is what renders it.

---

## UI kits

`ui_kits/familia_admin/` is the admin itself, recreated click-through:
sidebar nav, model list, integrity console with live repair stream,
migration drift card with dry-run, and the records browser with the
masked-field reveal flow.

---

## Caveats and known substitutions

- **Lucide for icons.** No proprietary icon set was attached. We're
  using Lucide via CDN. Swap in if you have one.
- **Sans-serif body face.** No proportional UI font was attached. We're
  using the proportional Caskaydia Cove (humanized Cascadia) as the body
  face, which keeps the entire system on one Nerd-Font family. If you
  prefer a true sans (Inter, SF Pro, system-ui), it's a one-line change
  in `tokens/typography.css`.
- **Light theme** is implemented as a peer but the screens are tuned for
  dark. Light gets the same density and the same components; we just
  haven't done a contrast sweep on every state.
