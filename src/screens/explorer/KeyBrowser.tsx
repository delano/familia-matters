// src/screens/explorer/KeyBrowser.tsx
//
// The left pane: a pattern/type key search over /raw/keys (SCAN paging). The
// first Scan starts at cursor '0' and replaces the list; "Load more" pages with
// the response cursor and APPENDS, until the cursor comes back '0' (scan
// complete). Honest states throughout: idle before any scan ("Run a scan to
// begin"), a spinner while a page is in flight, ErrorState on failure (no seed
// fallback), and an explicit "0 keys matched" on a completed empty scan.

import type React from 'react'
import { useEffect, useState } from 'react'

import { ErrorState } from '../../components/ErrorState'
import { useResource } from '../../data/useResource'
import { scanKeys, type ScanKey, type ScanPage } from './api'
import { formatTtl } from './format'

/** The Redis types the server can filter a scan by. '' means no type filter. */
const TYPE_FILTERS: readonly { value: string; label: string }[] = [
  { value: '', label: 'all types' },
  { value: 'string', label: 'string' },
  { value: 'list', label: 'list' },
  { value: 'set', label: 'set' },
  { value: 'zset', label: 'zset' },
  { value: 'hash', label: 'hash' },
]

/** A submitted scan, identified by an epoch so a re-submit of the same pattern
 * still restarts. `cursor` is the next cursor to fetch for THIS scan. */
interface ScanState {
  pattern: string
  type: string
  /** Bumped per Scan press so an identical pattern still re-runs from '0'. */
  epoch: number
  /** The cursor to fetch next: '0' on a fresh scan, the response cursor after. */
  cursor: string
}

interface KeyBrowserProps {
  selectedKey: string | null
  onSelect(key: string): void
}

export function KeyBrowser(props: KeyBrowserProps): React.JSX.Element {
  const { selectedKey, onSelect } = props
  const [pattern, setPattern] = useState('*')
  const [type, setType] = useState('')
  /** Null until the operator runs the first scan (the idle state). */
  const [scan, setScan] = useState<ScanState | null>(null)
  /** Accumulated keys across the pages of the current scan. */
  const [keys, setKeys] = useState<ScanKey[]>([])
  const [totals, setTotals] = useState<{ scanned: number; matched: number }>({
    scanned: 0,
    matched: 0,
  })
  /** Set true once a page of the current scan has resolved (gates empty copy). */
  const [pageSettled, setPageSettled] = useState(false)

  const runScan = (): void => {
    setKeys([])
    setTotals({ scanned: 0, matched: 0 })
    setPageSettled(false)
    setScan((prev) => ({
      pattern: pattern.trim() === '' ? '*' : pattern.trim(),
      type,
      epoch: (prev?.epoch ?? 0) + 1,
      cursor: '0',
    }))
  }

  const page = useResource<ScanPage>(
    (api) =>
      scan === null
        ? // The resource only drives a page once `scan` is set, but useResource
          // is a hook and must be called unconditionally — an empty page until
          // then (the idle branch renders, never reading this).
          Promise.resolve({ ok: true, data: {} })
        : scanKeys(api, scan.pattern, scan.type, scan.cursor),
    [scan?.pattern, scan?.type, scan?.epoch, scan?.cursor],
  )

  // Append each resolved page exactly once: the effect's deps are the page data
  // identity, which only changes when a new page arrives.
  useEffect(() => {
    if (scan === null) return
    if (page.state.phase !== 'ready') return
    const data = page.state.data
    setKeys((prev) => [...prev, ...(data.keys ?? [])])
    setTotals((prev) => ({
      scanned: prev.scanned + (data.scanned ?? 0),
      matched: prev.matched + (data.matched ?? 0),
    }))
    setPageSettled(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.state])

  const loadMore = (): void => {
    if (scan === null) return
    const next = page.state.phase === 'ready' ? (page.state.data.cursor ?? '0') : '0'
    if (next === '0') return
    setPageSettled(false)
    setScan({ ...scan, cursor: next })
  }

  const nextCursor =
    page.state.phase === 'ready' ? (page.state.data.cursor ?? '0') : '0'

  return (
    <div className="explorer-keybrowser" data-testid="explorer-keybrowser">
      <form
        className="explorer-keysearch"
        onSubmit={(e) => {
          e.preventDefault()
          runScan()
        }}
      >
        <label className="explorer-field-label" htmlFor="explorer-pattern">
          MATCH pattern
        </label>
        <input
          id="explorer-pattern"
          type="text"
          data-testid="explorer-pattern"
          className="explorer-mono-input"
          placeholder="customer:*"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
        <div className="explorer-keysearch-row">
          <select
            data-testid="explorer-type"
            aria-label="Type filter"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="submit" className="explorer-primary-btn" data-testid="explorer-scan">
            Scan
          </button>
        </div>
      </form>

      {scan === null ? (
        <p className="explorer-idle" data-testid="explorer-scan-idle">
          Run a scan to begin. The backend pages the keyspace with SCAN (never
          KEYS); start with a MATCH glob like <code>customer:*</code>.
        </p>
      ) : (
        <>
          <p className="explorer-scan-count" data-testid="explorer-scan-count">
            matched <strong>{totals.matched}</strong> · scanned{' '}
            <strong>{totals.scanned}</strong>
          </p>

          {page.state.phase === 'error' && (
            <ErrorState error={page.state.error} onRetry={page.reload} />
          )}

          {keys.length === 0 && pageSettled && page.state.phase !== 'error' && (
            <p className="explorer-empty" data-testid="explorer-scan-empty">
              0 keys matched. No data was fetched beyond the scan itself — try a
              different MATCH pattern.
            </p>
          )}

          <ul className="explorer-key-list" data-testid="explorer-key-list">
            {keys.map((k) => (
              <KeyRow
                key={k.key}
                entry={k}
                active={k.key === selectedKey}
                onSelect={() => onSelect(k.key)}
              />
            ))}
          </ul>

          {page.state.phase === 'loading' && (
            <p className="screen-loading" data-testid="explorer-scan-loading">
              <span className="spinner" aria-hidden="true" /> Scanning…
            </p>
          )}

          {page.state.phase === 'ready' && nextCursor !== '0' && (
            <button
              type="button"
              className="explorer-loadmore"
              data-testid="explorer-load-more"
              onClick={loadMore}
            >
              Load more · cursor {nextCursor}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

interface KeyRowProps {
  entry: ScanKey
  active: boolean
  onSelect(): void
}

function KeyRow(props: KeyRowProps): React.JSX.Element {
  const { entry, active, onSelect } = props
  const ttl = formatTtl(entry.ttl)
  return (
    <li>
      <button
        type="button"
        className={active ? 'explorer-key-row explorer-key-row--active' : 'explorer-key-row'}
        data-testid={`explorer-key-${entry.key}`}
        onClick={onSelect}
      >
        <code className="explorer-key-name">{entry.key}</code>
        <span className={`explorer-type-chip explorer-type-chip--${entry.type}`}>
          {entry.type}
        </span>
        <span className="explorer-key-ttl">
          {ttl.persistent ? 'persistent' : `ttl ${ttl.text}`}
        </span>
        {entry.model && (
          <span
            className="explorer-model-badge"
            data-testid={`explorer-key-badge-${entry.key}`}
          >
            {entry.model}
            {entry.id ? ` · ${entry.id}` : ''}
          </span>
        )}
      </button>
    </li>
  )
}
