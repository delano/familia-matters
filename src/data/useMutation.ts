// src/data/useMutation.ts
//
// The write-side companion to useResource: screens run create/update/destroy/
// reveal calls through this hook and get back either the response data or an
// explicit ResourceError to render with <ErrorState> — never a silent failure.
// The 401 side effect rides on callOutcome (reauth overlay opens, app stays
// mounted); every other failure (403 read_only, 409 record_exists, 400, network)
// lands in `state.error` for the caller's inline, unmissable rendering.

import { useCallback, useState } from 'react'

import type { AdminApi } from '../api/client'
import type { ApiOutcome } from '../types'
import { useAuth } from '../auth/AuthProvider'
import { toResourceError, type ResourceError } from './resource'

export type MutationState =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'error'; error: ResourceError }

export interface UseMutationResult {
  state: MutationState
  /**
   * Run one mutating call. Resolves to the response data on success, or null
   * on any failure (the failure is in `state.error`, not swallowed).
   */
  run<T>(fn: (api: AdminApi) => Promise<ApiOutcome<T>>): Promise<T | null>
  /** Clear an error state (e.g. when the operator edits the form again). */
  reset(): void
}

export function useMutation(): UseMutationResult {
  const { callOutcome } = useAuth()
  const [state, setState] = useState<MutationState>({ phase: 'idle' })

  const run = useCallback(
    async <T,>(fn: (api: AdminApi) => Promise<ApiOutcome<T>>): Promise<T | null> => {
      setState({ phase: 'pending' })
      const outcome = await callOutcome(fn)
      if (outcome.ok) {
        setState({ phase: 'idle' })
        return outcome.data
      }
      setState({ phase: 'error', error: toResourceError(outcome) })
      return null
    },
    [callOutcome],
  )

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  return { state, run, reset }
}
