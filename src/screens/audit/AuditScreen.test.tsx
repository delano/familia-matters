// src/screens/audit/AuditScreen.test.tsx
//
// Smoke coverage for the audit-trail screen (R-AUD-1), driven through a fake
// AdminApi the way every screen test works. The contract points that matter:
// entries render in received (newest-first) order from a real response — never a
// seed; the wire shape is {entries, count, limit}; an unreachable backend
// renders the shared ErrorState (not an empty table); an empty window renders
// the honest empty panel; a row expands to its full detail including the destroy
// snapshot; the action chips filter the loaded window; and the window selector
// re-fetches with ?limit=. The entries mirror resources/00-assets/fixtures/
// audit.sample.json.

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminApi } from '../../api/client'
import { AuthProvider } from '../../auth/AuthProvider'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from '../../types'
import { AuditScreen } from './AuditScreen'

afterEach(cleanup)

function claims(): Claims {
  return {
    sub: 'admin',
    role: 'admin',
    permissions: [],
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
}

/** Newest-first entries, as the backend's AuditLog.recent returns them. */
const ENTRIES = [
  {
    at: 1751558400,
    actor: 'admin',
    action: 'destroy',
    model: 'customer',
    id: 'cust_9f3a2b',
    snapshot: { email: 'jed@example.com', name: 'Jed', api_secret: '[CONCEALED]' },
  },
  { at: 1751558100, actor: 'admin', action: 'reveal', model: 'customer', id: 'cust_9f3a2b', field: 'api_secret' },
  { at: 1751557900, actor: 'admin', action: 'repair', model: 'customer', via: 'stream' },
  { at: 1751557600, actor: 'admin', action: 'run_migrations', dry_run: false },
  { at: 1751557200, actor: 'admin', action: 'run_command', cmd: 'GET', args: ['customer:cust_9f3a2b:object'] },
  { at: 1751556800, actor: 'admin', action: 'create', model: 'session', id: 'sess_1122' },
]

type Handler = (path: string, init?: RequestInit) => ApiOutcome<unknown> | undefined

interface FakeApi {
  api: AdminApi
  calls: { path: string; method: string }[]
}

function fakeApi(handler: Handler): FakeApi {
  const calls: { path: string; method: string }[] = []
  const api = {
    getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims: claims() })),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: claims() })),
    logout: vi.fn(async () => ({ ok: true })),
    request: vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method ?? 'GET' })
      return (
        handler(path, init) ??
        ({ ok: false, reason: 'error', status: 404, body: { error: 'not_found' } } as ApiOutcome<unknown>)
      )
    }),
  } as unknown as AdminApi
  return { api, calls }
}

/** Happy-path handler: any /audit GET returns the fixture entries. */
function standardHandler(path: string): ApiOutcome<unknown> | undefined {
  if (path.startsWith('/audit')) {
    return { ok: true, data: { entries: ENTRIES, count: ENTRIES.length, limit: 50 } }
  }
  return undefined
}

function renderAudit(handler: Handler = standardHandler): FakeApi {
  const fake = fakeApi(handler)
  render(
    <AuthProvider api={fake.api}>
      <AuditScreen />
    </AuthProvider>,
  )
  return fake
}

describe('the root testid renders in every state', () => {
  it('renders screen-audit and the honest empty panel when the window is empty', async () => {
    renderAudit(() => ({ ok: true, data: { entries: [], count: 0, limit: 50 } }))
    expect(await screen.findByTestId('screen-audit')).toBeInTheDocument()
    expect(await screen.findByTestId('audit-empty')).toHaveTextContent(/no audit entries/i)
    // Nothing is fabricated in the empty state.
    expect(screen.queryByTestId('audit-list')).not.toBeInTheDocument()
  })

  it('treats an absent entries key as empty, not an error', async () => {
    renderAudit(() => ({ ok: true, data: {} }))
    expect(await screen.findByTestId('audit-empty')).toBeInTheDocument()
  })
})

