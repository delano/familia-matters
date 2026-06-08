import { defineConfig } from 'vite';

// The admin reuses the design system's pre-compiled component bundle
// (public/vendor/ds-bundle.js), which expects a single global `React`. To keep
// exactly one React instance shared between that bundle, ReactDOM, and our
// screen modules, React/ReactDOM are loaded as classic UMD scripts in index.html
// and consumed as globals — so we never import or bundle a second copy. JSX is
// compiled ahead of time to classic `React.createElement` calls against that
// global, which is why there is no @vitejs/plugin-react here.
export default defineConfig({
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
  server: {
    port: 5173,
    // The SPA calls the real Otto/Familia admin API; proxy it to the Ruby
    // server (bin/server, default :9292) so dev runs same-origin.
    proxy: {
      '/admin/api': {
        target: process.env.ADMIN_API_TARGET || 'http://127.0.0.1:9292',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});
