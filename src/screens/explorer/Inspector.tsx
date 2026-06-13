// src/screens/explorer/Inspector.tsx
//
// The right pane: the typed value inspector and the parsed Server Info sections.
// The inspector fetches /raw/key for the selected key and renders a viewer per
// Redis type — string, list (indexed), set (tags), zset (member + score table),
// hash (field→value, [CONCEALED] fields flagged) — plus TYPE/TTL/MEMORY/DB stat
// cells and, when the key maps to a model, a banner that hash-navigates to the
// Records screen. The value arrives as `unknown` and is narrowed (./format) per
// declared type; a mismatch renders an honest "unexpected value", never a guess.
// A missing key surfaces ErrorState (404 → "Not found"). Server Info renders the
// parsed INFO subset as labeled sections.

import type React from 'react'

import { ErrorState } from '../../components/ErrorState'
import { useResource } from '../../data/useResource'
import { inspectKey, serverInfo, type KeyInspection } from './api'
import {
  CONCEALED,
  asArrayValue,
  asHashValue,
  asStringValue,
  asZsetValue,
  formatBytes,
  formatScalar,
  formatTtl,
} from './format'

// ---------------------------------------------------------------------------
// Inspector tab
// ---------------------------------------------------------------------------

interface InspectorProps {
  /** The selected key, or null when no key has been opened yet. */
  selectedKey: string | null
  /** Hash-navigates to the Records screen for a model-backed key. */
  onOpenRecords(): void
}

export function Inspector(props: InspectorProps): React.JSX.Element {
  const { selectedKey, onOpenRecords } = props

  if (selectedKey === null) {
    return (
      <p className="explorer-inspector-idle" data-testid="explorer-inspector-idle">
        Select a key on the left to inspect it. You will see TYPE · TTL · MEMORY
        · DB and a typed value viewer.
      </p>
    )
  }

  return <InspectorBody key={selectedKey} keyName={selectedKey} onOpenRecords={onOpenRecords} />
}

interface InspectorBodyProps {
  keyName: string
  onOpenRecords(): void
}

function InspectorBody(props: InspectorBodyProps): React.JSX.Element {
  const { keyName, onOpenRecords } = props
  const inspection = useResource<KeyInspection>((api) => inspectKey(api, keyName), [keyName])

  if (inspection.state.phase === 'loading') {
    return (
      <p className="screen-loading" data-testid="explorer-inspect-loading">
        <span className="spinner" aria-hidden="true" /> Loading key…
      </p>
    )
  }
  if (inspection.state.phase === 'error') {
    // A missing key is a 404 → ErrorState renders "Not found".
    return <ErrorState error={inspection.state.error} onRetry={inspection.reload} />
  }

  const data = inspection.state.data
  const ttl = formatTtl(data.ttl)

  return (
    <div className="explorer-inspector" data-testid="explorer-inspector">
      <div className="explorer-inspector-head">
        <code className="explorer-inspector-key" data-testid="explorer-inspect-key">
          {data.key}
        </code>
        <span className={`explorer-type-chip explorer-type-chip--${data.type}`}>
          {data.type}
        </span>
      </div>

      <div className="explorer-statcells" data-testid="explorer-statcells">
        <StatCell label="Type" value={data.type} />
        <StatCell label="TTL" value={ttl.persistent ? 'persistent' : ttl.text} />
        <StatCell label="Memory" value={formatBytes(data.memory)} />
        <StatCell label="DB" value={data.db === undefined ? '—' : `db${data.db}`} />
      </div>

      {data.model && (
        <div className="explorer-model-banner" data-testid="explorer-model-banner">
          <span>
            This key is a <strong>{data.model}</strong> record{' '}
            <code>{data.id ?? '?'}</code>. The raw hash is the same object the
            model-aware Records screen renders with its schema.
          </span>
          <button
            type="button"
            data-testid="explorer-open-records"
            onClick={onOpenRecords}
          >
            Open in Records
          </button>
        </div>
      )}

      <ValueViewer type={data.type} value={data.value} />
    </div>
  )
}

