// src/router/hashRouter.ts
//
// A dependency-free hash router for the admin SPA. Hash routing is a
// deliberate choice, not a shortcut:
//   - The build is served under a base prefix (vite base '/login/', see
//     vite.config.ts); fragment routes work under ANY base without the server
//     having to rewrite unknown paths to index.html.
//   - Reloads and bookmarks resolve to the same served document, so the
//     rack_app session-gate redirect keeps working unchanged.
//   - The route lives in the fragment, which never leaves the browser — no
//     record ids or query values leak into server/tunnel access logs.
//
// The router is two pieces: a pure hash -> path normalizer (unit-testable)
// and a hook subscribed to `hashchange`. Navigation is plain anchors
// (`<a href="#/records">`) so the browser history just works.

import { useEffect, useState } from 'react'

/**
 * Normalize a location.hash value to an absolute route path.
 *   ''            -> '/'
 *   '#'           -> '/'
 *   '#/records'   -> '/records'
 *   '#records'    -> '/records'
 *   '#/records/'  -> '/records'
 */
export function pathFromHash(hash: string): string {
  let path = hash.startsWith('#') ? hash.slice(1) : hash
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path
}

/** The href for a route path, for use in anchors. */
export function routeHref(path: string): string {
  return `#${path}`
}

/** Subscribe to the current hash route. */
export function useHashRoute(): string {
  const [path, setPath] = useState(() => pathFromHash(window.location.hash))

  useEffect(() => {
    const onHashChange = (): void => setPath(pathFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    // The hash may have changed between the first render and the subscription.
    onHashChange()
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return path
}
