// src/screens/home/HomeScreen.test.tsx
//
// Smoke coverage for the home health dashboard (R-HOME-1..3), driven through a
// fake AdminApi the way every screen test works. The contract points that
// matter: the fleet table is built from /_meta + per-model count_fast + the
// stale-index flag; a failed count for one model renders "—", never 0; a
// backend without stale introspection renders "unavailable", never "ok"; the
// integrity column is an HONEST "not checked" link, never a fabricated health
// dot; the vitals strip renders the /raw/info subset; recent activity reuses
// the audit trail and links to it; and each panel fails independently into the
// shared ErrorState, never a blank or seeded section.

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminApi } from '../../api/client'
import { AuthProvider } from '../../auth/AuthProvider'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from '../../types'
import { HomeScreen } from './HomeScreen'

afterEach(cleanup)

function claims(): Claims {
  return { sub: 'admin', role: 'admin', permissions: [], exp: Math.floor(Date.now() / 1000) + 3600 }
}

const META = {
  generated_at: 1751558400,
  familia_version: '2.10.1',
  models: [
    {
      model: 'customer',
      class: 'Customer',
      logical_database: 0,
      expiration: { policy: 'default', default_seconds: 86400 },
      indexes: [
        { index_name: 'email_lookup', coordinate: 'customer:email_lookup' },
        { index_name: 'status_index', coordinate: 'customer:status_index' },
      ],
    },
    { model: 'session', class: 'Session', logical_database: 1, indexes: [] },
  ],
}

const STALE = { stale_indexes: [{ index: 'email_lookup', coordinate: 'customer:email_lookup' }] }

const INFO = {
  server: { uptime_in_seconds: '90061', redis_version: '7.2.4' },
  memory: { used_memory_human: '2.10M', used_memory_peak_human: '3.00M', maxmemory_policy: 'noeviction' },
  clients: { connected_clients: '3', maxclients: '10000' },
  stats: { instantaneous_ops_per_sec: '5' },
  keyspace: { db0: 'keys=1284,expires=10,avg_ttl=0', db1: 'keys=42,expires=42,avg_ttl=1000' },
}

const AUDIT = {
  entries: [
    { at: 1751558400, actor: 'admin', action: 'destroy', model: 'customer', id: 'cust_9f3a2b' },
    { at: 1751558100, actor: 'admin', action: 'reveal', model: 'customer', id: 'cust_9f3a2b', field: 'api_secret' },
  ],
  count: 2,
  limit: 8,
}

type Outcome = ApiOutcome<unknown>
type Handler = (path: string) => Outcome | undefined

function counted(count: number): Outcome {
  return { ok: true, data: { count_fast: count } }
}

/** Route each path to its fixture; unknown paths fall through to a 404. */
function standardHandler(path: string): Outcome | undefined {
  if (path === '/_meta') return { ok: true, data: META }
  if (path === '/integrity/_stale_indexes') return { ok: true, data: STALE }
  if (path.startsWith('/models/customer/records')) return counted(1284)
  if (path.startsWith('/models/session/records')) return counted(42)
  if (path === '/raw/info') return { ok: true, data: INFO }
  if (path.startsWith('/audit')) return { ok: true, data: AUDIT }
  return undefined
}

function fakeApi(handler: Handler): AdminApi {
  return {
    getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims: claims() })),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: claims() })),
    logout: vi.fn(async () => ({ ok: true })),
    request: vi.fn(
      async (path: string) =>
        handler(path) ?? ({ ok: false, reason: 'error', status: 404, body: { error: 'not_found' } } as Outcome),
    ),
  } as unknown as AdminApi
}

function renderHome(handler: Handler = standardHandler) {
  render(
    <AuthProvider api={fakeApi(handler)}>
      <HomeScreen />
    </AuthProvider>,
  )
}