function StatCell(props: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="explorer-statcell">
      <span className="explorer-statcell-label">{props.label}</span>
      <span className="explorer-statcell-value">{props.value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Typed value viewers
// ---------------------------------------------------------------------------

function ValueViewer(props: { type: string; value: unknown }): React.JSX.Element {
  const { type, value } = props

  switch (type) {
    case 'string':
      return <StringView value={value} />
    case 'list':
      return <ListView value={value} />
    case 'set':
      return <SetView value={value} />
    case 'zset':
      return <ZsetView value={value} />
    case 'hash':
      return <HashView value={value} />
    default:
      return (
        <ViewerSection title={`Value (${type})`}>
          <pre className="explorer-raw-value" data-testid="explorer-value-raw">
            {formatScalar(value)}
          </pre>
        </ViewerSection>
      )
  }
}

function ViewerSection(props: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="explorer-viewer" data-testid="explorer-value-viewer">
      <h4 className="explorer-viewer-title">{props.title}</h4>
      {props.children}
    </div>
  )
}

function Unexpected(props: { type: string }): React.JSX.Element {
  return (
    <p className="explorer-note" data-testid="explorer-value-unexpected">
      The server sent a value that does not match the declared {props.type} type.
      Nothing is shown rather than guess at it.
    </p>
  )
}

function StringView(props: { value: unknown }): React.JSX.Element {
  const text = asStringValue(props.value)
  return (
    <ViewerSection title="String value">
      {text === null ? (
        <Unexpected type="string" />
      ) : (
        <pre className="explorer-string-value" data-testid="explorer-string-value">
          {text === '' ? '(empty string)' : text}
        </pre>
      )}
    </ViewerSection>
  )
}

function ListView(props: { value: unknown }): React.JSX.Element {
  const items = asArrayValue(props.value)
  return (
    <ViewerSection
      title={`List · ${items?.length ?? 0} element${items?.length === 1 ? '' : 's'} (first 25)`}
    >
      {items === null ? (
        <Unexpected type="list" />
      ) : items.length === 0 ? (
        <p className="explorer-note">empty list</p>
      ) : (
        <ol className="explorer-list-items" data-testid="explorer-list">
          {items.map((m, i) => (
            <li key={i}>
              <span className="explorer-list-index">{i}</span>
              <code>{m}</code>
            </li>
          ))}
        </ol>
      )}
    </ViewerSection>
  )
}

function SetView(props: { value: unknown }): React.JSX.Element {
  const members = asArrayValue(props.value)
  return (
    <ViewerSection
      title={`Set · ${members?.length ?? 0} member${members?.length === 1 ? '' : 's'} · unordered`}
    >
      {members === null ? (
        <Unexpected type="set" />
      ) : members.length === 0 ? (
        <p className="explorer-note">empty set</p>
      ) : (
        <div className="explorer-set-tags" data-testid="explorer-set">
          {members.map((m, i) => (
            <span key={i} className="explorer-set-tag">
              {m}
            </span>
          ))}
        </div>
      )}
    </ViewerSection>
  )
}

function ZsetView(props: { value: unknown }): React.JSX.Element {
  const entries = asZsetValue(props.value)
  return (
    <ViewerSection
      title={`Sorted set · ${entries?.length ?? 0} member${entries?.length === 1 ? '' : 's'} · by score`}
    >
      {entries === null ? (
        <Unexpected type="zset" />
      ) : entries.length === 0 ? (
        <p className="explorer-note">empty sorted set</p>
      ) : (
        <table className="data-table explorer-zset" data-testid="explorer-zset">
          <thead>
            <tr>
              <th scope="col">member</th>
              <th scope="col">score</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} data-testid="explorer-zset-row">
                <td className="cell-mono">{e.member}</td>
                <td className="cell-mono">{Number.isFinite(e.score) ? e.score : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ViewerSection>
  )
}

function HashView(props: { value: unknown }): React.JSX.Element {
  const entries = asHashValue(props.value)
  return (
    <ViewerSection
      title={`Hash · ${entries?.length ?? 0} field${entries?.length === 1 ? '' : 's'}`}
    >
      {entries === null ? (
        <Unexpected type="hash" />
      ) : entries.length === 0 ? (
        <p className="explorer-note">empty hash</p>
      ) : (
        <div className="explorer-hash" data-testid="explorer-hash">
          {entries.map(([field, val]) => {
            const concealed = val === CONCEALED
            return (
              <div className="explorer-hash-row" key={field} data-testid={`explorer-hash-${field}`}>
                <code className="explorer-hash-field">{field}</code>
                <code
                  className={
                    concealed ? 'explorer-hash-value explorer-hash-value--concealed' : 'explorer-hash-value'
                  }
                >
                  {val}
                </code>
              </div>
            )
          })}
        </div>
      )}
    </ViewerSection>
  )
}

// ---------------------------------------------------------------------------
// Server Info tab
// ---------------------------------------------------------------------------

const INFO_SECTIONS: readonly { id: 'server' | 'memory' | 'clients' | 'stats' | 'keyspace'; label: string }[] = [
  { id: 'server', label: 'Server' },
  { id: 'memory', label: 'Memory' },
  { id: 'clients', label: 'Clients' },
  { id: 'stats', label: 'Stats' },
  { id: 'keyspace', label: 'Keyspace' },
]

export function ServerInfoPanel(): React.JSX.Element {
  const info = useResource((api) => serverInfo(api), [])

  if (info.state.phase === 'loading') {
    return (
      <p className="screen-loading" data-testid="explorer-info-loading">
        <span className="spinner" aria-hidden="true" /> Loading server info…
      </p>
    )
  }
  if (info.state.phase === 'error') {
    return <ErrorState error={info.state.error} onRetry={info.reload} />
  }

  const data = info.state.data
  return (
    <div className="explorer-info" data-testid="explorer-info">
      {INFO_SECTIONS.map((section) => {
        const rows = Object.entries(data[section.id] ?? {})
        return (
          <div className="explorer-info-section" key={section.id} data-testid={`explorer-info-${section.id}`}>
            <h4 className="explorer-info-title">{section.label}</h4>
            {rows.length === 0 ? (
              <p className="explorer-note">no fields reported</p>
            ) : (
              <div className="explorer-info-rows">
                {rows.map(([k, v]) => (
                  <div className="explorer-info-row" key={k}>
                    <code className="explorer-info-key">{k}</code>
                    <code className="explorer-info-val">{formatScalar(v)}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
