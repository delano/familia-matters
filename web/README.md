# Familia Admin — web UI

The operator console UI for the admin: a dense, dark-theme-first, keyboard-first
SPA (model browser, records browser with masked-field reveal, the integrity
console with live repair stream, the migration cockpit, and the raw key
explorer). It is the implementation of the `Familia Admin.html` design.

## What's here

- `src/styles/` — the design-system tokens (colours, type, spacing, reset) and
  fonts, verbatim from the design handoff.
- `public/vendor/` — React + ReactDOM (UMD) and the pre-compiled design-system
  component bundle (`ds-bundle.js`), loaded as classic scripts so the bundle and
  the app share one global `React`.
- `src/{records,models,integrity,migrations,explorer}/` — the five screens
  (components, stores, icons, fixtures) as ES modules.
- `src/backend/familia-backend.js` — **the real backend client.** It replaces
  the design tool's in-browser simulator: every screen's
  `window.familiaBackend.request(envelope)` is mapped to the real Otto/Familia
  HTTP API (`/admin/api/...`). 4xx errors are surfaced to the screens (so the
  No-perm flow works); 5xx/network errors fall back to each screen's seed.

## Running against the real backend

```bash
# 1) start the API (repo root)
bin/seed && bin/server          # http://127.0.0.1:9292

# 2) start the SPA (here) — /admin/api is proxied to the API (see vite.config.js)
npm install
npm run dev                     # http://127.0.0.1:5173
```

The client authenticates with a bearer token (default `dev-admin-token`). Set a
real token with `window.FAMILIA_ADMIN_TOKEN = '...'` or
`window.familiaBackend.setToken('...')`.

## Status

The design system, fonts, the five screens, and the real-backend client are in
place. The remaining frontend step is assembling the SPA entry (a per-screen
module barrel + the shell that swaps screens by hash route + `main.jsx`), plus
the small per-screen `App.jsx` edits to route navigation through the shell and
lift theme state. That assembly is mechanical and documented in the design
handoff (`docs/`). The substantive, tested deliverable in this repository is the
real Ruby backend the UI talks to (see the top-level `README.md`).