describe('the fleet overview (R-HOME-1)', () => {
  it('renders one row per model with count, stale flag, and an honest integrity link', async () => {
    renderHome()
    expect(await screen.findByTestId('screen-home')).toBeInTheDocument()

    const table = await screen.findByTestId('home-fleet-table')
    expect(within(table).getAllByRole('row')).toHaveLength(3) // header + 2 models

    // Fast count, grouped and badged approximate — never presented as exact.
    expect(screen.getByTestId('home-fleet-count-customer')).toHaveTextContent('1,284')
    expect(screen.getByTestId('home-fleet-count-customer')).toHaveTextContent(/approx/i)

    // Only customer's email_lookup is stale; session has no indexes → ok.
    expect(screen.getByTestId('home-fleet-stale-customer')).toHaveTextContent(/1 stale/i)
    expect(screen.getByTestId('home-fleet-stale-session')).toHaveTextContent(/ok/i)

    // Integrity is an honest "not checked" link to the Integrity screen —
    // never a fabricated health dot (no cached result exists on this backend).
    const integrity = screen.getByTestId('home-fleet-integrity-customer')
    expect(integrity).toHaveTextContent(/not checked/i)
    expect(within(integrity).getByRole('link')).toHaveAttribute('href', '#/integrity')
  })

  it('renders "—" for a model whose count call fails, never 0', async () => {
    renderHome((path) => {
      if (path.startsWith('/models/session/records')) return { ok: false, reason: 'error', status: 500 }
      return standardHandler(path)
    })
    const cell = await screen.findByTestId('home-fleet-count-session')
    expect(cell).toHaveTextContent('—')
    expect(cell).not.toHaveTextContent('0')
  })

  it('flags the stale column "unavailable" when the backend lacks introspection', async () => {
    renderHome((path) => {
      if (path === '/integrity/_stale_indexes') {
        return { ok: false, reason: 'error', status: 400, body: { error: 'introspection unavailable' } }
      }
      return standardHandler(path)
    })
    expect(await screen.findByTestId('home-fleet-stale-customer')).toHaveTextContent(/unavailable/i)
  })

  it('shows the honest empty panel when no models are registered', async () => {
    renderHome((path) => (path === '/_meta' ? { ok: true, data: { models: [] } } : standardHandler(path)))
    expect(await screen.findByTestId('home-fleet-empty')).toHaveTextContent(/no models/i)
    expect(screen.queryByTestId('home-fleet-table')).not.toBeInTheDocument()
  })
})

describe('the server vitals strip (R-HOME-3)', () => {
  it('renders the /raw/info subset and per-DB keyspace', async () => {
    renderHome()
    expect(await screen.findByTestId('home-vitals-uptime')).toHaveTextContent('1d 1h 1m')
    expect(screen.getByTestId('home-vitals-memory')).toHaveTextContent('2.10M')
    expect(screen.getByTestId('home-vitals-clients')).toHaveTextContent('3')
    // Keyspace rows, one per logical DB, with parsed key counts.
    expect(screen.getByTestId('home-vitals-db-db0')).toHaveTextContent('1,284')
    expect(screen.getByTestId('home-vitals-db-db1')).toHaveTextContent('42')
  })
})

describe('recent activity (R-HOME-2)', () => {
  it('lists the latest audit entries and links to the full trail', async () => {
    renderHome()
    const list = await screen.findByTestId('home-activity-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByTestId('home-activity-entry-0')).toHaveTextContent('destroy')
    expect(screen.getByTestId('home-activity-more')).toHaveAttribute('href', '#/audit')
  })

  it('shows the honest empty state when the sink is empty', async () => {
    renderHome((path) => (path.startsWith('/audit') ? { ok: true, data: { entries: [] } } : standardHandler(path)))
    expect(await screen.findByTestId('home-activity-empty')).toBeInTheDocument()
  })
})

describe('panels fail independently (no blank, no seed)', () => {
  it('a fleet failure renders ErrorState in that panel while vitals still load', async () => {
    renderHome((path) => (path === '/_meta' ? { ok: false, reason: 'error' } : standardHandler(path)))

    const fleet = await screen.findByTestId('home-fleet')
    const pane = await within(fleet).findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')

    // The vitals panel is unaffected — one section's outage never blanks another.
    expect(await screen.findByTestId('home-vitals-uptime')).toBeInTheDocument()
    expect(within(fleet).queryByTestId('home-fleet-table')).not.toBeInTheDocument()
  })
})
