// src/screens/explorer/api.ts
//
// Typed endpoint layer for the Explorer screen, mapping the /raw/* routes
// (lib/familia/admin/api.rb) onto ApiOutcome. Every function takes the AdminApi
// so callers run them through useResource / useMutation — never adminApi
// directly, never raw fetch.
//
// Deliberate absences (the point of the T5 corrections):
//   - There is NO `force` and NO tier-escalation parameter anywhere. The real
//     backend allowlist has no override: a blocked command returns 403
//     command_blocked and that is terminal. This client cannot express a force.
//   - There is no live-command stream. The backend removed it (T5); the screen
//     does not fake one.
//
// The backend walks the keyspace with SCAN only (never KEYS): scanning starts at
// cursor '0', the response carries the next cursor, and a returned cursor of the
// string '0' means the scan is complete.

import type { AdminApi } from '../../api/client'
import type { ApiOutcome } from '../../types'

const enc = encodeURIComponent

/** One row from a SCAN page: the key, its Redis type, ttl, and — when the key
 * is a model object — the model name + record id the inspector can bridge on. */
export interface ScanKey {
  key: string
  /** Redis type: string | list | set | zset | hash. */
  type: string
  /** TTL in seconds; -1 (or absent) for a persistent key. */
  ttl?: number
  /** Present when the key is a model object hash. */
  model?: string
  /** The model record id, present alongside `model`. */
  id?: string
}

/**
 * GET /raw/keys?pattern=&type=&cursor= (role:admin). One SCAN page. `cursor`
 * is the NEXT cursor to pass back; the string '0' means the scan is complete.
 * `scanned` is how many keys the server walked this page, `matched` how many
 * passed the MATCH glob + type filter.
 */
export interface ScanPage {
  keys?: ScanKey[]
  /** Next cursor (string). '0' (or absent) means the scan is complete. */
  cursor?: string
  scanned?: number
  matched?: number
}

/** GET /raw/key?key= : a key's full inspection. `value` is type-dependent and
 * narrowed by ../explorer/format.ts — never trusted blindly here. */
export interface KeyInspection {
  key: string
  /** Redis type: string | list | set | zset | hash. */
  type: string
  ttl?: number
  db?: number
  /** Serialized memory footprint in bytes. */
  memory?: number
  /**
   * Type-dependent value: string→string; list→array (first 25); set→array;
   * zset→array of [member, score] pairs; hash→object (encrypted fields masked
   * '[CONCEALED]' by the backend). Narrowed at render time.
   */
  value?: unknown
  model?: string
  id?: string
}

/** GET /raw/info : a parsed subset of Redis/Valkey INFO, grouped into sections.
 * Every section is a flat map of string→string (the parsed INFO fields). */
export interface ServerInfo {
  server?: Record<string, unknown>
  memory?: Record<string, unknown>
  clients?: Record<string, unknown>
  stats?: Record<string, unknown>
  /** Per-database keyspace lines, e.g. { db0: 'keys=1330,expires=...' }. */
  keyspace?: Record<string, unknown>
}

/**
 * POST /raw/command (permission:raw_command). The backend allowlists READ-ONLY
 * commands only and 403s the rest with command_blocked. `truncated:true` flags
 * an oversized collection result the backend capped.
 */
export interface CommandResult {
  cmd?: string
  args?: unknown[]
  result?: unknown
  /** Always false from the real backend — there is no simulation. */
  simulated?: boolean
  /** true when an oversized collection result was capped server-side. */
  truncated?: boolean
}

/** One SCAN page. `cursor` starts at '0'; pass back the response cursor to page. */
export function scanKeys(
  api: AdminApi,
  pattern: string,
  type: string,
  cursor: string,
): Promise<ApiOutcome<ScanPage>> {
  return api.request<ScanPage>(
    `/raw/keys?pattern=${enc(pattern)}&type=${enc(type)}&cursor=${enc(cursor)}`,
  )
}

/** Inspect a single key. 404 not_found for a missing key. */
export function inspectKey(api: AdminApi, key: string): Promise<ApiOutcome<KeyInspection>> {
  return api.request<KeyInspection>(`/raw/key?key=${enc(key)}`)
}

/** The parsed INFO subset. */
export function serverInfo(api: AdminApi): Promise<ApiOutcome<ServerInfo>> {
  return api.request<ServerInfo>('/raw/info')
}

/**
 * Run one allowlisted, read-only command. A blocked command returns 403
 * command_blocked (with required_tier) — surfaced honestly by the caller, never
 * forced. A runtime error returns 400 bad_request (command failed: …).
 */
export function runCommand(
  api: AdminApi,
  cmd: string,
  args: string[],
): Promise<ApiOutcome<CommandResult>> {
  return api.request<CommandResult>('/raw/command', {
    method: 'POST',
    body: JSON.stringify({ cmd, args }),
  })
}
