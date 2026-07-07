// src/screens/home/HomeScreen.tsx
//
// The home health dashboard (R-HOME-1..3) — the landing surface for a tool
// whose identity is "health and maintenance console." It answers "is my data
// healthy?" at a glance, read-only, from endpoints that already exist. Three
// independent panels, each with its own fetch and its own loading / error /
// ready states, so one section going dark never blanks the others:
//
//   Fleet overview (R-HOME-1)   one row per model: fast count (badged
//                               approximate), logical DB, TTL policy, stale-
//                               index flag, and an HONEST integrity column —
//                               "not checked", linking to the Integrity screen,
//                               never a health dot we cannot substantiate (there
//                               is no cached per-model result on this backend
//                               yet; that needs R-INT-6). No scan runs on load.
//   Server vitals (R-HOME-3)    the /raw/info subset an operator checks
//                               reflexively: uptime, memory, clients, keyspace.
//   Recent activity (R-HOME-2)  the newest audit-trail entries inline, linking
//                               to the full Audit screen (R-AUD-1).
//
// Every failed fetch renders the shared <ErrorState> for its panel — never seed
// data, never an empty table standing in for an outage.

import type React from 'react'

import { ErrorState } from '../../components/ErrorState'
import { useResource } from '../../data/useResource'
import { routeHref } from '../../router/hashRouter'
import type { AuditEntry, AuditResponse } from '../audit/api'
import { listAudit } from '../audit/api'
import { auditActionTone, auditDateTime, auditTarget, formatAuditTime } from '../audit/format'
import type { FleetData, FleetRow, ServerInfo } from './api'
import { loadFleet, loadServerInfo } from './api'
import {
  formatCount,
  formatKeyCount,
  formatUptime,
  infoValue,
  parseKeyspace,
  ttlSummary,
} from './format'
import './home.css'

/** How many recent audit entries the activity panel pulls. */
const RECENT_ACTIVITY = 8

export function HomeScreen(): React.JSX.Element {
  return (
    <section className="home-screen" data-testid="screen-home">
      <header className="home-head">
        <h2 className="screen-title">Health overview</h2>
        <p className="home-sub">
          A read-only glance across the fleet. Nothing here runs a scan — integrity
          checks stay a deliberate action on the Integrity screen.
        </p>
      </header>

      <div className="home-grid">
        <FleetPanel />
        <div className="home-aside">
          <VitalsPanel />
          <ActivityPanel />
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// R-HOME-1 — Fleet overview
// ---------------------------------------------------------------------------

function FleetPanel(): React.JSX.Element {
  const { state, reload } = useResource<FleetData>((api) => loadFleet(api), [])

  return (
    <section className="home-panel home-fleet" data-testid="home-fleet" aria-label="Fleet health">
      <div className="home-panel-head">
        <h3 className="home-panel-title">Models</h3>
        <button type="button" className="home-refresh" data-testid="home-fleet-refresh" onClick={reload}>
          Refresh
        </button>
      </div>

      {state.phase === 'loading' && (
        <p className="home-loading" data-testid="home-fleet-loading">
          <span className="spinner" aria-hidden="true" /> Loading models…
        </p>
      )}
      {state.phase === 'error' && <ErrorState error={state.error} onRetry={reload} />}
      {state.phase === 'ready' && <FleetTable data={state.data} />}
    </section>
  )
}

function FleetTable({ data }: { data: FleetData }): React.JSX.Element {
  if (data.rows.length === 0) {
    return (
      <div className="home-empty" data-testid="home-fleet-empty">
        <h4>No models registered</h4>
        <p>
          The descriptor reported no models. Nothing was fabricated — register a
          Familia model and it appears here from <code>/_meta</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="home-table-wrap">
      <table className="home-table" data-testid="home-fleet-table">
        <thead>
          <tr>
            <th scope="col">Model</th>
            <th scope="col">Records</th>
            <th scope="col">DB</th>
            <th scope="col">TTL</th>
            <th scope="col">Indexes</th>
            <th scope="col">Integrity</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <FleetRowView key={row.model} row={row} staleAvailable={data.staleAvailable} />
          ))}
        </tbody>
      </table>
      <p className="home-foot-note">
        Counts are the O(1) timeline size — fast, and approximate (may include
        phantoms the Integrity screen reconciles).
      </p>
    </div>
  )
}

