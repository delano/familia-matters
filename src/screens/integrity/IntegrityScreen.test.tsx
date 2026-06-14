// src/screens/integrity/IntegrityScreen.test.tsx
//
// Smoke coverage for the Integrity screen, driven through a fake AdminApi (the
// way every screen test works) and a fake EventSource injected via the
// openStream seam — no real timers, no real network. The points under test:
//   · an issues report renders the 5 sections, the summary strip, and the
//     instance count reconciliation (timeline vs scan);
//   · a healthy report renders the explicit "no issues" state;
//   · an unreachable backend renders ErrorState, never seed data;
//   · the streamed apply (start → phases → done via the fake stream) animates
//     live progress and renders the repaired summary built from the done frame.

import type React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminApi } from '../../api/client'
import type {
  RepairStream,
  RepairStreamFrame,
  RepairStreamHandlers,
} from '../../api/sse'
import { AuthProvider } from '../../auth/AuthProvider'
import type { AppDescriptor } from '../../data/descriptor'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from '../../types'
import { IntegrityScreen } from './IntegrityScreen'
import type { HealthReport } from './api'

afterEach(cleanup)

const CLAIMS: Claims = {
  sub: 'admin',
  role: 'admin',
  permissions: ['repair'],
  exp: Math.floor(Date.now() / 1000) + 3600,
}

const META: AppDescriptor = {
  generated_at: 1749200000,
  familia_version: '2.10.1',
  models: [
    { model: 'customer', class: 'Customer' },
    { model: 'session', class: 'Session' },
  ],
}

/** The issues fixture: one of every issue type (matches health_check.sample.json). */
const ISSUES_REPORT: HealthReport = {
  healthy: false,
  model: 'Customer',
  checked_at: 1749200000,
  complete: true,
  instances: {
    count_timeline: 1284,
    count_scan: 1282,
    phantoms: ['cust_legacy_01', 'cust_legacy_02'],
    missing: ['cust_9931'],
  },
  unique_indexes: [{ index_name: 'email_lookup', stale: ['bob@old.example'], missing: ['dana@example.com'] }],
  multi_indexes: [{ index_name: 'status_index', stale_members: ['cust_4410bd'], orphaned_keys: ['customer:status_index:archived'] }],
  participations: [
    {
      collection_name: 'api_keys',
      stale_members: [{ identifier: 'key_dead01', collection_key: 'customer:cust_8f2a91:api_keys', reason: 'record_missing' }],
    },
  ],
  related_fields: { healthy: true, checked: ['recent_logins'] },
  cross_references: {
    status: 'issues_found',
    in_instances_missing_unique_index: ['cust_2200ee'],
    index_points_to_wrong_identifier: [
      { index: 'email_lookup', field_value: 'erin@example.com', points_to: 'cust_old99', actual: 'cust_2200ee' },
    ],
  },
  summary: {
    total_issues: 9,
    by_type: {
      phantoms: 2,
      missing: 1,
      stale_unique_index: 1,
      missing_unique_index: 1,
      stale_multi_member: 1,
      orphaned_index_key: 1,
      stale_participation: 1,
      cross_ref_missing_index: 1,
      cross_ref_wrong_target: 1,
    },
  },
}

const HEALTHY_REPORT: HealthReport = {
  healthy: true,
  model: 'Customer',
  checked_at: 1749200314,
  complete: true,
  instances: { count_timeline: 1282, count_scan: 1282, phantoms: [], missing: [] },
  unique_indexes: [],
  multi_indexes: [],
  participations: [],
  cross_references: { status: 'clean', in_instances_missing_unique_index: [], index_points_to_wrong_identifier: [] },
  summary: { total_issues: 0, by_type: {} },
}

const DONE_FRAME: RepairStreamFrame = {
  event: 'done',
  healthy: true,
  at: 1749200214,
  summary: {
    phantoms_removed: 2,
    missing_added: 1,
    indexes_rebuilt: 2,
    stale_members_removed: 2,
    orphaned_keys_removed: 1,
    participations_fixed: 1,
    cross_refs_fixed: 2,
  },
}

type Handler = (path: string, init?: RequestInit) => ApiOutcome<unknown> | undefined

function fakeApi(handler: Handler, claims: Claims = CLAIMS): AdminApi {
  return {
    getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims })),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims })),
    logout: vi.fn(async () => ({ ok: true })),
    request: vi.fn(async (path: string, init?: RequestInit) =>
      handler(path, init) ??
      ({ ok: false, reason: 'error', status: 404, body: { error: 'not_found' } } as ApiOutcome<unknown>),
    ),
  } as unknown as AdminApi
}

/** A scriptable fake repair stream injected through the openStream seam. */
interface FakeStreamControl {
  handlers: RepairStreamHandlers
  closed: boolean
}

