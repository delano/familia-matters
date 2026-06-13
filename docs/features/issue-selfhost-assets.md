> **Status: superseded (closed) — #23 / T7.** This issue tracked replacing the
> prototype's runtime CDN dependencies (unpkg React/ReactDOM/Babel-standalone and a
> Google Font) with a self-hosted Vite build. T7 made the Vite SPA under `src/` the
> entire frontend: it bundles React locally via Vite (no CDN, no in-browser Babel)
> and the backend serves hashed local assets same-origin. The goal is met for the
> production frontend; the prototype HTML/JSX enumerated below is archived under
> `resources/archive/01-designs/`. No action remains; kept as a record.

## Problem Statement

Every design/prototype HTML entrypoint loads React, ReactDOM, and Babel standalone from `unpkg.com` at runtime and transpiles JSX in-browser via `type="text/babel"`. A stylesheet also pulls a Google Font at runtime. These are hard runtime dependencies on third-party CDNs (availability, privacy, supply-chain, and compliance concerns) and are unsuitable for a self-hosted admin tool. We want all third-party assets discovered and replaced with local, self-hosted assets produced by a Vite 8+ build, eliminating external runtime fetches.

## Early Diagnosis

Six HTML files under `resources/01-designs/` each pin three unpkg scripts (react@18.3.1, react-dom@18.3.1, @babel/standalone@7.29.0) and load `.jsx` sources via in-browser Babel. There is no `package.json` or `vite.config` yet, so the work includes standing up a Vite 8+ pipeline, moving the `.jsx` sources into a buildable tree, bundling React locally, and emitting hashed local assets. The in-browser Babel transpile path disappears once Vite compiles JSX at build time. A remote `@import` for the Zilla Slab font (`fonts.googleapis.com`) must be self-hosted as well; the rest of the design-system CSS appears to be local token partials.

## Affected Areas

- [ ] `resources/01-designs/*.html` (6 files) — unpkg `<script>` tags for react/react-dom/@babel + `type="text/babel"` loaders
- [ ] `resources/01-designs/explorer/*.jsx` plus `models/`, `records/`, `migrations/`, `integrity-console/` dirs — JSX sources to compile via Vite
- [ ] `resources/01-designs/_ds/onetime-secret-design-system-*/colors_and_type.css` (line 38) — remote `@import` of Google Fonts (Zilla Slab) to self-host
- [ ] new `package.json` / `vite.config.*` — Vite 8+ build pipeline (does not exist yet)
