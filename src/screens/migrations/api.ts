// src/screens/migrations/api.ts
//
// Typed endpoint layer for the migrations screen, mapping the migration routes
// (lib/familia/admin/api.rb: migration_status, schema_drift, run_migrations,
// rollback) onto ApiOutcome. Every function takes the AdminApi so callers run
// them through useResource / useMutation — never adminApi directly, never raw
// fetch.
//
// Two contract facts the prototype got wrong and this layer encodes:
//   - THERE IS NO MIGRATIONS STREAM. run/rollback are SYNCHRONOUS POSTs that
//     return a {result} hash. The prototype's fake phase animation and its
//     in-browser seed simulator are gone; the "running" state is simply the
//     useMutation 'pending' phase between the POST and its resolution.
//   - When Familia ships NO migration runner, GET /migrations answers
//     {status: null} (api.rb wraps `runner&.status` in `safe {}`, so a nil
//     runner yields a present-but-null status). That is the honest
//     "runner unavailable" signal — not an error — and the screen renders an
//     explicit panel for it. run/rollback against a nil runner instead 400 with
//     {error:'bad_request', message:'migration runner unavailable'}, which the
//     shared ErrorState renders.

import type { AdminApi } from '../../api/client'
import type { ApiOutcome } from '../../types'

/** One migration in the applied history. */
export interface AppliedMigration {
  id: string
  applied_at?: number
  description?: string
  reversible?: boolean
}

/** One not-yet-applied migration. */
export interface PendingMigration {
  id: string
  description?: string
  reversible?: boolean
  dependencies?: string[]
}

/**
 * The migration runner status. `status` is null/absent EXACTLY when Familia
 * ships no migration runner — there is nothing to run, and that is the honest
 * state, not a failure.
 */
export interface MigrationStatus {
  applied?: AppliedMigration[]
  pending?: PendingMigration[]
}

export interface MigrationStatusResponse {
  status?: MigrationStatus | null
}

/** One field-level difference between the stored and current schema digest. */
export interface DriftDifference {
  field: string
  /** 'added' | 'removed' | 'modified' (open set — render unknowns verbatim). */
  change?: string
}

/** Per-model schema drift: stored vs current digest plus the field diff. */
export interface DriftModel {
  model: string
  changed?: boolean
  stored_digest?: string
  current_digest?: string
  differences?: DriftDifference[]
  /** The pending-migration id that would resolve this drift, when one exists. */
  suggested_migration?: string
}

export interface SchemaDrift {
  models?: DriftModel[]
}

export interface SchemaDriftResponse {
  /** null/absent when drift detection is unavailable — the honest empty state. */
  drift?: SchemaDrift | null
}

/** One per-migration line in a run plan (dry-run preview and live results). */
export interface PlanStep {
  id: string
  operation?: string
  from?: string
  to?: string
  estimated_records?: number
  reversible?: boolean
  /** 'enabled' | 'disabled' | boolean — rendered verbatim. */
  backup?: string | boolean
}

/**
 * The {result} hash from a run / dry-run / rollback. The shape is whatever
 * Familia::Migration::Runner returns; the fields below are the ones the
 * fixture documents (dry-run) plus the honest superset the UI renders for a
 * live run. Unknown fields are tolerated — the screen never fabricates any.
 */
export interface MigrationResult {
  dry_run?: boolean
  would_run?: string[]
  plan?: PlanStep[]
  /** Migrations actually applied/rolled-back on a live run. */
  applied?: string[]
  rolled_back?: string[]
  /** Honest completion signals for a stopped/incomplete run. */
  failed?: boolean
  incomplete?: boolean
  failed_phase?: string
  error_code?: string
  records_processed?: number
}

export interface MigrationResultResponse {
  result?: MigrationResult | null
}

const enc = encodeURIComponent

/** GET /migrations (role:admin). status:null ⇒ no migration runner shipped. */
export function migrationStatus(
  api: AdminApi,
): Promise<ApiOutcome<MigrationStatusResponse>> {
  return api.request<MigrationStatusResponse>('/migrations')
}

/** GET /migrations/drift (role:admin). drift:null ⇒ drift detection unavailable. */
export function schemaDrift(
  api: AdminApi,
): Promise<ApiOutcome<SchemaDriftResponse>> {
  return api.request<SchemaDriftResponse>('/migrations/drift')
}

/**
 * POST /migrations/run (permission:run_migrations). A SYNCHRONOUS post that
 * returns {result}; `dryRun` adds ?dry_run=true for the no-write preview. A nil
 * runner answers 400 {error:'bad_request', message:'migration runner unavailable'}.
 */
export function runMigrations(
  api: AdminApi,
  dryRun: boolean,
): Promise<ApiOutcome<MigrationResultResponse>> {
  const path = dryRun ? '/migrations/run?dry_run=true' : '/migrations/run'
  return api.request<MigrationResultResponse>(path, { method: 'POST' })
}

/**
 * POST /migrations/rollback?id= (permission:run_migrations). Synchronous;
 * returns {result}. A nil runner answers the same 400 as run.
 */
export function rollbackMigration(
  api: AdminApi,
  id: string,
): Promise<ApiOutcome<MigrationResultResponse>> {
  return api.request<MigrationResultResponse>(
    `/migrations/rollback?id=${enc(id)}`,
    { method: 'POST' },
  )
}

/**
 * A run result is "stopped/incomplete" when the runner explicitly says so. We
 * never INFER failure from missing fields — only an explicit flag/code counts,
 * so a clean synchronous success is never mislabeled as partial.
 */
export function isIncompleteResult(result: MigrationResult): boolean {
  return (
    result.failed === true ||
    result.incomplete === true ||
    typeof result.failed_phase === 'string' ||
    (typeof result.error_code === 'string' && result.error_code.length > 0)
  )
}
