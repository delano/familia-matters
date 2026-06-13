> **Status: superseded (closed) — #23 / T7.** This issue targeted the prototype's
> "simulated vs live" chip, which derived from the in-browser simulator's
> offline/seed fallback. T7 retired that prototype and rebuilt the frontend as the
> Vite SPA, which has **no simulator and no offline fallback at all**: every
> failed or refused response renders an explicit `ErrorState`
> (`src/components/ErrorState.tsx`), so there is no "simulated" state left to mark.
> The prototype enumerated below is archived under `resources/archive/01-designs/`.
> No action remains; kept as a record.

## Problem Statement

The admin UI signals "simulated" state with a small, low-contrast uppercase label tucked into a panel header or command row. It marks results that came from the offline seed or a guardrail refusal rather than a live Redis/Valkey read. The cue is easy to miss, so an operator can mistake fabricated seed data for real keyspace state. We want a clearer, harder-to-miss indication of simulated vs live — and a defined answer for whether/how the mode can be toggled.

## Early Diagnosis

The `simulated` flag is derived in `store.jsx` (`simulated: res._simulated !== false`); the real backend returns `simulated: false` only for an actually-executed allowlisted read (`api.rb:423`). Everything else — offline fallback, seed reads, guardrail refusals — is simulated. Today the indicator is rendered per-surface (header chip, per-row label) and is inconsistent across screens.

A viewport-level treatment — e.g. a persistent border/frame around the whole app while in simulated/offline mode, similar to the frame shown when Claude controls Chrome — would make the mode unmistakable. Open question to resolve in the issue: is "simulated" a user-facing toggle (explicit demo/seed mode) or purely a reflection of backend reachability? It appears to be the latter today (driven by the `offline` flag in `store.jsx`), so a "toggle" likely means introducing an explicit demo-mode switch distinct from live.

## Affected Areas

- [ ] `resources/01-designs/explorer/store.jsx` — `simulated`/`offline` derivation (lines 131, 137)
- [ ] `resources/01-designs/explorer/App.jsx` — viewport shell; natural home for a frame-level indicator
- [ ] `resources/01-designs/explorer/Console.jsx` — header + per-row simulated chips (lines 32, 177)
- [ ] `resources/01-designs/explorer/RawExplorer.jsx` — header simulated chip (line 213)
- [ ] `resources/01-designs/{models,records,migrations,integrity-console}/*.jsx` — same chip scattered across surfaces; candidates for a shared/global treatment
