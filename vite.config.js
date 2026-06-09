import { resolve } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { defineConfig } from 'vite';

const designsDir = resolve(__dirname, 'resources/01-designs');

const appDirs = ['explorer', 'integrity-console', 'migrations', 'models', 'records'];

const input = {};
for (const dir of appDirs) {
  const full = resolve(designsDir, dir);
  for (const file of readdirSync(full)) {
    if (file.endsWith('.jsx') && statSync(resolve(full, file)).isFile()) {
      const name = `${dir}/${file.replace(/\.jsx$/, '')}`;
      input[name] = resolve(full, file);
    }
  }
}

export default defineConfig({
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
  build: {
    outDir: resolve(designsDir, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input,
      output: {
        entryFileNames: '[name].js',
        format: 'es',
      },
    },
    minify: false,
    sourcemap: false,
  },
});
