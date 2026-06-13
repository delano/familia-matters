// src/screens/integrity/IntegrityScreen.tsx
//
// The Integrity screen (the hero feature: fsck for the object graph). It is
// model-aware off /_meta (models[].model), checks a model's health over REST,
// previews a repair with a dry run, and APPLIES a repair over a REAL
// EventSource (openRepairStream) so per-phase progress animates live as the
// server streams it — there is NO setTimeout fake animation, NO seed data, NO
// window.* simulator, and NO offline fallback. Every read/write goes through
// useResource / useMutation; the stream goes through openRepairStream and
// respects its no-reconnect / close-on-terminal discipline (the helper owns
// that — this screen never opens its own EventSource).
//
// States map to REAL outcomes, not a preview switcher:
//   issues     summary.total_issues > 0 → the 5 sections + summary strip
//   healthy    total_issues === 0       → an explicit "no issues" state
//   dryrun     POST repair?dry_run=true  → the preview report + Cancel / Apply
//   repairing  Apply → openRepairStream  → live per-phase progress, controls locked
//   repaired   the done frame            → the success summary grid
//   partial    onServerError mid-stream  → which phase reached + the error code
//   refused    403 on repair             → <ErrorState> (read_only / forbidden / ...)
//   noperm     claims lack 'repair'      → repair affordances disabled + note
//
// The stream is injectable (openStream prop, default openRepairStream) so tests
// drive start→phase→done frames without a real EventSource.

import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { openRepairStream, type RepairStreamFrame } from '../../api/sse'
import { ErrorState } from '../../components/ErrorState'
import { useAuth } from '../../auth/AuthProvider'
import type { AppDescriptor, ModelDescriptor } from '../../data/descriptor'
import { useMutation } from '../../data/useMutation'
import { useResource } from '../../data/useResource'
import { dryRunRepair, healthCheck, type DryRunResult, type HealthReport, type RepairSummary } from './api'
import { IssueSections } from './IssueSections'
import { isHealthy, summaryCells, totalIssues } from './report'

import './integrity.css'

const PHASE_LABELS: Record<string, string> = {
  instances: 'Instances',
  unique_indexes: 'Unique indexes',
  multi_indexes: 'Multi indexes',
  participations: 'Participations',
  cross_references: 'Cross-references',
}

const REPAIRED_CELLS: { key: keyof RepairSummary; label: string; tone: string }[] = [
  { key: 'phantoms_removed', label: 'Phantoms removed', tone: 'broken' },
  { key: 'missing_added', label: 'Missing added', tone: 'broken' },
  { key: 'indexes_rebuilt', label: 'Indexes rebuilt', tone: 'caution' },
  { key: 'stale_members_removed', label: 'Stale members removed', tone: 'caution' },
  { key: 'orphaned_keys_removed', label: 'Orphaned keys removed', tone: 'broken' },
  { key: 'participations_fixed', label: 'Participations fixed', tone: 'caution' },
  { key: 'cross_refs_fixed', label: 'Cross-refs fixed', tone: 'broken' },
]

/** Live per-phase progress accumulated as frames arrive. */
interface PhaseProgress {
  phase: string
  current?: number
  total?: number
  index?: string
  collection?: string
}

/** The repair flow's local state, layered over the health check. */
type RepairState =
  | { kind: 'idle' }
  | { kind: 'dryrun'; report: HealthReport }
  | { kind: 'repairing'; phases: PhaseProgress[] }
  | { kind: 'repaired'; summary: RepairSummary }
  | { kind: 'partial'; reachedPhase: string | null; code: string }
  | { kind: 'connlost' }