function makeFakeStream(): {
  openStream: (model: string, handlers: RepairStreamHandlers) => RepairStream
  control: { current: FakeStreamControl | null }
} {
  const control = { current: null as FakeStreamControl | null }
  const openStream = (_model: string, handlers: RepairStreamHandlers): RepairStream => {
    const c: FakeStreamControl = { handlers, closed: false }
    control.current = c
    return {
      close() {
        c.closed = true
      },
    }
  }
  return { openStream, control }
}

function renderIntegrity(
  handler: Handler,
  opts?: { claims?: Claims; openStream?: (m: string, h: RepairStreamHandlers) => RepairStream },
) {
  const api = fakeApi(handler, opts?.claims)
  render(
    <AuthProvider api={api}>
      <IntegrityScreen openStream={opts?.openStream as never} />
    </AuthProvider>,
  )
  return api
}

function standardHandler(report: HealthReport): Handler {
  return (path) => {
    if (path === '/_meta') return { ok: true, data: META }
    if (path === '/integrity/customer') return { ok: true, data: report }
    return undefined
  }
}

describe('IntegrityScreen — root + states', () => {
  it('always renders the root screen testid (tolerates a {} request)', async () => {
    renderIntegrity(() => ({ ok: true, data: {} }))
    expect(await screen.findByTestId('screen-integrity')).toBeInTheDocument()
  })

  it('tolerates an unauthenticated request without throwing, root still renders', async () => {
    renderIntegrity(() => ({ ok: false, reason: 'unauthenticated' }))
    expect(await screen.findByTestId('screen-integrity')).toBeInTheDocument()
  })

  it('renders the issues report: sections, summary strip, count reconciliation', async () => {
    renderIntegrity(standardHandler(ISSUES_REPORT))

    expect(await screen.findByTestId('integrity-banner-issues')).toHaveTextContent('9 issues')
    // All five audit-component sections render.
    for (const id of ['instances', 'unique_indexes', 'multi_indexes', 'participations', 'cross_references']) {
      expect(screen.getByTestId(`integrity-section-${id}`)).toBeInTheDocument()
    }
    // Summary strip reflects the by_type counts.
    expect(screen.getByTestId('integrity-summary')).toHaveTextContent('9 total')
    expect(screen.getByTestId('integrity-summary-phantoms')).toHaveTextContent('2')
    // Instance count reconciliation: timeline (O(1)) vs scan (authoritative).
    const recon = screen.getByTestId('integrity-count-recon')
    expect(within(recon).getByTestId('integrity-count-timeline')).toHaveTextContent('1284')
    expect(within(recon).getByTestId('integrity-count-scan')).toHaveTextContent('1282')
    expect(recon).toHaveTextContent('inflated by 2 phantoms')
  })

  it('renders the explicit healthy state when there are no issues', async () => {
    renderIntegrity(standardHandler(HEALTHY_REPORT))

    expect(await screen.findByTestId('integrity-banner-healthy')).toHaveTextContent('No issues found')
    // No summary strip is shown when healthy.
    expect(screen.queryByTestId('integrity-summary')).not.toBeInTheDocument()
    // The sections still render (all clean).
    expect(screen.getByTestId('integrity-section-instances')).toHaveAttribute('data-section-clean', 'true')
  })

  it('an unreachable backend renders ErrorState, never a fabricated report', async () => {
    renderIntegrity((path) => (path === '/_meta' ? { ok: true, data: META } : { ok: false, reason: 'error' }))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')
    expect(screen.queryByTestId('integrity-content')).not.toBeInTheDocument()
  })
})

