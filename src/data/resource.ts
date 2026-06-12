// src/data/resource.ts
//
// The shared resource-state vocabulary for every screen's data layer, and the
// single mapping from an ApiOutcome failure to a renderable ResourceError.
//
// Design rule (plan §6 T7): there is NO offline fallback anywhere in this
// layer. A failed fetch is a failed fetch — it becomes an explicit error state
// the operator cannot miss, never seed data, never a stale mirror. An operator
// acting on fabricated records during an outage is an incident-on-incident.

import type { ApiOutcome } from '../types'

/** The phases every screen-level resource moves through. No fourth option. */
export type ResourceState<T> =
  | { phase: 'loading' }
  | { phase: 'ready'; data: T }
  | { phase: 'error'; error: ResourceError }

export type ResourceErrorKind =
  /** Network throw or unparseable response: the backend did not answer. */
  | 'unreachable'
  /** 401 mid-session. The reauth overlay is already opening (callOutcome side effect). */
  | 'unauthenticated'
  /** 403: authorization refused (read_only, command_blocked, missing permission). */
  | 'forbidden'
  /** Any other non-2xx with a status (400 scan_unavailable, 404, 409 record_exists, 5xx). */
  | 'http'

export interface ResourceError {
  kind: ResourceErrorKind
  /** HTTP status, when one was received. */
  status?: number
  /**
   * The server's machine-readable error code — the `error` string from the
   * response body (e.g. 'read_only', 'scan_unavailable', 'command_blocked',
   * 'record_exists'). This is what screens switch on.
   */
  code?: string
  /** The full parsed body for auxiliary fields (e.g. `required_tier`). */
  body?: unknown
}

/** A failed ApiOutcome (the discriminant for toResourceError's input). */
export type ApiFailure = Exclude<ApiOutcome<never>, { ok: true }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Extract the machine-readable `error` code from a parsed body, if any. */
export function errorCode(body: unknown): string | undefined {
  if (isRecord(body) && typeof body.error === 'string') return body.error
  return undefined
}

/** Map a failed ApiOutcome onto the renderable ResourceError union. */
export function toResourceError(outcome: ApiFailure): ResourceError {
  switch (outcome.reason) {
    case 'unauthenticated':
      return { kind: 'unauthenticated', status: 401 }
    case 'forbidden':
      return {
        kind: 'forbidden',
        status: 403,
        code: errorCode(outcome.body) ?? outcome.message,
        body: outcome.body,
      }
    default:
      // reason 'error': a present status means the backend answered with a
      // non-2xx; an ABSENT status is the backend-unreachable signal (network
      // throw or unparseable body) — see ApiOutcome in ../types.ts.
      if (outcome.status === undefined) return { kind: 'unreachable' }
      return {
        kind: 'http',
        status: outcome.status,
        code: errorCode(outcome.body),
        body: outcome.body,
      }
  }
}