describe('entries render from a real response, newest-first', () => {
  it('lists every entry with its action badge, actor, and target', async () => {
    renderAudit()

    const list = await screen.findByTestId('audit-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(ENTRIES.length)

    // The first (newest) entry is the destroy, targeting model:id.
    const first = screen.getByTestId('audit-entry-0')
    expect(first).toHaveTextContent('destroy')
    expect(screen.getByTestId('audit-target-0')).toHaveTextContent('customer:cust_9f3a2b')
    expect(screen.getByTestId('audit-actor-0')).toHaveTextContent('admin')

    // A run_command entry carries no model/id — its command is the target.
    expect(screen.getByTestId('audit-target-4')).toHaveTextContent('GET')

    // The mount fetch carried the default window as ?limit=50.
    const fake = screen.getByTestId('audit-count')
    expect(fake).toHaveTextContent(/6 entries loaded/i)
  })

  it('mounts against GET /audit?limit=50 by default', async () => {
    const fake = renderAudit()
    await screen.findByTestId('audit-list')
    expect(fake.calls.some((c) => c.path === '/audit?limit=50' && c.method === 'GET')).toBe(true)
  })
})

describe('a row expands to its full detail, including the destroy snapshot', () => {
  it('reveals the snapshot with encrypted fields masked', async () => {
    const user = userEvent.setup()
    renderAudit()
    await screen.findByTestId('audit-list')

    // Collapsed: no detail yet.
    expect(screen.queryByTestId('audit-entry-detail-0')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('audit-entry-toggle-0'))

    const detail = await screen.findByTestId('audit-entry-detail-0')
    const snapshot = within(detail).getByTestId('audit-snapshot-0')
    expect(snapshot).toHaveTextContent('jed@example.com')
    // The encrypted field is masked in the sink — the UI shows the mask verbatim.
    expect(snapshot).toHaveTextContent('[CONCEALED]')
  })

  it('shows a plain detail list for a non-destroy entry (reveal → field)', async () => {
    const user = userEvent.setup()
    renderAudit()
    await screen.findByTestId('audit-list')

    await user.click(screen.getByTestId('audit-entry-toggle-1'))
    const detail = await screen.findByTestId('audit-entry-detail-1')
    expect(detail).toHaveTextContent('field')
    expect(detail).toHaveTextContent('api_secret')
    expect(within(detail).queryByTestId('audit-snapshot-1')).not.toBeInTheDocument()
  })
})

describe('action chips filter the loaded window', () => {
  it('filters to a single action and resets with All', async () => {
    const user = userEvent.setup()
    renderAudit()
    await screen.findByTestId('audit-list')

    await user.click(screen.getByTestId('audit-filter-destroy'))
    // Only the destroy row survives; the create row is gone.
    expect(screen.getByTestId('audit-entry-0')).toBeInTheDocument()
    expect(screen.queryByTestId('audit-entry-5')).not.toBeInTheDocument()
    expect(screen.getByTestId('audit-count')).toHaveTextContent(/1 of 6 loaded entries match/i)

    await user.click(screen.getByTestId('audit-filter-all'))
    expect(screen.getByTestId('audit-entry-5')).toBeInTheDocument()
  })
})

describe('the window selector re-fetches with a wider limit', () => {
  it('changing the window issues GET /audit?limit=200', async () => {
    const user = userEvent.setup()
    const fake = renderAudit()
    await screen.findByTestId('audit-list')

    await user.selectOptions(screen.getByTestId('audit-window-select'), '200')

    await vi.waitFor(() => {
      expect(fake.calls.some((c) => c.path === '/audit?limit=200')).toBe(true)
    })
  })
})

describe('failure is an explicit error state (no seed, no empty table)', () => {
  it('an unreachable backend renders ErrorState', async () => {
    renderAudit(() => ({ ok: false, reason: 'error' }))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')
    expect(screen.queryByTestId('audit-list')).not.toBeInTheDocument()
  })
})
