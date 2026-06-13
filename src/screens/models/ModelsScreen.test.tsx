// src/screens/models/ModelsScreen.test.tsx
//
// Smoke coverage for the Models schema browser, driven through a fake AdminApi
// the way every screen test works (the AuthProvider + fake-request pattern from
// RecordsScreen.test.tsx). The contract under test: a ≥2-model descriptor
// renders as the list table with columns read off reflection; opening a row
// shows that model's detail tabs with ITS fields; an unreachable /_meta renders
// ErrorState and NEVER a table; an empty models list renders the explicit empty
// state; and a {} / unauthenticated response is tolerated without throwing.

import type React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminApi } from '../../api/client'
import { AuthProvider } from '../../auth/AuthProvider'
import type { AppDescriptor, FieldDescriptor } from '../../data/descriptor'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from '../../types'
import { ModelsScreen } from './ModelsScreen'

/** Attach a per-field json_schema (a key the FieldDescriptor type omits). */
function withSchema(field: FieldDescriptor, json_schema: unknown): FieldDescriptor {
  return { ...field, json_schema } as FieldDescriptor
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

const CLAIMS: Claims = {
  sub: 'admin',
  role: 'admin',
  permissions: ['reveal_secrets'],
  exp: Math.floor(Date.now() / 1000) + 3600,
}

/** A descriptor with three differently-shaped models (the fixture sample). */
const META: AppDescriptor = {
  generated_at: 1749200000,
  familia_version: '2.10.1',
  models: [
    {
      model: 'customer',
      class: 'Customer',
      key_pattern: 'customer:{custid}:object',
      identifier_field: 'custid',
      fields: [
        { name: 'custid', category: 'field', persisted: true, identifier: true },
        withSchema(
          { name: 'email', category: 'field', persisted: true },
          { type: 'string', format: 'email' },
        ),
        { name: 'api_secret', category: 'encrypted', persisted: true, display: '[CONCEALED]' },
        {
          name: 'password',
          category: 'transient',
          persisted: false,
          client_visible: false,
          display: '[REDACTED]',
        },
      ],
      datatypes: [
        { name: 'recent_logins', type: 'list', scope: 'instance' },
        { name: 'login_count', type: 'counter', scope: 'instance' },
      ],
      indexes: [
        {
          index_name: 'email_lookup',
          field: 'email',
          cardinality: 'unique',
          queryable: true,
          coordinate: 'Customer.email_lookup',
        },
      ],
      participations: [],
      safe_dump_fields: ['custid', 'email'],
      expiration: { policy: 'ttl', default_seconds: 7776000 },
      actions: ['list', 'read', 'create', 'update', 'destroy', 'reveal'],
    },
    {
      model: 'session',
      class: 'Session',
      key_pattern: 'session:{sessid}:object',
      identifier_field: 'sessid',
      logical_database: 1,
      fields: [
        { name: 'sessid', category: 'field', persisted: true, identifier: true },
        { name: 'ip_address', category: 'field', persisted: true },
      ],
      datatypes: [],
      indexes: [],
      participations: [],
      expiration: { policy: 'ttl', default_seconds: 86400 },
      actions: ['list', 'read', 'create', 'update', 'destroy'],
    },
    {
      model: 'api_key',
      class: 'ApiKey',
      key_pattern: 'api_key:{keyid}:object',
      identifier_field: 'keyid',
      fields: [{ name: 'keyid', category: 'field', persisted: true, identifier: true }],
      participations: [
        { collection: 'api_keys', type: 'sorted_set', target: 'Customer', scored: true },
      ],
      actions: ['list', 'read', 'create', 'update', 'destroy', 'reveal'],
    },
  ],
}

type Handler = (path: string) => ApiOutcome<unknown>

function fakeApi(handler: Handler): AdminApi {
  return {
    getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims: CLAIMS })),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: CLAIMS })),
    logout: vi.fn(async () => ({ ok: true })),
    request: vi.fn(async (path: string) => handler(path)),
  } as unknown as AdminApi
}

const metaHandler: Handler = (path) =>
  path === '/_meta'
    ? { ok: true, data: META }
    : { ok: false, reason: 'error', status: 404, body: { error: 'not_found' } }

function renderModels(handler: Handler = metaHandler): void {
  render(
    <AuthProvider api={fakeApi(handler)}>
      <ModelsScreen />
    </AuthProvider>,
  )
}

