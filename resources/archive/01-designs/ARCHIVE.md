# Archived: Claude Design prototype

This directory is the original high-fidelity, interactive prototype produced in
Claude Design from the UI design study (`docs/early-designs/familia-admin-ui-design.md`)
and the integrity console spec. It is **kept only as a historical design
reference**.

It is no longer built or served. The production frontend is the Vite + React +
TypeScript SPA under `src/`, which the Ruby backend serves at `/login` and, behind
the session cookie, at the web root. T7 (#23) ported every screen — Records,
Models, Integrity, Migrations, Explorer — into that SPA and retired this
prototype, closing "the seam" between the prototype and production.

What this prototype was:

- `*.html` — per-screen entrypoints that loaded React/ReactDOM/Babel from a CDN
  and transpiled JSX in the browser. The `Familia Admin.html` shell hosted a
  single simulator backend and swapped screen iframes over `postMessage`.
- `prototype/` — the in-browser simulator (`backend.js`, `seed.js`) and the
  `backend-client.js` transport shim. The SPA replaced this with real REST calls
  to `/admin/api/*`, so the shim and its tests are obsolete.
- Per-screen dirs (`models/`, `integrity-console/`, `migrations/`, `explorer/`,
  `records/`) — the `.jsx` components the SPA screens were ported from. Useful as
  a layout/UX reference; the transport, offline mirrors, and `window.*` seed
  globals they used do **not** exist in the SPA.
- `_ds/` — extracted Claude Design design systems; the SPA's tokens live in
  `src/styles.css` (copied from `resources/00-assets/design-tokens.css`).

The HTML shells will not run as-is: they referenced a `dist/` bundle that the
removed `build:prototypes` pipeline produced. Treat everything here as read-only
history.
