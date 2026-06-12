// src/screens/records/RecordsScreen.test.tsx
//
// Smoke-level coverage for the records screen (T7 AC3/AC4), driven through a
// fake AdminApi the way every screen test works. The de-hardcode contract is
// the point: TWO models with different identifiers and field sets render from
// the descriptor alone (custid vs sessid — any residual customer assumption
// breaks here), failures render ErrorState (never seed data), the reveal flow
// is gated and audited, and the index query never sends a force key.

import type React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminApi } from '../../api/client'
import { AuthProvider } from '../../auth/AuthProvider'
import type { AppDescriptor } from '../../data/descriptor'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from '../../types'
import { RecordsScreen } from './RecordsScreen'

afterEach(cleanup)

const CLAIMS: Claims = {
  sub: 'admin',
  role: 'admin',
  permissions: ['reveal_secrets'],
  exp: Math.floor(Date.now() / 1000) + 3600,
}

/** Two-model descriptor matching the dev fixtures' shape (customer/session). */
const META: AppDescriptor = {
  generated_at: 1781000000,
  familia_version: '2.10.1',
  models: [
    {
      model: 'customer',
      class: 'Customer',
      key_pattern: 'customer:{custid}:object',
      identifier_field: 'custid',
      fields: [
        { name: 'custid', category: 'field', persisted: true, identifier: true },
        { name: 'email', category: 'field', persisted: true },
        { name: 'status', category: 'field', persisted: true },
        { name: 'created_at', category: 'field', persisted: true },
        { name: 'api_secret', category: 'encrypted', persisted: true, display: '[CONCEALED]' },
        { name: 'password', category: 'transient', persisted: false },
      ],
      datatypes: [
        { name: 'recent_logins', type: 'list', scope: 'instance' },
        { name: 'login_count', type: 'counter', scope: 'instance' },
        { name: 'instances', type: 'sorted_set', scope: 'class' },
      ],
      indexes: [
        { index_name: 'email_lookup', field: 'email', cardinality: 'unique', queryable: true },
      ],
      actions: ['list', 'read', 'create', 'update', 'destroy', 'reveal'],
    },
    {
      model: 'session',
      class: 'Session',
      key_pattern: 'session:{sessid}:object',
      identifier_field: 'sessid',
      fields: [
        { name: 'sessid', category: 'field', persisted: true, identifier: true },
        { name: 'custid', category: 'field', persisted: true },
        { name: 'ip_address', category: 'field', persisted: true },
      ],
      actions: ['list', 'read', 'create', 'update', 'destroy'],
    },
  ],
}

const CUSTOMER_REC = {
  custid: 'cust_1',
  email: 'alice@example.com',
  status: 'active',
  created_at: 1781000000,
  api_secret: '[CONCEALED]',
}

type Handler = (path: string, init?: RequestInit) => ApiOutcome<unknown> | undefined

interface FakeApi {
  api: AdminApi
  calls: { path: string; method: string }[]
}

function fakeApi(handler: Handler): FakeApi {
  const calls: { path: string; method: string }[] = []
  const api = {
    getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims: CLAIMS })),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: CLAIMS })),
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

/** The happy-path handler both fixture models answer from. */
function standardHandler(path: string, init?: RequestInit): ApiOutcome<unknown> | undefined {
  const method = init?.method ?? 'GET'
  if (path === '/_meta') return { ok: true, data: META }
  if (path.startsWith('/models/customer/records?')) {
    return {
      ok: true,
      data: { model: 'customer', offset: 0, limit: 50, count_fast: 2, records: [CUSTOMER_REC] },
    }
  }
  if (path.startsWith('/models/session/records?')) {
    return {
      ok: true,
      data: {
        model: 'session',
        offset: 0,
        limit: 50,
        count_fast: 1,
        records: [{ sessid: 'sess_9', custid: 'cust_1', ip_address: '10.0.0.1' }],
      },
    }
  }
  if (path === '/models/customer/records/cust_1' && method === 'GET') {
    return { ok: true, data: { ...CUSTOMER_REC, _key: 'customer:cust_1:object' } }
  }
  if (path.startsWith('/models/customer/records/cust_1/recent_logins')) {
    return {
      ok: true,
      data: { collection: 'recent_logins', offset: 0, limit: 25, members: ['10.0.0.1'] },
    }
  }
  if (path === '/models/customer/records/cust_1/reveal/api_secret' && method === 'POST') {
    return { ok: true, data: { api_secret: 'plain-secret-42', _audit: { actor: 'admin' } } }
  }
  return undefined
}

function renderRecords(handler: Handler = standardHandler): FakeApi {
  const fake = fakeApi(handler)
  render(
    <AuthProvider api={fake.api}>
      <RecordsScreen />
    </AuthProvider>,
  )
  return fake
}