describe('IntegrityScreen — dry-run + streamed apply', () => {
  it('previews a repair, then streams start → phases → done into the repaired summary', async () => {
    const user = userEvent.setup()
    const { openStream, control } = makeFakeStream()
    renderIntegrity(
      (path, init) => {
        if (path === '/_meta') return { ok: true, data: META }
        if (path === '/integrity/customer' && (init?.method ?? 'GET') === 'GET') {
          return { ok: true, data: ISSUES_REPORT }
        }
        if (path === '/integrity/customer/repair?dry_run=true' && init?.method === 'POST') {
          return { ok: true, data: { dry_run: true, report: ISSUES_REPORT } }
        }
        return undefined
      },
      { openStream },
    )

    // Issues → Preview repair → dry-run panel.
    await screen.findByTestId('integrity-banner-issues')
    await user.click(screen.getByTestId('integrity-preview-repair'))
    const dryrun = await screen.findByTestId('integrity-dryrun')
    expect(dryrun).toHaveTextContent('nothing has been written')

    // Apply → opens the stream (controls lock, no real EventSource).
    await user.click(screen.getByTestId('integrity-apply'))
    await screen.findByTestId('integrity-repairing')
    expect(control.current).not.toBeNull()
    const { handlers } = control.current!

    // Drive frames: start, an instances phase, then done.
    act(() => {
      handlers.onFrame({ event: 'start', model: 'Customer', dry_run: false, at: 1749200200 })
      handlers.onFrame({ phase: 'instances', current: 428, total: 1284 })
    })
    await waitFor(() =>
      expect(screen.getByTestId('integrity-phase-instances')).toHaveTextContent('428 / 1284'),
    )

    act(() => {
      handlers.onFrame({ phase: 'cross_references', current: 1, total: 1 })
      handlers.onFrame(DONE_FRAME)
      handlers.onDone?.(DONE_FRAME)
    })

    // Repaired summary grid built from the done frame.
    const repaired = await screen.findByTestId('integrity-repaired')
    expect(within(repaired).getByTestId('integrity-repaired-phantoms_removed')).toHaveTextContent('2')
    expect(within(repaired).getByTestId('integrity-repaired-indexes_rebuilt')).toHaveTextContent('2')
    expect(within(repaired).getByTestId('integrity-repaired-cross_refs_fixed')).toHaveTextContent('2')
  })

  it('a mid-stream server error renders the partial panel with the phase and code', async () => {
    const user = userEvent.setup()
    const { openStream, control } = makeFakeStream()
    renderIntegrity(
      (path, init) => {
        if (path === '/_meta') return { ok: true, data: META }
        if (path === '/integrity/customer' && (init?.method ?? 'GET') === 'GET') {
          return { ok: true, data: ISSUES_REPORT }
        }
        if (path.includes('/repair?dry_run=true')) {
          return { ok: true, data: { dry_run: true, report: ISSUES_REPORT } }
        }
        return undefined
      },
      { openStream },
    )

    await screen.findByTestId('integrity-banner-issues')
    await user.click(screen.getByTestId('integrity-preview-repair'))
    await user.click(await screen.findByTestId('integrity-apply'))
    await screen.findByTestId('integrity-repairing')

    const { handlers } = control.current!
    act(() => {
      handlers.onFrame({ phase: 'instances', current: 500, total: 1284 })
      handlers.onServerError?.('worker_crashed', { error: 'worker_crashed' })
    })

    const partial = await screen.findByTestId('integrity-partial')
    expect(partial).toHaveTextContent('worker_crashed')
    expect(partial).toHaveTextContent('Instances')
  })

  it('a stream connection error renders connlost AND probes the session (so a mid-repair 401 opens reauth)', async () => {
    const user = userEvent.setup()
    const { openStream, control } = makeFakeStream()
    const api = renderIntegrity(
      (path, init) => {
        if (path === '/_meta') return { ok: true, data: META }
        if (path === '/integrity/customer' && (init?.method ?? 'GET') === 'GET') {
          return { ok: true, data: ISSUES_REPORT }
        }
        if (path.includes('/repair?dry_run=true')) {
          return { ok: true, data: { dry_run: true, report: ISSUES_REPORT } }
        }
        return undefined
      },
      { openStream },
    )

    await screen.findByTestId('integrity-banner-issues')
    await user.click(screen.getByTestId('integrity-preview-repair'))
    await user.click(await screen.findByTestId('integrity-apply'))
    await screen.findByTestId('integrity-repairing')

    const { handlers } = control.current!
    act(() => {
      handlers.onConnectionError?.()
    })

    // The connlost panel renders (the stream never reconnects)…
    expect(await screen.findByTestId('integrity-connlost')).toBeInTheDocument()
    // …AND the session is probed via /auth/session. EventSource hides the HTTP
    // status, so this probe is the only way a session that expired mid-repair
    // routes to reauth: the AuthProvider turns its 401 into session/expired
    // (covered in AuthProvider.test.tsx), matching every REST path's 401 handling.
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/auth/session'))
  })
})

describe('IntegrityScreen — permission gating', () => {
  it('disables repair affordances and shows the requires-permission note when claims lack repair', async () => {
    const noRepair: Claims = { ...CLAIMS, permissions: [] }
    renderIntegrity(standardHandler(ISSUES_REPORT), { claims: noRepair })

    await screen.findByTestId('integrity-banner-issues')
    expect(screen.getByTestId('integrity-noperm-note')).toHaveTextContent('permission:repair')
    expect(screen.getByTestId('integrity-preview-repair')).toBeDisabled()
  })

  it('a 403 on the dry-run renders the forbidden ErrorState, still signed in', async () => {
    const user = userEvent.setup()
    renderIntegrity((path, init) => {
      if (path === '/_meta') return { ok: true, data: META }
      if (path === '/integrity/customer' && (init?.method ?? 'GET') === 'GET') {
        return { ok: true, data: ISSUES_REPORT }
      }
      if (path.includes('/repair')) {
        return { ok: false, reason: 'forbidden', message: 'read_only', body: { error: 'read_only' } }
      }
      return undefined
    })

    await screen.findByTestId('integrity-banner-issues')
    await user.click(screen.getByTestId('integrity-preview-repair'))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-code', 'read_only')
    // The report below stays readable — still signed in, no dry-run panel.
    expect(screen.getByTestId('integrity-content')).toBeInTheDocument()
    expect(screen.queryByTestId('integrity-dryrun')).not.toBeInTheDocument()
  })
})