interface IntegrityScreenProps {
  /** Injection seam for tests: defaults to the real EventSource helper. */
  openStream?: typeof openRepairStream
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function frameString(frame: RepairStreamFrame, key: string): string | undefined {
  const v = frame[key]
  return isString(v) ? v : undefined
}

function frameNumber(frame: RepairStreamFrame, key: string): number | undefined {
  const v = frame[key]
  return typeof v === 'number' ? v : undefined
}

export function IntegrityScreen(props: IntegrityScreenProps): React.JSX.Element {
  const { openStream = openRepairStream } = props
  const meta = useResource<AppDescriptor>((api) => api.request('/_meta'), [])
  const [modelName, setModelName] = useState<string | null>(null)

  return (
    <section className="integrity-screen" data-testid="screen-integrity">
      <h2 className="screen-title">Integrity</h2>
      {renderBody()}
    </section>
  )

  function renderBody(): React.JSX.Element {
    if (meta.state.phase === 'loading') {
      return (
        <p className="screen-loading" data-testid="integrity-loading">
          <span className="spinner" aria-hidden="true" /> Loading model descriptors…
        </p>
      )
    }
    if (meta.state.phase === 'error') {
      return <ErrorState error={meta.state.error} onRetry={meta.reload} />
    }

    const models = meta.state.data.models ?? []
    if (models.length === 0) {
      return (
        <p data-testid="integrity-no-models">
          The descriptor lists no models. There is nothing to audit — check the
          server boot (model registration) rather than this screen.
        </p>
      )
    }

    const model = models.find((m) => m.model === modelName) ?? models[0]
    return (
      <>
        <ModelPicker
          models={models}
          current={model}
          onChange={(name) => setModelName(name)}
        />
        <IntegrityBody key={model.model} model={model} openStream={openStream} />
      </>
    )
  }
}

interface ModelPickerProps {
  models: ModelDescriptor[]
  current: ModelDescriptor
  onChange(name: string): void
}

function ModelPicker(props: ModelPickerProps): React.JSX.Element {
  const { models, current, onChange } = props
  return (
    <div className="integrity-modelbar">
      <label className="integrity-modelbar-label" htmlFor="integrity-model-select">
        Model
      </label>
      <select
        id="integrity-model-select"
        data-testid="integrity-model-select"
        value={current.model}
        onChange={(e) => onChange(e.target.value)}
      >
        {models.map((m) => (
          <option key={m.model} value={m.model}>
            {m.model}
          </option>
        ))}
      </select>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface IntegrityBodyProps {
  model: ModelDescriptor
  openStream: typeof openRepairStream
}

function IntegrityBody(props: IntegrityBodyProps): React.JSX.Element {
  const { model, openStream } = props
  const { state: authState, call } = useAuth()
  const canRepair =
    authState.status === 'authenticated' &&
    (authState.claims.permissions ?? []).includes('repair')

  const health = useResource<HealthReport>((api) => healthCheck(api, model.model), [model.model])
  const dryRun = useMutation()
  const [repair, setRepair] = useState<RepairState>({ kind: 'idle' })

  // The live stream handle; closed on unmount or on an explicit new action so
  // we never leave an EventSource open (the helper itself never reconnects).
  const streamRef = useRef<{ close(): void } | null>(null)
  useEffect(() => {
    return () => {
      streamRef.current?.close()
      streamRef.current = null
    }
  }, [])

  const closeStream = useCallback(() => {
    streamRef.current?.close()
    streamRef.current = null
  }, [])

  // Reset all repair-flow state when the model changes (the key on this
  // component already remounts it, but guard explicitly for clarity).
  const resetFlow = useCallback(() => {
    closeStream()
    setRepair({ kind: 'idle' })
    dryRun.reset()
  }, [closeStream, dryRun])

  if (health.state.phase === 'loading') {
    return (
      <p className="screen-loading" data-testid="integrity-checking">
        <span className="spinner" aria-hidden="true" /> Running health check on{' '}
        <code>{model.model}</code>…
      </p>
    )
  }
  if (health.state.phase === 'error') {
    return <ErrorState error={health.state.error} onRetry={health.reload} />
  }

  const report = health.state.data
  const healthy = isHealthy(report)
  const total = totalIssues(report)

  // A dry-run refusal (403 read_only / forbidden / ...) renders through the
  // shared ErrorState in the flow region — still signed in, the report below
  // stays readable. The error lives in dryRun.state (a re-render carries it),
  // so it is rendered in JSX, never read across the run() await.
  function renderRepairError(): React.JSX.Element | null {
    if (dryRun.state.phase !== 'error') return null
    return (
      <div data-testid="integrity-repair-error">
        <ErrorState error={dryRun.state.error} onRetry={() => dryRun.reset()} />
      </div>
    )
  }

  async function startDryRun(): Promise<void> {
    const result = await dryRun.run<DryRunResult>((api) => dryRunRepair(api, model.model))
    // On failure run() returns null and the error is in dryRun.state.error
    // (rendered by renderRepairError); only advance to the preview on success.
    if (result === null) return
    setRepair({ kind: 'dryrun', report: result.report ?? {} })
  }

  function applyRepair(): void {
    dryRun.reset()
    closeStream()
    setRepair({ kind: 'repairing', phases: [] })
    streamRef.current = openStream(model.model, {
      onFrame(frame: RepairStreamFrame) {
        if (frame.event === 'start' || frame.event === 'done') return
        const phase = frameString(frame, 'phase')
        if (phase === undefined) return
        const entry: PhaseProgress = {
          phase,
          current: frameNumber(frame, 'current'),
          total: frameNumber(frame, 'total'),
          index: frameString(frame, 'index'),
          collection: frameString(frame, 'collection'),
        }
        setRepair((prev) => {
          if (prev.kind !== 'repairing') return prev
          // Replace the last entry for the same phase (progress within a phase),
          // else append a new phase row.
          const phases = [...prev.phases]
          const lastIdx = phases.length - 1
          if (lastIdx >= 0 && phases[lastIdx].phase === phase) {
            phases[lastIdx] = entry
          } else {
            phases.push(entry)
          }
          return { kind: 'repairing', phases }
        })
      },
      onDone(frame: RepairStreamFrame) {
        const raw = frame.summary
        const summary: RepairSummary =
          raw !== null && typeof raw === 'object' ? (raw as RepairSummary) : {}
        streamRef.current = null
        setRepair({ kind: 'repaired', summary })
      },
      onServerError(code, body) {
        streamRef.current = null
        // Pull the last reached phase out of the current repairing state.
        setRepair((prev) => {
          const reached =
            prev.kind === 'repairing' && prev.phases.length > 0
              ? prev.phases[prev.phases.length - 1].phase
              : null
          void body
          return { kind: 'partial', reachedPhase: reached, code }
        })
      },
      onConnectionError() {
        streamRef.current = null
        setRepair({ kind: 'connlost' })
        // EventSource hides the HTTP status, so a session that expired mid-repair
        // is indistinguishable from a network drop. Probe the session the way
        // every REST path does: a dead cookie 401s on /auth/session, and call()
        // turns that into session/expired — opening the reauth overlay over the
        // still-mounted screen (location preserved) instead of stranding the
        // operator on a bare "connection lost" panel. A live session (a genuine
        // network blip) changes nothing: the connlost panel stands and the
        // operator can re-run. This closes the one 401 hole the SSE path had.
        void call((api) => api.request('/auth/session'))
      },
    })
  }

  const locked = repair.kind === 'repairing'

  return (
    <div className="integrity-content" data-testid="integrity-content">
      <Header
        model={model}
        report={report}
        healthy={healthy}
        repairState={repair.kind}
        canRepair={canRepair}
        locked={locked}
        onRunCheck={() => {
          resetFlow()
          health.reload()
        }}
        onRepair={() => void startDryRun()}
        repairing={dryRun.state.phase === 'pending'}
      />

      {renderRepairError()}
      <FlowPanel
        state={repair}
        report={report}
        healthy={healthy}
        total={total}
        canRepair={canRepair}
        onApply={applyRepair}
        onCancel={resetFlow}
        onRecheck={() => {
          resetFlow()
          health.reload()
        }}
      />

      {!canRepair && (
        <p className="integrity-noperm-note" data-testid="integrity-noperm-note">
          Your session lacks <code>permission:repair</code>. The report is
          readable, but the repair controls are disabled. A repair attempt would
          be refused server-side (403).
        </p>
      )}

      {!healthy && <SummaryStrip report={report} />}
      <IssueSections report={report} />
    </div>
  )
}

// ---------------------------------------------------------------------------

interface HeaderProps {
  model: ModelDescriptor
  report: HealthReport
  healthy: boolean
  repairState: RepairState['kind']
  canRepair: boolean
  locked: boolean
  repairing: boolean
  onRunCheck(): void
  onRepair(): void
}

function fmtTime(seconds: number | undefined): string {
  if (typeof seconds !== 'number') return '—'
  return `${new Date(seconds * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

function Header(props: HeaderProps): React.JSX.Element {
  const { model, report, healthy, repairState, canRepair, locked, repairing, onRunCheck, onRepair } = props
  const tone = headerTone(healthy, repairState)
  const showRepair = !healthy && (repairState === 'idle' || repairState === 'dryrun')

  return (
    <div className="integrity-header" data-testid="integrity-header">
      <div className="integrity-header-info">
        <span className={`integrity-status integrity-status-${tone.tone}`} data-testid="integrity-status">
          <span className={`integrity-dot integrity-dot-${tone.tone}`} aria-hidden="true" />
          {tone.label}
        </span>
        <span className="integrity-header-meta">
          <span className="integrity-count-label">model</span>
          <code>{model.model}</code>
        </span>
        <span className="integrity-header-meta">
          <span className="integrity-count-label">checked</span>
          <code>{fmtTime(report.checked_at)}</code>
        </span>
        {report.complete === false && (
          <span className="integrity-incomplete" data-testid="integrity-incomplete">
            reflection incomplete — some components may be unaudited
          </span>
        )}
      </div>
      <div className="integrity-header-actions">
        <button
          type="button"
          className="integrity-btn"
          data-testid="integrity-run-check"
          disabled={locked}
          onClick={onRunCheck}
        >
          Run check
        </button>
        {showRepair && (
          <button
            type="button"
            className="integrity-btn integrity-btn-primary"
            data-testid="integrity-preview-repair"
            disabled={!canRepair || locked || repairing || repairState === 'dryrun'}
            title={canRepair ? undefined : 'requires permission:repair'}
            onClick={onRepair}
          >
            {repairing ? 'Previewing…' : 'Preview repair'}
          </button>
        )}
      </div>
    </div>
  )
}

function headerTone(
  healthy: boolean,
  repairState: RepairState['kind'],
): { tone: string; label: string } {
  switch (repairState) {
    case 'dryrun':
      return { tone: 'preview', label: 'Dry-run preview' }
    case 'repairing':
      return { tone: 'preview', label: 'Repairing…' }
    case 'repaired':
      return { tone: 'healthy', label: 'Repaired · healthy' }
    case 'partial':
      return { tone: 'broken', label: 'Repair incomplete' }
    case 'connlost':
      return { tone: 'caution', label: 'Stream connection lost' }
    default:
      return healthy
        ? { tone: 'healthy', label: 'Healthy' }
        : { tone: 'broken', label: 'Issues found' }
  }
}

// ---------------------------------------------------------------------------

interface FlowPanelProps {
  state: RepairState
  report: HealthReport
  healthy: boolean
  total: number
  canRepair: boolean
  onApply(): void
  onCancel(): void
  onRecheck(): void
}

function FlowPanel(props: FlowPanelProps): React.JSX.Element | null {
  const { state, report, healthy, total, canRepair, onApply, onCancel, onRecheck } = props

  if (state.kind === 'dryrun') {
    return <DryRunPanel report={state.report} canApply={canRepair} onApply={onApply} onCancel={onCancel} />
  }
  if (state.kind === 'repairing') {
    return <RepairingPanel phases={state.phases} />
  }
  if (state.kind === 'repaired') {
    return <RepairedPanel summary={state.summary} onRecheck={onRecheck} />
  }
  if (state.kind === 'partial') {
    return <PartialPanel reachedPhase={state.reachedPhase} code={state.code} onRecheck={onRecheck} onRetry={onApply} canRetry={canRepair} />
  }
  if (state.kind === 'connlost') {
    return <ConnLostPanel onRetry={onApply} canRetry={canRepair} />
  }

  // idle: the banner reflects the health check result.
  if (healthy) {
    return (
      <div className="integrity-banner integrity-banner-healthy" data-testid="integrity-banner-healthy" role="status">
        <strong>No issues found.</strong> Instances, indexes, participations, and
        cross-references all reconcile. Nothing to repair.
      </div>
    )
  }
  return (
    <div className="integrity-banner integrity-banner-broken" data-testid="integrity-banner-issues" role="status">
      <strong>
        {total} {total === 1 ? 'issue' : 'issues'} found across the audit
        components.
      </strong>{' '}
      Preview a repair before applying — nothing is written until you confirm.
      {report.model && (
        <span className="integrity-banner-model"> Model: {report.model}.</span>
      )}
    </div>
  )
}

function DryRunPanel(props: {
  report: HealthReport
  canApply: boolean
  onApply(): void
  onCancel(): void
}): React.JSX.Element {
  const { report, canApply, onApply, onCancel } = props
  const writes = totalIssues(report)
  return (
    <div className="integrity-panel integrity-panel-preview" data-testid="integrity-dryrun">
      <div className="integrity-panel-head">
        <span className="integrity-badge integrity-badge-preview">preview</span>
        <span className="integrity-panel-title">Dry-run preview — nothing has been written</span>
      </div>
      <div className="integrity-panel-body">
        <p className="integrity-panel-note">
          The server computed what a repair would touch. Review the components,
          then apply to run it live (progress streams as it happens).
        </p>
        <SummaryStrip report={report} />
      </div>
      <div className="integrity-panel-foot">
        <code className="integrity-panel-writes" data-testid="integrity-dryrun-writes">
          {writes} {writes === 1 ? 'write' : 'writes'} planned
        </code>
        <div className="integrity-panel-foot-actions">
          <button type="button" className="integrity-btn" data-testid="integrity-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="integrity-btn integrity-btn-primary"
            data-testid="integrity-apply"
            disabled={!canApply}
            title={canApply ? undefined : 'requires permission:repair'}
            onClick={onApply}
          >
            Apply repair
          </button>
        </div>
      </div>
    </div>
  )
}

function RepairingPanel(props: { phases: PhaseProgress[] }): React.JSX.Element {
  const { phases } = props
  return (
    <div className="integrity-panel integrity-panel-preview" data-testid="integrity-repairing">
      <div className="integrity-panel-head">
        <span className="integrity-badge integrity-badge-preview">live</span>
        <span className="integrity-panel-title">Repair in progress — controls locked</span>
      </div>
      <div className="integrity-panel-body">
        <p className="integrity-panel-note">
          Phases stream in order over EventSource; progress updates as each frame
          arrives.
        </p>
        {phases.length === 0 ? (
          <p className="screen-loading" data-testid="integrity-stream-waiting">
            <span className="spinner" aria-hidden="true" /> Waiting for the first phase…
          </p>
        ) : (
          <ul className="integrity-phase-list" data-testid="integrity-phase-list">
            {phases.map((p) => (
              <li key={p.phase} className="integrity-phase" data-testid={`integrity-phase-${p.phase}`}>
                <span className="integrity-phase-label">{PHASE_LABELS[p.phase] ?? p.phase}</span>
                {p.index && <code className="integrity-phase-target">{p.index}</code>}
                {p.collection && <code className="integrity-phase-target">{p.collection}</code>}
                <span className="integrity-phase-progress">
                  {p.current ?? 0}
                  {typeof p.total === 'number' ? ` / ${p.total}` : ''}
                </span>
                <Bar current={p.current} total={p.total} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Bar(props: { current?: number; total?: number }): React.JSX.Element | null {
  const { current, total } = props
  if (typeof total !== 'number' || total <= 0 || typeof current !== 'number') return null
  const pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)))
  return (
    <span className="integrity-bar" aria-hidden="true">
      <span className="integrity-bar-fill" style={{ width: `${pct}%` }} />
    </span>
  )
}

function RepairedPanel(props: { summary: RepairSummary; onRecheck(): void }): React.JSX.Element {
  const { summary, onRecheck } = props
  const totalWrites = REPAIRED_CELLS.reduce((a, c) => a + (summary[c.key] ?? 0), 0)
  return (
    <div className="integrity-panel integrity-panel-healthy" data-testid="integrity-repaired">
      <div className="integrity-panel-head">
        <span className="integrity-badge integrity-badge-healthy">done</span>
        <span className="integrity-panel-title">Repair complete — the model now reconciles</span>
      </div>
      <div className="integrity-panel-body">
        <div className="integrity-repaired-grid" data-testid="integrity-repaired-grid">
          {REPAIRED_CELLS.map((c) => (
            <div key={c.key} className="integrity-repaired-cell" data-testid={`integrity-repaired-${c.key}`}>
              <span className="integrity-repaired-head">
                <span className={`integrity-dot integrity-dot-${c.tone}`} aria-hidden="true" />
                <span className="integrity-repaired-value">{summary[c.key] ?? 0}</span>
              </span>
              <span className="integrity-repaired-label">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="integrity-panel-foot">
        <code className="integrity-panel-writes">{totalWrites} writes applied</code>
        <div className="integrity-panel-foot-actions">
          <button type="button" className="integrity-btn" data-testid="integrity-recheck" onClick={onRecheck}>
            Run check
          </button>
        </div>
      </div>
    </div>
  )
}

function PartialPanel(props: {
  reachedPhase: string | null
  code: string
  canRetry: boolean
  onRecheck(): void
  onRetry(): void
}): React.JSX.Element {
  const { reachedPhase, code, canRetry, onRecheck, onRetry } = props
  return (
    <div className="integrity-panel integrity-panel-broken" role="alert" data-testid="integrity-partial">
      <div className="integrity-panel-head">
        <span className="integrity-badge integrity-badge-broken">{code}</span>
        <span className="integrity-panel-title">Repair incomplete — the stream ended early</span>
      </div>
      <div className="integrity-panel-body">
        <p className="integrity-panel-note">
          The repair stream stopped with error code <code>{code}</code>
          {reachedPhase
            ? <> during the <strong>{PHASE_LABELS[reachedPhase] ?? reachedPhase}</strong> phase</>
            : ' before any phase completed'}
          . Any phase that committed before the error is already written;
          re-running the check shows the current state. The stream did not
          reconnect (by design) — re-apply only deliberately.
        </p>
      </div>
      <div className="integrity-panel-foot">
        <div className="integrity-panel-foot-actions">
          <button type="button" className="integrity-btn" data-testid="integrity-partial-recheck" onClick={onRecheck}>
            Re-run check
          </button>
          <button
            type="button"
            className="integrity-btn integrity-btn-primary"
            data-testid="integrity-partial-retry"
            disabled={!canRetry}
            title={canRetry ? undefined : 'requires permission:repair'}
            onClick={onRetry}
          >
            Re-apply repair
          </button>
        </div>
      </div>
    </div>
  )
}

function ConnLostPanel(props: { canRetry: boolean; onRetry(): void }): React.JSX.Element {
  const { canRetry, onRetry } = props
  return (
    <div className="integrity-panel integrity-panel-caution" role="alert" data-testid="integrity-connlost">
      <div className="integrity-panel-head">
        <span className="integrity-badge integrity-badge-caution">connection lost</span>
        <span className="integrity-panel-title">The repair stream connection dropped</span>
      </div>
      <div className="integrity-panel-body">
        <p className="integrity-panel-note">
          The EventSource connection failed and the stream did NOT reconnect (a
          reconnect would re-run the repair audit server-side). Whatever the
          server committed before the drop is already written. Re-run the check
          to see the current state, then re-apply if needed. If your session
          expired mid-repair, the re-authentication prompt will appear over this
          panel — sign back in and re-run; nothing here is lost.
        </p>
      </div>
      <div className="integrity-panel-foot">
        <div className="integrity-panel-foot-actions">
          <button
            type="button"
            className="integrity-btn integrity-btn-primary"
            data-testid="integrity-connlost-retry"
            disabled={!canRetry}
            title={canRetry ? undefined : 'requires permission:repair'}
            onClick={onRetry}
          >
            Re-apply repair
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function SummaryStrip(props: { report: HealthReport }): React.JSX.Element {
  const cells = summaryCells(props.report)
  const total = totalIssues(props.report)
  return (
    <div className="integrity-summary" data-testid="integrity-summary">
      <div className="integrity-section-label">Issue summary · {total} total</div>
      <div className="integrity-summary-cells">
        {cells.map((c) => {
          const zero = c.value === 0
          return (
            <div
              key={c.key}
              className={`integrity-summary-cell integrity-summary-cell-${zero ? 'neutral' : c.tone}`}
              data-testid={`integrity-summary-${c.key}`}
              data-zero={zero}
            >
              <span className="integrity-summary-value">{c.value}</span>
              <span className="integrity-summary-label">{c.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
