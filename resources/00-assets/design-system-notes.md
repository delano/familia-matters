# ~/Documents/Claude/Projects/Dev/familia-admin/design-system-notes.md

Company name and blurb (or name of design system)

Familia Admin Design System
A model-aware web admin for applications built on Familia (a Ruby object layer over Redis/Valkey), served via the Otto framework. This is a developer and operator tool, not a consumer product: dense, keyboard-first, dark-theme-first, with monospace for all machine values (keys, identifiers, scores, digests, commands). It extends Otto's design tokens (semantic palette, gray scale, SF Mono) at power-user density. Otto's pink/purple is a sparing accent for primary actions and active nav only, never a background. Status color always carries meaning: green healthy, amber caution, red broken, blue preview.

Any other notes?

Density: base 13 to 14px, ~32px table rows, tight spacing. Depart from consumer-spaced defaults.
Dark theme is the default; light is a peer. Map surfaces to gray-900/800, text to gray-100/300, borders to gray-700.
Use the semantic tokens, not raw hex: healthy=success, caution/drift=warning, broken/missing/phantom=error, dry-run/preview=info.
Monospace every identifier, key, score, coordinate, and command.
Reserve pink/purple as a small accent. No gradient backgrounds, no oversized hero cards, no decorative charts, no emoji status.
Status is never color-only: pair a colored dot with a text label, meet contrast in both themes.
Recurring pattern: dangerous actions (repair, migrate, destroy, reveal) preview as a dry-run, then a confirm with impact, then apply. Make this one shared, recognizable component.
Long operations stream progress (phase by phase), they do not block on a spinner.
Tokens live in design-tokens.css in the linked folder; use the --admin-* and --otto-* variables.
