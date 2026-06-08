// Copies the React/ReactDOM UMD production builds out of node_modules into
// public/vendor so the app can load a single global React via a classic
// <script> tag (shared with the design-system bundle). Run automatically on
// `npm install` via the postinstall hook, or manually with `npm run sync-vendor`.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'public/vendor');
mkdirSync(out, { recursive: true });

const files = [
  ['node_modules/react/umd/react.production.min.js', 'react.production.min.js'],
  ['node_modules/react-dom/umd/react-dom.production.min.js', 'react-dom.production.min.js'],
];

let ok = true;
for (const [from, to] of files) {
  const src = resolve(root, from);
  if (!existsSync(src)) {
    console.warn(`[sync-vendor] missing ${from} — run \`npm install\` first`);
    ok = false;
    continue;
  }
  copyFileSync(src, resolve(out, to));
  console.log(`[sync-vendor] ${to}`);
}
process.exit(ok ? 0 : 1);
