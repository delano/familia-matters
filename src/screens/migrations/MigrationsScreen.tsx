// src/screens/migrations/MigrationsScreen.tsx
//
// The migrations screen. Reads the runner status (/migrations) and schema
// drift (/migrations/drift) through useResource, and runs the dry-run / run /
// rollback flow through useMutation. Everything is real REST — there is no
// in-browser simulator, no seed data, no fake phase animation, and NO
// migrations stream (only Integrity's repair has SSE). run and rollback are
// SYNCHRONOUS POSTs that return a {result} hash: the mutation's 'pending' phase
// IS the "running" state, and the resolved result is rendered honestly.
//
// The state the prototype lacked and this screen ADDS: when Familia ships no
// migration runner, GET /migrations returns {status: null}. That is detected
// here and rendered as an explicit "no migration runner" panel — the honest
// state, not an error and not fabricated progress. A failed fetch (network /
// non-2xx) renders the shared ErrorState instead, full stop.

import type React from 'react'
import { useState } from 'react'

import { ErrorState } from '../../components/ErrorState'
import { useAuth } from '../../auth/AuthProvider'
import { useMutation } from '../../data/useMutation'
import { useResource } from '../../data/useResource'
import './migrations.css'
import {
  isIncompleteResult,
  migrationStatus,
  rollbackMigration,
  runMigrations,
  schemaDrift,
  type AppliedMigration,
  type DriftModel,
  type MigrationResult,
  type MigrationStatus,
  type PendingMigration,
  type PlanStep,
} from './api'

const RUN_PERMISSION = 'run_migrations'

/** The in-screen flow over the synchronous run/rollback endpoints. */
type Flow =
  | { name: 'status' }
  /** Dry-run preview rendered; `result` is the {dry_run, would_run, plan}. */
  | { name: 'dryrun'; result: MigrationResult }
  /** Apply succeeded; render the result summary honestly (clean or incomplete). */
  | { name: 'done'; result: MigrationResult; kind: 'run' | 'rollback' }
  /** Rollback confirm pane for one reversible applied migration. */
  | { name: 'rollback'; migration: AppliedMigration }

export function MigrationsScreen(): React.JSX.Element {
  return (
    <section className="migrations-screen" data-testid="screen-migrations">
      <h2 className="screen-title">Migrations</h2>
      <MigrationsBody />
    </section>
  )
}

function MigrationsBody(): React.JSX.Element {
  const status = useResource((api) => migrationStatus(api), [])

  if (status.state.phase === 'loading') {
    return (
      <p className="screen-loading" data-testid="migrations-loading">
        <span className="spinner" aria-hidden="true" /> Loading migration status…
      </p>
    )
  }
  if (status.state.phase === 'error') {
    return <ErrorState error={status.state.error} onRetry={status.reload} />
  }

  // The runner-unavailable contract: a present-but-null `status` means Familia
  // ships no migration runner. This is the honest state, NOT an error — render
  // the explicit panel rather than an empty list that implies "all applied".
  const runner = status.state.data.status
  if (runner === null || runner === undefined) {
    return <NoRunnerPanel />
  }

  return <MigrationsConsole runner={runner} onReloadStatus={status.reload} />
}

// ---------------------------------------------------------------------------

