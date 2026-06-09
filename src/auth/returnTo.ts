// src/auth/returnTo.ts
//
// Post-login handoff target, parsed from the gateway redirect's query string.
//
// The server gate (lib/familia/admin/rack_app.rb) sends unauthenticated browsers
// to /login?return_to=<original path>. After authentication the SPA hands the
// operator back to that location. Because return_to round-trips through an
// attacker-visitable URL, it is an open-redirect vector: only same-origin
// absolute paths are honored, and anything else falls back to '/'.

/**
 * The sanitized handoff target from a location search string, or null when no
 * `return_to` parameter is present (a direct visit to /login — no handoff).
 */
export function handoffTarget(search: string): string | null {
  const raw = new URLSearchParams(search).get('return_to')
  if (raw === null) return null
  return sanitizeReturnTo(raw)
}

/**
 * Constrain a raw return_to value to a same-origin absolute path.
 *
 * Must start with exactly one '/', and the second character must not be '/'
 * or '\' — browsers treat both `//host` and `/\host` as protocol-relative
 * URLs, which would navigate off-origin. Schemes (`https:`, `javascript:`)
 * fail the leading-slash test. Anything unsafe falls back to '/'.
 */
export function sanitizeReturnTo(raw: string): string {
  return /^\/(?![/\\])/.test(raw) ? raw : '/'
}
