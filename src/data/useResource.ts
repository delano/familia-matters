// src/data/useResource.ts
//
// The shared data-fetch pattern for every ported screen: one hook holding
// { phase: 'loading' | 'ready' | 'error' } with zero seed state and zero
// offline mirror. A failed fetch becomes a ResourceError for <ErrorState>;
// it is NEVER answered from a cache, a seed, or the previous response.
//
// Auth wiring: every request flows through useAuth().callOutcome, so a 401
// mid-session opens the reauth overlay (the app stays mounted) while this
// hook reports kind:'unauthenticated'. After re-auth the operator retries via
// reload() — nothing auto-replays a request issued under a dead session.

import { useCallback, useEffect, useRef, useState } from 'react'

import type { AdminApi } from '../api/client'
import type { ApiOutcome } from '../types'
import { useAuth } from '../auth/AuthProvider'
import { toResourceError, type ResourceState } from './resource'

export interface UseResourceResult<T> {
  state: ResourceState<T>
  /** Re-run the fetch (returns to 'loading' first — never shows stale data as live). */
  reload(): void
}

/**
 * Fetch a resource through the authenticated API. `fetcher` is read through a
 * ref, so an inline arrow function is fine; the request re-runs when `deps`
 * change (model name, record id, ...) or on reload().
 */
export function useResource<T>(
  fetcher: (api: AdminApi) => Promise<ApiOutcome<T>>,
  deps: readonly unknown[] = [],
): UseResourceResult<T> {
  const { callOutcome } = useAuth()
  const [state, setState] = useState<ResourceState<T>>({ phase: 'loading' })
  const [nonce, setNonce] = useState(0)

  // Live ref: the effect always runs the latest fetcher without the caller
  // having to memoize it (an inline closure would otherwise re-trigger the
  // effect every render).
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    void (async () => {
      const outcome = await callOutcome((api) => fetcherRef.current(api))
      if (cancelled) return
      setState(
        outcome.ok
          ? { phase: 'ready', data: outcome.data }
          : { phase: 'error', error: toResourceError(outcome) },
      )
    })()
    return () => {
      cancelled = true
    }
    // deps are the caller's request parameters; nonce is reload();
    // callOutcome is stable per provider instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, callOutcome])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return { state, reload }
}