function NoRunnerPanel(): React.JSX.Element {
  return (
    <div
      className="migrations-norunner"
      role="status"
      data-testid="migrations-no-runner"
    >
      <h3>No migration runner</h3>
      <p>
        Familia ships no migration runner; there is nothing to run — this is the
        honest state, not an error and not fabricated progress. Schema drift and
        the apply/rollback flow appear here only when a runner is installed.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface MigrationsConsoleProps {
  runner: MigrationStatus
  onReloadStatus(): void
}

function MigrationsConsole(props: MigrationsConsoleProps): React.JSX.Element {
  const { runner, onReloadStatus } = props
  const { state: authState } = useAuth()
  const permissions =
    authState.status === 'authenticated' ? authState.claims.permissions : []
  const canRun = permissions.includes(RUN_PERMISSION)

  const applied = runner.applied ?? []
  const pending = runner.pending ?? []

  const [flow, setFlow] = useState<Flow>({ name: 'status' })
  const runMutation = useMutation()
  const rollbackMutation = useMutation()

  const backToStatus = (): void => {
    runMutation.reset()
    rollbackMutation.reset()
    setFlow({ name: 'status' })
  }

  /** Preview a run (POST run?dry_run=true). Renders the plan when it resolves. */
  const previewRun = async (): Promise<void> => {
    rollbackMutation.reset()
    const response = await runMutation.run((api) => runMigrations(api, true))
    const result = response?.result
    if (result) setFlow({ name: 'dryrun', result })
  }

  /** Apply the run for real (synchronous POST run). */
  const applyRun = async (): Promise<void> => {
    const response = await runMutation.run((api) => runMigrations(api, false))
    const result = response?.result
    if (result) {
      setFlow({ name: 'done', result, kind: 'run' })
      onReloadStatus()
    }
  }

  /** Roll back one applied migration (synchronous POST rollback?id=). */
  const applyRollback = async (id: string): Promise<void> => {
    const response = await rollbackMutation.run((api) => rollbackMigration(api, id))
    const result = response?.result
    if (result) {
      setFlow({ name: 'done', result, kind: 'rollback' })
      onReloadStatus()
    }
  }

  return (
    <div className="migrations-console" data-testid="migrations-console">
      <MigrationsSummary
        applied={applied.length}
        pending={pending.length}
        canRun={canRun}
        running={runMutation.state.phase === 'pending'}
        flowActive={flow.name !== 'status'}
        onPreviewRun={() => void previewRun()}
        onRefresh={onReloadStatus}
      />

      {!canRun && <NoPermNote />}

      {/* The dry-run / confirm / running / done flow over the run endpoint. */}
      {flow.name === 'dryrun' && (
        <PlanPreview
          result={flow.result}
          pending={pending}
          busy={runMutation.state.phase === 'pending'}
          error={runMutation.state.phase === 'error' ? runMutation.state.error : null}
          canRun={canRun}
          onCancel={backToStatus}
          onApply={() => void applyRun()}
        />
      )}
      {flow.name === 'done' && (
        <ResultSummary result={flow.result} kind={flow.kind} onClose={backToStatus} />
      )}
      {flow.name === 'rollback' && (
        <RollbackConfirm
          migration={flow.migration}
          busy={rollbackMutation.state.phase === 'pending'}
          error={
            rollbackMutation.state.phase === 'error' ? rollbackMutation.state.error : null
          }
          onCancel={backToStatus}
          onRollback={() => void applyRollback(flow.migration.id)}
        />
      )}

      {/* A run-time failure surfaced before any preview/result panel mounts. */}
      {flow.name === 'status' && runMutation.state.phase === 'error' && (
        <ErrorState error={runMutation.state.error} />
      )}
      {flow.name === 'status' && rollbackMutation.state.phase === 'error' && (
        <ErrorState error={rollbackMutation.state.error} />
      )}

      <PendingSection pending={pending} applied={applied} />
      <AppliedSection
        applied={applied}
        canRun={canRun}
        disabled={flow.name !== 'status'}
        onRollback={(m) => {
          rollbackMutation.reset()
          setFlow({ name: 'rollback', migration: m })
        }}
      />
      <DriftSection pending={pending} />
    </div>
  )
}

// ---------------------------------------------------------------------------

interface MigrationsSummaryProps {
  applied: number
  pending: number
  canRun: boolean
  running: boolean
  flowActive: boolean
  onPreviewRun(): void
  onRefresh(): void
}

function MigrationsSummary(props: MigrationsSummaryProps): React.JSX.Element {
  const { applied, pending, canRun, running, flowActive, onPreviewRun, onRefresh } = props
  return (
    <div className="migrations-summary" data-testid="migrations-summary">
      <span className="migrations-counts">
        <Count label="Applied" value={applied} tone="healthy" />
        <Count label="Pending" value={pending} tone={pending > 0 ? 'caution' : 'healthy'} />
      </span>
      <span className="migrations-summary-actions">
        <button type="button" data-testid="migrations-refresh" onClick={onRefresh}>
          Refresh
        </button>
        <button
          type="button"
          className="migrations-run-btn"
          data-testid="migrations-preview-run"
          disabled={!canRun || pending === 0 || running || flowActive}
          title={canRun ? undefined : `requires permission:${RUN_PERMISSION}`}
          onClick={onPreviewRun}
        >
          {running ? 'Working…' : 'Preview run'}
        </button>
      </span>
    </div>
  )
}

function Count(props: { label: string; value: number; tone: string }): React.JSX.Element {
  const { label, value, tone } = props
  return (
    <span className="migrations-count">
      <span className={`migrations-dot migrations-dot--${tone}`} aria-hidden="true" />
      <span className="migrations-count-value">{value}</span>
      <span className="migrations-count-label">{label}</span>
    </span>
  )
}

function NoPermNote(): React.JSX.Element {
  return (
    <p className="migrations-noperm" role="note" data-testid="migrations-noperm">
      Read-only: applying or rolling back a migration requires
      {' '}
      <code>permission:{RUN_PERMISSION}</code>. Status and schema drift are
      readable; run and rollback are disabled for your session. A server-side 403
      would still render the explicit error pane.
    </p>
  )
}

// ---------------------------------------------------------------------------

interface PlanPreviewProps {
  result: MigrationResult
  pending: PendingMigration[]
  busy: boolean
  error: import('../../data/resource').ResourceError | null
  canRun: boolean
  onCancel(): void
  onApply(): void
}

/**
 * The dry-run preview: would_run + per-migration plan. When any planned step is
 * irreversible, an explicit acknowledgement checkbox gates Apply (the
 * confirm state) — there is no down-path, so the operator must opt in.
 */
function PlanPreview(props: PlanPreviewProps): React.JSX.Element {
  const { result, pending, busy, error, canRun, onCancel, onApply } = props
  const [ack, setAck] = useState(false)

  const plan = result.plan ?? []
  const wouldRun = result.would_run ?? []
  const hasIrreversible = plan.some((p) => p.reversible === false)
  // Also treat a pending entry referenced by would_run as irreversible.
  const wouldRunIrreversible = wouldRun.some((id) =>
    pending.some((p) => p.id === id && p.reversible === false),
  )
  const irreversible = hasIrreversible || wouldRunIrreversible
  const applyDisabled = busy || !canRun || (irreversible && !ack)

  return (
    <div
      className="migrations-flow migrations-flow--preview"
      data-testid="migrations-dryrun"
    >
      <div className="migrations-flow-head">
        <span className="migrations-flow-title">Dry-run preview</span>
        <span className="migrations-badge migrations-badge--preview">preview</span>
      </div>
      <p className="migrations-note">
        What a run would change. Nothing has been written.
      </p>

      <div className="migrations-wouldrun" data-testid="migrations-wouldrun">
        <span className="migrations-eyebrow">Would run</span>
        {wouldRun.length === 0 ? (
          <span className="migrations-note">nothing — the schema is fully migrated.</span>
        ) : (
          <ul className="migrations-id-list">
            {wouldRun.map((id) => (
              <li key={id}>
                <code>{id}</code>
              </li>
            ))}
          </ul>
        )}
      </div>

      {plan.length > 0 && (
        <div className="migrations-plan" data-testid="migrations-plan">
          {plan.map((step) => (
            <PlanStepCard key={step.id} step={step} />
          ))}
        </div>
      )}

      {irreversible && (
        <label className="migrations-ack" data-testid="migrations-ack">
          <input
            type="checkbox"
            data-testid="migrations-ack-checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          This run includes an irreversible migration. I understand it cannot be
          rolled back.
        </label>
      )}

      {error && <ErrorState error={error} />}

      <div className="migrations-flow-actions">
        <button
          type="button"
          data-testid="migrations-dryrun-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="migrations-run-btn"
          data-testid="migrations-apply"
          disabled={applyDisabled}
          onClick={onApply}
        >
          {busy ? 'Applying…' : 'Apply run'}
        </button>
      </div>
    </div>
  )
}

function PlanStepCard(props: { step: PlanStep }): React.JSX.Element {
  const { step } = props
  const reversible = step.reversible !== false
  return (
    <div className="migrations-plan-step" data-testid={`migrations-plan-${step.id}`}>
      <div className="migrations-plan-step-head">
        <code>{step.id}</code>
        {step.operation && (
          <span className="migrations-op">{step.operation}</span>
        )}
        <span
          className={`migrations-badge ${
            reversible ? 'migrations-badge--healthy' : 'migrations-badge--broken'
          }`}
        >
          {reversible ? 'reversible' : 'irreversible'}
        </span>
      </div>
      <dl className="migrations-impact">
        {step.from != null && step.to != null && (
          <Impact label="Change" value={`${step.from} → ${step.to}`} />
        )}
        <Impact
          label="Estimated records"
          value={
            typeof step.estimated_records === 'number'
              ? step.estimated_records.toLocaleString('en-US')
              : 'unknown'
          }
        />
        <Impact label="Backup" value={formatBackup(step.backup)} />
      </dl>
    </div>
  )
}

function Impact(props: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="migrations-impact-row">
      <dt>{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  )
}

function formatBackup(backup: PlanStep['backup']): string {
  if (backup === true) return 'enabled'
  if (backup === false) return 'disabled'
  if (typeof backup === 'string') return backup
  return 'unknown'
}

// ---------------------------------------------------------------------------

interface ResultSummaryProps {
  result: MigrationResult
  kind: 'run' | 'rollback'
  onClose(): void
}

/**
 * The honest post-run summary. A clean run renders the applied/rolled-back ids;
 * a runner that reports a stopped/incomplete run renders that explicitly
 * (failed phase, error code) — never a fabricated "done".
 */
function ResultSummary(props: ResultSummaryProps): React.JSX.Element {
  const { result, kind, onClose } = props
  const incomplete = isIncompleteResult(result)
  const ids = kind === 'rollback' ? result.rolled_back ?? [] : result.applied ?? []
  const verb = kind === 'rollback' ? 'Rolled back' : 'Applied'

  return (
    <div
      className={`migrations-flow ${
        incomplete ? 'migrations-flow--broken' : 'migrations-flow--healthy'
      }`}
      data-testid={incomplete ? 'migrations-partial' : 'migrations-done'}
    >
      <div className="migrations-flow-head">
        <span className="migrations-flow-title">
          {incomplete ? 'Migration incomplete' : `${verb} migration${ids.length === 1 ? '' : 's'}`}
        </span>
        <span
          className={`migrations-badge ${
            incomplete ? 'migrations-badge--broken' : 'migrations-badge--healthy'
          }`}
        >
          {incomplete ? result.error_code ?? 'incomplete' : 'done'}
        </span>
      </div>

      {incomplete ? (
        <p className="migrations-note" data-testid="migrations-partial-detail">
          The runner reported a stopped run
          {result.failed_phase ? ` in phase "${result.failed_phase}"` : ''}
          {typeof result.records_processed === 'number'
            ? ` after ${result.records_processed.toLocaleString('en-US')} records`
            : ''}
          . Committed work is unchanged; nothing here is fabricated. Re-run after
          resolving the cause.
        </p>
      ) : (
        <p className="migrations-note">
          {ids.length === 0
            ? 'The runner reported no migrations changed.'
            : `${verb.toLowerCase()}: the runner committed the migrations below.`}
        </p>
      )}

      {ids.length > 0 && (
        <ul className="migrations-id-list" data-testid="migrations-result-ids">
          {ids.map((id) => (
            <li key={id}>
              <code>{id}</code>
            </li>
          ))}
        </ul>
      )}

      <div className="migrations-flow-actions">
        <button type="button" data-testid="migrations-done-close" onClick={onClose}>
          Back to status
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface RollbackConfirmProps {
  migration: AppliedMigration
  busy: boolean
  error: import('../../data/resource').ResourceError | null
  onCancel(): void
  onRollback(): void
}

function RollbackConfirm(props: RollbackConfirmProps): React.JSX.Element {
  const { migration, busy, error, onCancel, onRollback } = props
  const [ack, setAck] = useState(false)

  return (
    <div
      className="migrations-flow migrations-flow--caution"
      role="alertdialog"
      data-testid="migrations-rollback-confirm"
    >
      <div className="migrations-flow-head">
        <span className="migrations-flow-title">Roll back {migration.id}</span>
        <span className="migrations-badge migrations-badge--caution">rollback</span>
      </div>
      <p className="migrations-note">
        Reverts this migration. The model returns to its prior schema and its
        drift entry reopens. This is a synchronous down-migration — the result
        renders when the server responds.
      </p>
      <label className="migrations-ack" data-testid="migrations-rollback-ack">
        <input
          type="checkbox"
          data-testid="migrations-rollback-ack-checkbox"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        I understand this reopens schema drift on the model.
      </label>

      {error && <ErrorState error={error} />}

      <div className="migrations-flow-actions">
        <button
          type="button"
          data-testid="migrations-rollback-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="migrations-destroy-btn"
          data-testid="migrations-rollback-apply"
          disabled={busy || !ack}
          onClick={onRollback}
        >
          {busy ? 'Rolling back…' : 'Roll back'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface PendingSectionProps {
  pending: PendingMigration[]
  applied: AppliedMigration[]
}

function PendingSection(props: PendingSectionProps): React.JSX.Element {
  const { pending, applied } = props
  return (
    <section className="migrations-section" data-testid="migrations-pending">
      <h3 className="migrations-section-title">Pending</h3>
      {pending.length === 0 ? (
        <p className="migrations-note" data-testid="migrations-pending-empty">
          No pending migrations. The schema is fully migrated.
        </p>
      ) : (
        <div className="migrations-cards">
          {pending.map((m) => (
            <PendingCard key={m.id} migration={m} applied={applied} />
          ))}
        </div>
      )}
    </section>
  )
}

function PendingCard(props: {
  migration: PendingMigration
  applied: AppliedMigration[]
}): React.JSX.Element {
  const { migration, applied } = props
  const reversible = migration.reversible !== false
  const deps = migration.dependencies ?? []
  return (
    <div
      className="migrations-card"
      id={`migration-${migration.id}`}
      data-testid={`migrations-pending-${migration.id}`}
    >
      <div className="migrations-card-head">
        <code>{migration.id}</code>
        <span
          className={`migrations-badge ${
            reversible ? 'migrations-badge--healthy' : 'migrations-badge--broken'
          }`}
        >
          {reversible ? 'reversible' : 'irreversible'}
        </span>
      </div>
      {migration.description && (
        <p className="migrations-card-desc">{migration.description}</p>
      )}
      <div className="migrations-deps">
        <span className="migrations-eyebrow">Depends on</span>
        {deps.length === 0 ? (
          <span className="migrations-note">none</span>
        ) : (
          deps.map((d) => {
            const satisfied = applied.some((a) => a.id === d)
            return (
              <span
                key={d}
                className={`migrations-dep ${
                  satisfied ? 'migrations-dep--ok' : 'migrations-dep--wait'
                }`}
              >
                <code>{d}</code>
                <em>{satisfied ? 'applied' : 'pending'}</em>
              </span>
            )
          })
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface AppliedSectionProps {
  applied: AppliedMigration[]
  canRun: boolean
  disabled: boolean
  onRollback(migration: AppliedMigration): void
}

function AppliedSection(props: AppliedSectionProps): React.JSX.Element {
  const { applied, canRun, disabled, onRollback } = props
  return (
    <section className="migrations-section" data-testid="migrations-applied">
      <h3 className="migrations-section-title">Applied</h3>
      {applied.length === 0 ? (
        <p className="migrations-note" data-testid="migrations-applied-empty">
          No migrations applied yet.
        </p>
      ) : (
        <table className="data-table" data-testid="migrations-applied-table">
          <thead>
            <tr>
              <th scope="col">Migration</th>
              <th scope="col">Applied at</th>
              <th scope="col">Reversible</th>
              <th scope="col" aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {applied.map((m) => {
              const reversible = m.reversible === true
              return (
                <tr key={m.id} data-testid={`migrations-applied-${m.id}`}>
                  <td className="cell-mono">
                    <code>{m.id}</code>
                    {m.description && (
                      <span className="migrations-row-desc">{m.description}</span>
                    )}
                  </td>
                  <td className="cell-mono">{formatAppliedAt(m.applied_at)}</td>
                  <td>{reversible ? 'yes' : 'no'}</td>
                  <td className="cell-actions">
                    {reversible && canRun ? (
                      <button
                        type="button"
                        data-testid={`migrations-rollback-${m.id}`}
                        disabled={disabled}
                        onClick={() => onRollback(m)}
                      >
                        Rollback
                      </button>
                    ) : (
                      <span className="migrations-note">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}

function formatAppliedAt(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${new Date(value * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

// ---------------------------------------------------------------------------

interface DriftSectionProps {
  pending: PendingMigration[]
}

function DriftSection(props: DriftSectionProps): React.JSX.Element {
  const { pending } = props
  const drift = useResource((api) => schemaDrift(api), [])

  return (
    <section className="migrations-section" data-testid="migrations-drift">
      <h3 className="migrations-section-title">Schema drift</h3>
      {renderBody()}
    </section>
  )

  function renderBody(): React.JSX.Element {
    if (drift.state.phase === 'loading') {
      return (
        <p className="screen-loading" data-testid="migrations-drift-loading">
          <span className="spinner" aria-hidden="true" /> Loading schema drift…
        </p>
      )
    }
    if (drift.state.phase === 'error') {
      return <ErrorState error={drift.state.error} onRetry={drift.reload} />
    }

    // drift:null ⇒ detection unavailable. Honest panel, not an empty list.
    const payload = drift.state.data.drift
    if (payload === null || payload === undefined) {
      return (
        <p
          className="migrations-note"
          role="status"
          data-testid="migrations-drift-unavailable"
        >
          Drift detection is unavailable — the registry did not report a schema
          digest. Nothing is shown here rather than implying the models are in
          sync.
        </p>
      )
    }

    const models = payload.models ?? []
    if (models.length === 0) {
      return (
        <p className="migrations-note" data-testid="migrations-drift-empty">
          No models reported. The registry returned an empty drift set.
        </p>
      )
    }

    return (
      <div className="migrations-cards">
        {models.map((m) => (
          <DriftCard key={m.model} drift={m} pending={pending} />
        ))}
      </div>
    )
  }
}

function DriftCard(props: {
  drift: DriftModel
  pending: PendingMigration[]
}): React.JSX.Element {
  const { drift, pending } = props
  const changed = drift.changed === true
  const differences = drift.differences ?? []

  if (!changed) {
    return (
      <div
        className="migrations-card migrations-card--insync"
        data-testid={`migrations-drift-${drift.model}`}
      >
        <div className="migrations-card-head">
          <span className="migrations-dot migrations-dot--healthy" aria-hidden="true" />
          <span className="migrations-model">{drift.model}</span>
          <span className="migrations-note">in sync</span>
          {drift.stored_digest && (
            <code className="migrations-digest">{drift.stored_digest}</code>
          )}
        </div>
      </div>
    )
  }

  const suggestedInPending =
    drift.suggested_migration != null &&
    pending.some((p) => p.id === drift.suggested_migration)

  return (
    <div
      className="migrations-card migrations-card--drift"
      data-testid={`migrations-drift-${drift.model}`}
    >
      <div className="migrations-card-head">
        <span className="migrations-model">{drift.model}</span>
        <span className="migrations-badge migrations-badge--broken">
          {differences.length} field{differences.length === 1 ? '' : 's'} drifted
        </span>
      </div>

      <div className="migrations-digests">
        <div className="migrations-digest-cell">
          <span className="migrations-eyebrow">Stored digest</span>
          <code data-testid={`migrations-drift-${drift.model}-stored`}>
            {drift.stored_digest ?? '—'}
          </code>
        </div>
        <span className="migrations-digest-arrow" aria-hidden="true">
          →
        </span>
        <div className="migrations-digest-cell">
          <span className="migrations-eyebrow">Current digest</span>
          <code data-testid={`migrations-drift-${drift.model}-current`}>
            {drift.current_digest ?? '—'}
          </code>
        </div>
      </div>

      <div className="migrations-diff">
        <span className="migrations-eyebrow">Field diff</span>
        {differences.map((d) => (
          <DiffLine key={d.field} field={d.field} change={d.change} />
        ))}
      </div>

      {drift.suggested_migration && (
        <div className="migrations-suggested" data-testid={`migrations-suggested-${drift.model}`}>
          <span className="migrations-eyebrow">Suggested</span>
          {suggestedInPending ? (
            <a
              className="migrations-suggested-link"
              href={`#migration-${drift.suggested_migration}`}
              data-testid={`migrations-suggested-link-${drift.model}`}
            >
              <code>{drift.suggested_migration}</code>
            </a>
          ) : (
            <code>{drift.suggested_migration}</code>
          )}
          <span className="migrations-note">
            {suggestedInPending ? 'in the pending list' : 'not in the pending list'}
          </span>
        </div>
      )}
    </div>
  )
}

function DiffLine(props: { field: string; change: string | undefined }): React.JSX.Element {
  const { field, change } = props
  const sign = change === 'added' ? '+' : change === 'removed' ? '−' : '~'
  const tone =
    change === 'added' ? 'healthy' : change === 'removed' ? 'broken' : 'caution'
  return (
    <div className={`migrations-diff-line migrations-diff-line--${tone}`}>
      <span className="migrations-diff-sign" aria-hidden="true">
        {sign}
      </span>
      <code>{field}</code>
      <span className="migrations-note">{change ?? 'modified'}</span>
    </div>
  )
}
