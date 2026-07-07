// src/screens/audit/AuditScreen.tsx
//
// The audit-trail screen (R-AUD-1). The append-only operator audit sink has
// shipped on the backend since T6 (GET /admin/api/audit), but nothing consumed
// it — operators had to reach for `redis-cli` / curl to see their own trail.
// This screen is that missing surface: newest-first entries, client-side action
// filtering over the fetched window, an adjustable server-side fetch window, and
// per-row expansion that reveals the full detail — including the destroy
// snapshot the sink preserves before a record is removed.
//
// Honesty rules it keeps (spec §5):
//   - It renders entries in received order (the backend already sorts
//     newest-first) and never fabricates, re-sorts, or dedupes them.
//   - A failed fetch is the shared ErrorState, never an empty table.
//   - Empty is an explicit "no entries yet" panel, not a blank surface.
//   - It shows each entry's target as text; it does NOT link to the affected
//     record, because record deep-links do not exist yet (they land with
//     R-UX-1). Rendering a link that could not reliably resolve would be the
//     kind of implied-capability fabrication the spec forbids.
//
// The route is role:admin and a GET, so every authenticated session can read it
// and production read-only mode never blocks it — there is no permission gate
// or mutation on this screen.

import type React from 'react'
import { useMemo, useState } from 'react'

import { ErrorState } from '../../components/ErrorState'
import { useResource } from '../../data/useResource'
import './audit.css'
import { listAudit, type AuditEntry } from './api'
import {
  auditActionTone,
  auditDateTime,
  auditDetailPairs,
  auditRowKeys,
  auditTarget,
  distinctActions,
  formatAuditTime,
  snapshotPairs,
} from './format'

/** The server-side fetch windows offered (backend clamps to [1, 500]). */
const WINDOW_OPTIONS = [50, 100, 200, 500] as const
const DEFAULT_WINDOW = 50

export function AuditScreen(): React.JSX.Element {
  return (
    <section className="audit-screen" data-testid="screen-audit">
      <h2 className="screen-title">Audit trail</h2>
      <AuditBody />
    </section>
  )
}

function AuditBody(): React.JSX.Element {
  const [windowSize, setWindowSize] = useState<number>(DEFAULT_WINDOW)
  const audit = useResource((api) => listAudit(api, windowSize), [windowSize])

  if (audit.state.phase === 'loading') {
    return (
      <p className="screen-loading" data-testid="audit-loading">
        <span className="spinner" aria-hidden="true" /> Loading audit trail…
      </p>
    )
  }
  if (audit.state.phase === 'error') {
    return <ErrorState error={audit.state.error} onRetry={audit.reload} />
  }

  const entries = audit.state.data.entries ?? []
  return (
    <AuditConsole
      entries={entries}
      windowSize={windowSize}
      onChangeWindow={setWindowSize}
      onRefresh={audit.reload}
    />
  )
}

// ---------------------------------------------------------------------------

interface AuditConsoleProps {
  entries: AuditEntry[]
  windowSize: number
  onChangeWindow(next: number): void
  onRefresh(): void
}