describe('descriptor-driven listing (AC3: two models, zero hardcoding)', () => {
  it('renders the first model with columns from its descriptor fields', async () => {
    renderRecords()

    const table = await screen.findByTestId('records-table')
    // Persisted, non-transient columns only — password (transient) never shows.
    for (const col of ['custid', 'email', 'status', 'created_at', 'api_secret']) {
      expect(within(table).getByRole('columnheader', { name: new RegExp(col) })).toBeInTheDocument()
    }
    expect(within(table).queryByRole('columnheader', { name: /password/ })).not.toBeInTheDocument()
    // The encrypted cell shows the server's mask, the timestamp renders as UTC.
    expect(within(table).getByText('[CONCEALED]')).toBeInTheDocument()
    expect(screen.getByTestId('records-meta')).toHaveTextContent('count_fast')
    expect(screen.getByTestId('records-key-pattern')).toHaveTextContent('customer:{custid}:object')
  })

  it('switches to the second model and renders ITS identifier and fields', async () => {
    const user = userEvent.setup()
    const fake = renderRecords()
    await screen.findByTestId('records-table')

    await user.selectOptions(screen.getByTestId('records-model-select'), 'session')

    const table = await screen.findByTestId('records-table')
    await waitFor(() =>
      expect(within(table).getByRole('columnheader', { name: /sessid/ })).toBeInTheDocument(),
    )
    expect(within(table).getByText('sess_9')).toBeInTheDocument()
    // The open action keys off session's identifier_field, not custid.
    expect(within(table).getByTestId('records-open-sess_9')).toBeInTheDocument()
    expect(
      fake.calls.some((c) => c.path.startsWith('/models/session/records?')),
    ).toBe(true)
  })
})

describe('failure is an explicit error state (AC2: no seed, no offline fallback)', () => {
  it('an unreachable backend on /_meta renders ErrorState, nothing else', async () => {
    renderRecords(() => ({ ok: false, reason: 'error' }))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')
    expect(screen.queryByTestId('records-table')).not.toBeInTheDocument()
  })

  it('an unreachable backend on the records page renders ErrorState, never rows', async () => {
    renderRecords((path, init) =>
      path.startsWith('/models/') ? { ok: false, reason: 'error' } : standardHandler(path, init),
    )

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')
    expect(screen.queryByTestId('records-table')).not.toBeInTheDocument()
    expect(screen.queryByTestId('records-row')).not.toBeInTheDocument()
  })
})

describe('record detail', () => {
  async function openDetail(fake?: Handler): Promise<FakeApi> {
    const user = userEvent.setup()
    const f = renderRecords(fake)
    await screen.findByTestId('records-table')
    await user.click(screen.getByTestId('records-open-cust_1'))
    await screen.findByTestId('records-detail-id')
    return f
  }

  it('renders descriptor fields: identifier, timestamps, transient-as-absent, _key', async () => {
    await openDetail()

    expect(screen.getByTestId('records-detail-id')).toHaveTextContent('cust_1')
    expect(screen.getByTestId('records-detail-key')).toHaveTextContent('customer:cust_1:object')
    expect(screen.getByTestId('field-password')).toHaveTextContent(/transient — never persisted/)
    expect(screen.getByTestId('field-created_at')).toHaveTextContent('UTC')
    // Collections: list members fetched; counter honestly not-exposed.
    expect(await screen.findByTestId('collection-recent_logins')).toHaveTextContent('10.0.0.1')
    expect(screen.getByTestId('collection-login_count-counter')).toHaveTextContent(
      /not exposed/,
    )
  })

  it('reveal is two-step and renders the plaintext + audit note', async () => {
    const user = userEvent.setup()
    const fake = await openDetail()

    await user.click(screen.getByTestId('reveal-api_secret'))
    expect(screen.getByTestId('reveal-confirm-api_secret')).toHaveTextContent(/audited/)

    await user.click(screen.getByTestId('reveal-apply-api_secret'))
    expect(await screen.findByTestId('revealed-api_secret')).toHaveTextContent('plain-secret-42')
    expect(
      fake.calls.some(
        (c) => c.path === '/models/customer/records/cust_1/reveal/api_secret' && c.method === 'POST',
      ),
    ).toBe(true)

    await user.click(screen.getByTestId('conceal-api_secret'))
    expect(screen.queryByTestId('revealed-api_secret')).not.toBeInTheDocument()
  })

  it('a refused reveal (403) renders the forbidden ErrorState, still signed in', async () => {
    const user = userEvent.setup()
    await openDetail((path, init) => {
      if (path.endsWith('/reveal/api_secret')) {
        return { ok: false, reason: 'forbidden', message: 'forbidden', body: { error: 'forbidden' } }
      }
      return standardHandler(path, init)
    })

    await user.click(screen.getByTestId('reveal-api_secret'))
    await user.click(screen.getByTestId('reveal-apply-api_secret'))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'forbidden')
    expect(screen.queryByTestId('revealed-api_secret')).not.toBeInTheDocument()
  })
})