function FleetRowView({
  row,
  staleAvailable,
}: {
  row: FleetRow
  staleAvailable: boolean
}): React.JSX.Element {
  return (
    <tr data-testid={`home-fleet-row-${row.model}`}>
      <th scope="row" className="cell-mono">
        {row.model}
        {row.className && row.className !== row.model && (
          <span className="home-classname"> · {row.className}</span>
        )}
      </th>
      <td className="home-count" data-testid={`home-fleet-count-${row.model}`}>
        {formatCount(row.count)}
        <span className="home-approx" title="O(1) timeline count; may include phantoms">
          ~approx
        </span>
      </td>
      <td className="cell-mono">{row.logicalDatabase ?? 0}</td>
      <td>{ttlSummary(row.expiration)}</td>
      <td data-testid={`home-fleet-stale-${row.model}`}>
        {!staleAvailable ? (
          <span className="home-muted" title="Backend lacks stale-index introspection">
            unavailable
          </span>
        ) : row.staleIndexes.length > 0 ? (
          <span className="home-flag home-flag--stale">
            {row.staleIndexes.length} stale
          </span>
        ) : (
          <span className="home-muted">ok</span>
        )}
      </td>
      <td data-testid={`home-fleet-integrity-${row.model}`}>
        {/* Honest: no cached per-model health result exists on this backend
            (needs R-INT-6's sweep + a cache). We never show a health dot we
            cannot substantiate — only a link to run the check. */}
        <a className="home-check-link" href={routeHref('/integrity')}>
          not checked · check
        </a>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// R-HOME-3 — Server vitals
// ---------------------------------------------------------------------------

function VitalsPanel(): React.JSX.Element {
  const { state, reload } = useResource<ServerInfo>((api) => loadServerInfo(api), [])

  return (
    <section className="home-panel home-vitals" data-testid="home-vitals" aria-label="Server vitals">
      <div className="home-panel-head">
        <h3 className="home-panel-title">Server vitals</h3>
        <button type="button" className="home-refresh" data-testid="home-vitals-refresh" onClick={reload}>
          Refresh
        </button>
      </div>

      {state.phase === 'loading' && (
        <p className="home-loading" data-testid="home-vitals-loading">
          <span className="spinner" aria-hidden="true" /> Reading server info…
        </p>
      )}
      {state.phase === 'error' && <ErrorState error={state.error} onRetry={reload} />}
      {state.phase === 'ready' && <Vitals info={state.data} />}
    </section>
  )
}

function Vitals({ info }: { info: ServerInfo }): React.JSX.Element {
  const uptime = infoValue(info.server, 'uptime_in_seconds')
  const version = infoValue(info.server, 'redis_version')
  const memory = infoValue(info.memory, 'used_memory_human')
  const memoryPeak = infoValue(info.memory, 'used_memory_peak_human')
  const memoryPolicy = infoValue(info.memory, 'maxmemory_policy')
  const clients = infoValue(info.clients, 'connected_clients')
  const maxClients = infoValue(info.clients, 'maxclients')
  const ops = infoValue(info.stats, 'instantaneous_ops_per_sec')
  const keyspace = parseKeyspace(info)

  return (
    <div className="home-vitals-body">
      <dl className="home-tiles">
        <Tile testid="home-vitals-uptime" label="Uptime" value={formatUptime(uptime ? Number(uptime) : undefined)} />
        <Tile
          testid="home-vitals-memory"
          label="Memory"
          value={memory ?? '—'}
          note={memoryPeak ? `peak ${memoryPeak}` : memoryPolicy}
        />
        <Tile
          testid="home-vitals-clients"
          label="Clients"
          value={clients ?? '—'}
          note={maxClients ? `of ${maxClients}` : undefined}
        />
        <Tile testid="home-vitals-version" label="Version" value={version ?? '—'} note={ops ? `${ops} ops/s` : undefined} />
      </dl>

      <div className="home-keyspace" data-testid="home-vitals-keyspace">
        <span className="home-eyebrow">Keyspace</span>
        {keyspace.length === 0 ? (
          <p className="home-muted home-keyspace-empty">No populated logical databases.</p>
        ) : (
          <table className="home-keyspace-table">
            <thead>
              <tr>
                <th scope="col">DB</th>
                <th scope="col">Keys</th>
                <th scope="col">Expiring</th>
              </tr>
            </thead>
            <tbody>
              {keyspace.map((k) => (
                <tr key={k.db} data-testid={`home-vitals-db-${k.db}`}>
                  <th scope="row" className="cell-mono">
                    {k.db}
                  </th>
                  <td>{formatKeyCount(k.keys)}</td>
                  <td>{formatKeyCount(k.expires)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  note,
  testid,
}: {
  label: string
  value: string
  note?: string
  testid: string
}): React.JSX.Element {
  return (
    <div className="home-tile" data-testid={testid}>
      <dt>{label}</dt>
      <dd>
        <span className="home-tile-value">{value}</span>
        {note && <span className="home-tile-note">{note}</span>}
      </dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// R-HOME-2 — Recent activity
// ---------------------------------------------------------------------------

function ActivityPanel(): React.JSX.Element {
  const { state, reload } = useResource<AuditResponse>(
    (api) => listAudit(api, RECENT_ACTIVITY),
    [],
  )

  return (
    <section className="home-panel home-activity" data-testid="home-activity" aria-label="Recent activity">
      <div className="home-panel-head">
        <h3 className="home-panel-title">Recent activity</h3>
        <a className="home-see-all" href={routeHref('/audit')} data-testid="home-activity-more">
          Full trail →
        </a>
      </div>

      {state.phase === 'loading' && (
        <p className="home-loading" data-testid="home-activity-loading">
          <span className="spinner" aria-hidden="true" /> Loading activity…
        </p>
      )}
      {state.phase === 'error' && <ErrorState error={state.error} onRetry={reload} />}
      {state.phase === 'ready' && <ActivityList entries={state.data.entries ?? []} />}
    </section>
  )
}

function ActivityList({ entries }: { entries: AuditEntry[] }): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="home-empty" data-testid="home-activity-empty">
        <h4>No recorded activity</h4>
        <p>The audit sink is empty. Elevated actions appear here as they happen.</p>
      </div>
    )
  }

  return (
    <ul className="home-activity-list" data-testid="home-activity-list">
      {entries.map((entry, i) => {
        const tone = auditActionTone(entry.action)
        const target = auditTarget(entry)
        return (
          // eslint-disable-next-line react/no-array-index-key
          <li key={i} className="home-activity-item" data-testid={`home-activity-entry-${i}`}>
            <span className={`home-badge home-badge--${tone}`}>{entry.action ?? 'unknown'}</span>
            {target && <span className="home-activity-target cell-mono">{target}</span>}
            <span className="home-activity-actor">{entry.actor ?? '—'}</span>
            <time className="home-activity-time" dateTime={auditDateTime(entry.at)}>
              {formatAuditTime(entry.at)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}