function AuditConsole(props: AuditConsoleProps): React.JSX.Element {
  const { entries, windowSize, onChangeWindow, onRefresh } = props

  // `null` = show all actions; otherwise the single action being filtered to.
  const [action, setAction] = useState<string | null>(null)
  const actions = useMemo(() => distinctActions(entries), [entries])

  // A filter that no longer matches the freshly-loaded window silently resets to
  // "all" rather than showing an empty list for a stale selection.
  const activeAction = action !== null && actions.includes(action) ? action : null

  // Content-derived React keys, computed over the FULL window before filtering,
  // so a row keeps its identity (and expansion state) as the filter narrows or
  // widens AND as a refresh shifts the list — never the array index, which would
  // reassociate one row's expansion with a different entry. The original index
  // is retained only for positional testids, not for React identity.
  const keys = auditRowKeys(entries)
  const rows = entries
    .map((entry, index) => ({ entry, index, key: keys[index] }))
    .filter(({ entry }) => activeAction === null || entry.action === activeAction)

  return (
    <div className="audit-console" data-testid="audit-console">
      <AuditToolbar
        actions={actions}
        activeAction={activeAction}
        onSelectAction={setAction}
        windowSize={windowSize}
        onChangeWindow={onChangeWindow}
        onRefresh={onRefresh}
      />

      <p className="audit-count" data-testid="audit-count">
        {entries.length === 0
          ? 'No entries in this window.'
          : activeAction === null
            ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} loaded (newest first).`
            : `${rows.length} of ${entries.length} loaded ${entries.length === 1 ? 'entry' : 'entries'} match “${activeAction}”.`}
        {entries.length >= windowSize && (
          <span className="audit-window-hint">
            {' '}Window full — raise it to load older entries.
          </span>
        )}
      </p>

      {entries.length === 0 ? (
        <EmptyPanel />
      ) : (
        <ol className="audit-list" data-testid="audit-list">
          {rows.map(({ entry, index, key }) => (
            <AuditRow key={key} entry={entry} index={index} />
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface AuditToolbarProps {
  actions: string[]
  activeAction: string | null
  onSelectAction(action: string | null): void
  windowSize: number
  onChangeWindow(next: number): void
  onRefresh(): void
}

function AuditToolbar(props: AuditToolbarProps): React.JSX.Element {
  const { actions, activeAction, onSelectAction, windowSize, onChangeWindow, onRefresh } =
    props

  return (
    <div className="audit-toolbar" data-testid="audit-toolbar">
      <div
        className="audit-filter"
        data-testid="audit-filter"
        role="group"
        aria-label="Filter by action"
      >
        <button
          type="button"
          className={`audit-chip ${activeAction === null ? 'audit-chip--on' : ''}`}
          data-testid="audit-filter-all"
          aria-pressed={activeAction === null}
          onClick={() => onSelectAction(null)}
        >
          All
        </button>
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className={`audit-chip audit-chip--${auditActionTone(action)} ${
              activeAction === action ? 'audit-chip--on' : ''
            }`}
            data-testid={`audit-filter-${action}`}
            aria-pressed={activeAction === action}
            onClick={() => onSelectAction(action)}
          >
            {action}
          </button>
        ))}
      </div>

      <div className="audit-toolbar-actions">
        <label className="audit-window" htmlFor="audit-window-select">
          <span className="audit-window-label">Window</span>
          <select
            id="audit-window-select"
            className="audit-window-select"
            data-testid="audit-window-select"
            value={windowSize}
            onChange={(event) => onChangeWindow(Number(event.target.value))}
          >
            {WINDOW_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button type="button" data-testid="audit-refresh" onClick={onRefresh}>
          Refresh
        </button>
      </div>
    </div>
  )
}

function EmptyPanel(): React.JSX.Element {
  return (
    <div className="audit-empty" role="status" data-testid="audit-empty">
      <h3>No audit entries yet</h3>
      <p>
        The audit sink is empty for this window — no elevated or mutating action
        (reveal, repair, destroy, migration, raw command) has been recorded. This
        is the honest empty state, not a failed load.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface AuditRowProps {
  entry: AuditEntry
  index: number
}

function AuditRow(props: AuditRowProps): React.JSX.Element {
  const { entry, index } = props
  const [open, setOpen] = useState(false)

  const action = entry.action ?? 'unknown'
  const tone = auditActionTone(entry.action)
  const target = auditTarget(entry)
  const details = auditDetailPairs(entry)
  const snapshot = snapshotPairs(entry)
  const detailId = `audit-entry-detail-${index}`

  return (
    <li className="audit-entry" data-testid={`audit-entry-${index}`}>
      <button
        type="button"
        className="audit-entry-head"
        data-testid={`audit-entry-toggle-${index}`}
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="audit-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <time className="audit-time cell-mono" dateTime={auditDateTime(entry.at)}>
          {formatAuditTime(entry.at)}
        </time>
        <span className={`audit-badge audit-badge--${tone}`}>{action}</span>
        <span className="audit-actor" data-testid={`audit-actor-${index}`}>
          {entry.actor ?? '—'}
        </span>
        {target !== null && (
          <code className="audit-target" data-testid={`audit-target-${index}`}>
            {target}
          </code>
        )}
      </button>

      {open && (
        <div className="audit-entry-detail" id={detailId} data-testid={detailId}>
          {details.length === 0 && snapshot.length === 0 ? (
            <p className="audit-note">No additional detail was recorded.</p>
          ) : (
            <>
              {details.length > 0 && (
                <dl className="audit-detail-list">
                  {details.map(({ key, value }) => (
                    <div className="audit-detail-row" key={key}>
                      <dt>{key}</dt>
                      <dd className="cell-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {snapshot.length > 0 && (
                <div className="audit-snapshot" data-testid={`audit-snapshot-${index}`}>
                  <span className="audit-eyebrow">
                    Destroy snapshot — the record as it was, encrypted fields
                    masked
                  </span>
                  <dl className="audit-detail-list">
                    {snapshot.map(({ key, value }) => (
                      <div className="audit-detail-row" key={key}>
                        <dt>{key}</dt>
                        <dd className="cell-mono">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}