describe('mutations surface specific refusals', () => {
  it('create against read-only mode renders the read_only ErrorState', async () => {
    const user = userEvent.setup()
    renderRecords((path, init) => {
      if (init?.method === 'POST') {
        return { ok: false, reason: 'forbidden', message: 'read_only', body: { error: 'read_only' } }
      }
      return standardHandler(path, init)
    })
    await screen.findByTestId('records-table')

    await user.click(screen.getByTestId('records-new'))
    await user.type(screen.getByTestId('create-input-email'), 'new@example.com')
    await user.click(screen.getByTestId('create-submit'))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-code', 'read_only')
    expect(pane).toHaveTextContent('FAMILIA_ADMIN_READ_ONLY')
    // Still on the form — nothing pretended to succeed.
    expect(screen.getByTestId('records-create')).toBeInTheDocument()
  })

  it('a unique-index conflict (409) renders the record_exists ErrorState', async () => {
    const user = userEvent.setup()
    renderRecords((path, init) => {
      if (init?.method === 'POST') {
        return { ok: false, reason: 'error', status: 409, body: { error: 'record_exists' } }
      }
      return standardHandler(path, init)
    })
    await screen.findByTestId('records-table')

    await user.click(screen.getByTestId('records-new'))
    await user.type(screen.getByTestId('create-input-email'), 'alice@example.com')
    await user.click(screen.getByTestId('create-submit'))

    expect(await screen.findByTestId('error-state')).toHaveAttribute(
      'data-error-code',
      'record_exists',
    )
  })

  it('destroy is two-step; read_only refusal renders inside the confirm pane', async () => {
    const user = userEvent.setup()
    renderRecords((path, init) => {
      if (init?.method === 'DELETE') {
        return { ok: false, reason: 'forbidden', message: 'read_only', body: { error: 'read_only' } }
      }
      return standardHandler(path, init)
    })
    await screen.findByTestId('records-table')
    await user.click(screen.getByTestId('records-open-cust_1'))
    await screen.findByTestId('records-detail-id')

    await user.click(screen.getByTestId('records-destroy'))
    const confirm = screen.getByTestId('records-destroy-confirm')
    expect(confirm).toHaveTextContent(/cannot be undone/)

    await user.click(screen.getByTestId('records-destroy-apply'))
    const pane = await within(confirm).findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-code', 'read_only')
    // Still on the detail — the record was NOT destroyed.
    expect(screen.getByTestId('records-detail-id')).toBeInTheDocument()
  })
})

describe('index queries (T5 contract: no force, scan gate is a refusal)', () => {
  it('runs a declared queryable index and renders matches; never sends force', async () => {
    const user = userEvent.setup()
    const fake = renderRecords((path, init) => {
      if (path.startsWith('/models/customer/index/email_lookup?')) {
        return { ok: true, data: { index: 'email_lookup', value: 'alice@example.com', records: [CUSTOMER_REC] } }
      }
      return standardHandler(path, init)
    })
    await screen.findByTestId('records-table')

    await user.type(screen.getByTestId('records-query-value'), 'alice@example.com')
    await user.click(screen.getByTestId('records-query-run'))

    await screen.findByTestId('records-query-meta')
    expect(screen.getByTestId('records-table')).toBeInTheDocument()
    const queryCall = fake.calls.find((c) => c.path.includes('/index/'))
    expect(queryCall?.path).toBe(
      '/models/customer/index/email_lookup?value=alice%40example.com',
    )
    expect(fake.calls.every((c) => !c.path.includes('force'))).toBe(true)
  })

  it('scan_required renders the refusal gate — not an empty result, no force button', async () => {
    const user = userEvent.setup()
    renderRecords((path, init) => {
      if (path.includes('/index/')) {
        return {
          ok: true,
          data: { error: 'scan_required', hint: 'add an index', estimated_rows: 1200 },
        }
      }
      return standardHandler(path, init)
    })
    await screen.findByTestId('records-table')

    await user.type(screen.getByTestId('records-query-value'), 'no-index-for-this')
    await user.click(screen.getByTestId('records-query-run'))

    const gate = await screen.findByTestId('records-scan-gate')
    expect(gate).toHaveTextContent(/refused/i)
    expect(gate).toHaveTextContent('1200')
    // No control offers to force/run the scan — the gate is terminal.
    expect(screen.queryByRole('button', { name: /force|scan/i })).not.toBeInTheDocument()
  })

  it('a model with no queryable indexes gets no query bar at all', async () => {
    const user = userEvent.setup()
    renderRecords()
    await screen.findByTestId('records-table')

    await user.selectOptions(screen.getByTestId('records-model-select'), 'session')
    await waitFor(() => expect(screen.getByTestId('records-table')).toBeInTheDocument())

    expect(screen.queryByTestId('records-querybar')).not.toBeInTheDocument()
  })
})