describe('list view (reflected from the descriptor)', () => {
  it('renders every model as a row with columns read off reflection', async () => {
    renderModels()

    const table = await screen.findByTestId('models-table')
    // Column headers come straight off the descriptor contract.
    for (const col of ['class', 'key_pattern', 'identifier', 'fields', 'datatypes', 'indexes', 'expiration']) {
      expect(within(table).getByRole('columnheader', { name: new RegExp(col) })).toBeInTheDocument()
    }
    expect(screen.getAllByTestId('models-row')).toHaveLength(3)
    expect(within(table).getByText('Customer')).toBeInTheDocument()
    expect(within(table).getByText('Session')).toBeInTheDocument()
    // session sits on logical_database 1 — the db chip reflects it.
    expect(within(table).getByText('db1')).toBeInTheDocument()
    // The read-straight-off-reflection copy line is present.
    expect(screen.getByTestId('models-context')).toHaveTextContent(/reflection contract/i)
  })

  it('opens a model detail with ITS fields and the right tabs', async () => {
    const user = userEvent.setup()
    renderModels()
    await screen.findByTestId('models-table')

    await user.click(screen.getByTestId('models-open-customer'))

    expect(await screen.findByTestId('models-detail-title')).toHaveTextContent('Customer')
    // Overview is the default tab; its facts reflect this model.
    expect(screen.getByTestId('models-overview-definition')).toHaveTextContent('custid')

    // Fields tab: this model's fields, with category chips and the schema summary.
    await user.click(screen.getByTestId('models-tab-fields'))
    const fieldsTable = await screen.findByTestId('models-fields-table')
    expect(within(fieldsTable).getByTestId('models-field-email')).toHaveTextContent('format: email')
    expect(within(fieldsTable).getByTestId('models-field-api_secret')).toHaveTextContent('[CONCEALED]')
    expect(within(fieldsTable).getByTestId('models-field-password')).toHaveTextContent('transient')

    // Datatypes tab: declared collections only.
    await user.click(screen.getByTestId('models-tab-datatypes'))
    expect(await screen.findByTestId('models-datatype-recent_logins')).toBeInTheDocument()

    // Indexes tab: the queryable unique index.
    await user.click(screen.getByTestId('models-tab-indexes'))
    expect(await screen.findByTestId('models-index-email_lookup')).toHaveTextContent('unique')

    // Descriptor tab: raw JSON of this model.
    await user.click(screen.getByTestId('models-tab-descriptor'))
    expect(await screen.findByTestId('models-descriptor-json')).toHaveTextContent('"model": "customer"')
  })

  it('a model with empty sections shows "none declared", not a fabricated table', async () => {
    const user = userEvent.setup()
    renderModels()
    await screen.findByTestId('models-table')

    await user.click(screen.getByTestId('models-open-session'))
    await screen.findByTestId('models-detail-title')

    await user.click(screen.getByTestId('models-tab-indexes'))
    expect(await screen.findByText(/No indexes declared/i)).toBeInTheDocument()

    await user.click(screen.getByTestId('models-tab-participations'))
    expect(await screen.findByText(/does not participate/i)).toBeInTheDocument()
  })

  it('cross-screen buttons navigate by plain hash, not postMessage', async () => {
    const user = userEvent.setup()
    renderModels()
    await screen.findByTestId('models-table')
    await user.click(screen.getByTestId('models-open-customer'))
    await screen.findByTestId('models-detail-title')

    await user.click(screen.getByTestId('models-browse-records'))
    expect(window.location.hash).toBe('#/records')
  })
})

describe('honest states', () => {
  it('an unreachable /_meta renders ErrorState, never a table', async () => {
    renderModels(() => ({ ok: false, reason: 'error' }))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')
    expect(screen.queryByTestId('models-table')).not.toBeInTheDocument()
    // The root testid still renders in the error state.
    expect(screen.getByTestId('screen-models')).toBeInTheDocument()
  })

  it('an empty models list renders the explicit empty state', async () => {
    renderModels((path) =>
      path === '/_meta'
        ? { ok: true, data: { models: [], familia_version: '2.10.1' } }
        : { ok: false, reason: 'error' },
    )

    expect(await screen.findByTestId('models-empty')).toHaveTextContent(/check server boot/i)
    expect(screen.queryByTestId('models-table')).not.toBeInTheDocument()
  })

  it('tolerates a {} descriptor (no models key) without throwing', async () => {
    renderModels(() => ({ ok: true, data: {} }))

    // The empty state, the root testid, and no crash.
    expect(await screen.findByTestId('models-empty')).toBeInTheDocument()
    expect(screen.getByTestId('screen-models')).toBeInTheDocument()
  })

  it('tolerates an unauthenticated response (renders ErrorState, root intact)', async () => {
    renderModels(() => ({ ok: false, reason: 'unauthenticated' }))

    expect(await screen.findByTestId('error-state')).toBeInTheDocument()
    expect(screen.getByTestId('screen-models')).toBeInTheDocument()
    expect(screen.queryByTestId('models-table')).not.toBeInTheDocument()
  })
})
