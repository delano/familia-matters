/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Vite build (src/) is the real admin SPA. In dev it runs on Vite's own
// port, so /admin/api is proxied to the Ruby/Otto backend (config.ru, default
// :9292). The session cookie stays same-origin, so it flows without
// credentials:'include'. The proxy only matters for `vite dev`; in production
// the build is served same-origin by the backend.
export default defineConfig({
  // Served by the Ruby app under /login (rack_app.rb login_app): assets must
  // resolve against that prefix in both the build and the dev server.
  base: '/login/',
  plugins: [react()],
  server: {
    proxy: {
      '/admin/api': {
        target: process.env.FAMILIA_ADMIN_BACKEND ?? 'http://127.0.0.1:9292',
        changeOrigin: false,
      },
    },
  },
  test: {
    // The real admin SPA lives under src/. Scope the runner there so the
    // rejected prototype suites under resources/01-designs/prototype (governed
    // by vite.config.prototypes.ts) are not collected by the main pipeline.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
