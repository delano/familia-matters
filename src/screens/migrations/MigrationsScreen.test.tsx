// src/screens/migrations/MigrationsScreen.test.tsx
//
// Smoke coverage for the migrations screen, driven through a fake AdminApi the
// way every screen test works. The contract points that matter: applied /
// pending / drift render from real responses (never a seed), the
// runner-unavailable state appears when {status:null} (the prototype lacked it),
// an unreachable backend renders the shared ErrorState (never fabricated
// progress), a dry-run preview renders the plan from POST run?dry_run=true, and
// run/rollback are gated on permission:run_migrations. There is no stream and no
// fake animation — run/rollback are synchronous POSTs returning {result}.

import type React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminApi } from '../../api/client'
import { AuthProvider } from '../../auth/AuthProvider'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from '../../types'
import { MigrationsScreen } from './MigrationsScreen'

afterEach(cleanup)

function claims(permissions: string[]): Claims {
  return {
    sub: 'admin',
    role: 'admin',
    permissions,
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
}

/** The migration status from the fixture (resources/.../migrations.sample.json). */
const STATUS = {
  applied: [
    { id: '20260101_add_status_field', applied_at: 1735689600, description: 'Add status to Customer', reversible: true },
    { id: '20260318_backfill_login_count', applied_at: 1742256000, description: 'Backfill', reversible: false },
  ],
  pending: [
    { id: '20260520_rename_fullname_to_name', description: 'Rename Customer#fullname to #name', reversible: true, dependencies: ['20260101_add_status_field'] },
    { id: '20260603_reencrypt_api_secret_v2', description: 'Re-encrypt Customer#api_secret', reversible: false, dependencies: [] },
  ],
}

const DRIFT = {
  models: [
    {
      model: 'Customer',
      changed: true,
      stored_digest: 'sha256:8a1c4e2f9b07d3a6',
      current_digest: 'sha256:91f4cc70ab12de58',
      differences: [
        { field: 'fullname', change: 'removed' },
        { field: 'name', change: 'added' },
        { field: 'updated_at', change: 'added' },
      ],
      suggested_migration: '20260520_rename_fullname_to_name',
    },
    { model: 'Session', changed: false, stored_digest: 'sha256:55de1188aa0c2f31', current_digest: 'sha256:55de1188aa0c2f31', differences: [] },
  ],
}

const DRY_RUN = {
  dry_run: true,
  would_run: ['20260520_rename_fullname_to_name'],
  plan: [
    { id: '20260520_rename_fullname_to_name', operation: 'rename_field', from: 'fullname', to: 'name', estimated_records: 1282, reversible: true, backup: 'enabled' },
  ],
}

type Handler = (path: string, init?: RequestInit) => ApiOutcome<unknown> | undefined

interface FakeApi {
  api: AdminApi
  calls: { path: string; method: string }[]
}

function fakeApi(handler: Handler, sessionClaims: Claims): FakeApi {
  const calls: { path: string; method: string }[] = []
  const api = {
    getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims: sessionClaims })),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: sessionClaims })),
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

/** Happy-path handler: status + drift present, dry-run on POST run?dry_run=true. */
function standardHandler(path: string, init?: RequestInit): ApiOutcome<unknown> | undefined {
  const method = init?.method ?? 'GET'
  if (path === '/migrations' && method === 'GET') return { ok: true, data: { status: STATUS } }
  if (path === '/migrations/drift' && method === 'GET') return { ok: true, data: { drift: DRIFT } }
  if (path === '/migrations/run?dry_run=true' && method === 'POST') {
    return { ok: true, data: { result: DRY_RUN } }
  }
  if (path === '/migrations/run' && method === 'POST') {
    return { ok: true, data: { result: { applied: ['20260520_rename_fullname_to_name'], records_processed: 1282 } } }
  }
  if (path.startsWith('/migrations/rollback?') && method === 'POST') {
    return { ok: true, data: { result: { rolled_back: ['20260101_add_status_field'] } } }
  }
  return undefined
}

function renderMigrations(
  handler: Handler = standardHandler,
  permissions: string[] = ['run_migrations'],
): FakeApi {
  const fake = fakeApi(handler, claims(permissions))
  render(
    <AuthProvider api={fake.api}>
      <MigrationsScreen />
    </AuthProvider>,
  )
  return fake
}

describe('the root testid renders in every state', () => {
  it('renders screen-migrations even when the status payload is empty ({})', async () => {
    // The routing test mounts the screen with request -> { ok:true, data:{} }.
    renderMigrations(() => ({ ok: true, data: {} }))
    expect(await screen.findByTestId('screen-migrations')).toBeInTheDocument()
    // {} means status is absent -> the runner-unavailable panel, not an error.
    expect(await screen.findByTestId('migrations-no-runner')).toBeInTheDocument()
  })
})

describe('status: applied / pending / drift render from real responses', () => {
  it('renders the applied table, pending cards, and drift cards', async () => {
    renderMigrations()

    const appliedTable = await screen.findByTestId('migrations-applied-table')
    expect(within(appliedTable).getByText('20260101_add_status_field')).toBeInTheDocument()
    // The reversible applied migration gets a rollback action; the irreversible one does not.
    expect(screen.getByTestId('migrations-rollback-20260101_add_status_field')).toBeInTheDocument()
    expect(screen.queryByTestId('migrations-rollback-20260318_backfill_login_count')).not.toBeInTheDocument()

    // Pending cards: id, reversible badge, dependencies.
    const pendingCard = screen.getByTestId('migrations-pending-20260520_rename_fullname_to_name')
    expect(pendingCard).toHaveTextContent('reversible')
    expect(pendingCard).toHaveTextContent('20260101_add_status_field')

    // Drift cards: stored vs current digest, field diff, suggested link into pending.
    const driftCard = await screen.findByTestId('migrations-drift-Customer')
    expect(within(driftCard).getByTestId('migrations-drift-Customer-stored')).toHaveTextContent('sha256:8a1c4e2f9b07d3a6')
    expect(within(driftCard).getByTestId('migrations-drift-Customer-current')).toHaveTextContent('sha256:91f4cc70ab12de58')
    expect(driftCard).toHaveTextContent('fullname')
    const link = screen.getByTestId('migrations-suggested-link-Customer')
    expect(link).toHaveAttribute('href', '#migration-20260520_rename_fullname_to_name')
    // The in-sync model renders without a drift badge.
    expect(screen.getByTestId('migrations-drift-Session')).toHaveTextContent('in sync')
  })
})

describe('runner-unavailable is the honest state (the prototype lacked it)', () => {
  it('renders the no-runner panel when status is null', async () => {
    renderMigrations((path) =>
      path === '/migrations' ? { ok: true, data: { status: null } } : standardHandler(path),
    )

    const panel = await screen.findByTestId('migrations-no-runner')
    expect(panel).toHaveTextContent(/no migration runner/i)
    expect(panel).toHaveTextContent(/honest state/i)
    // No applied/pending tables are fabricated in this state.
    expect(screen.queryByTestId('migrations-applied-table')).not.toBeInTheDocument()
  })

  it('renders drift-unavailable when drift is null', async () => {
    renderMigrations((path) =>
      path === '/migrations/drift' ? { ok: true, data: { drift: null } } : standardHandler(path),
    )

    expect(await screen.findByTestId('migrations-drift-unavailable')).toHaveTextContent(/unavailable/i)
  })
})

describe('failure is an explicit error state (no seed, no fabricated progress)', () => {
  it('an unreachable backend on /migrations renders ErrorState', async () => {
    renderMigrations(() => ({ ok: false, reason: 'error' }))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')
    expect(screen.queryByTestId('migrations-applied-table')).not.toBeInTheDocument()
  })
})

describe('dry-run preview renders the plan', () => {
  it('Preview run -> POST run?dry_run=true -> renders would_run and the plan', async () => {
    const user = userEvent.setup()
    const fake = renderMigrations()
    await screen.findByTestId('migrations-applied-table')

    await user.click(screen.getByTestId('migrations-preview-run'))

    const preview = await screen.findByTestId('migrations-dryrun')
    expect(within(preview).getByTestId('migrations-wouldrun')).toHaveTextContent('20260520_rename_fullname_to_name')
    const planCard = screen.getByTestId('migrations-plan-20260520_rename_fullname_to_name')
    expect(planCard).toHaveTextContent('rename_field')
    expect(planCard).toHaveTextContent('fullname → name')
    expect(planCard).toHaveTextContent('1,282')

    // The dry-run POST carried the dry_run flag, not a live run.
    expect(fake.calls.some((c) => c.path === '/migrations/run?dry_run=true' && c.method === 'POST')).toBe(true)
    expect(fake.calls.some((c) => c.path === '/migrations/run' && c.method === 'POST')).toBe(false)
  })

  it('applying a reversible dry-run runs the live POST and renders the done summary', async () => {
    const user = userEvent.setup()
    const fake = renderMigrations()
    await screen.findByTestId('migrations-applied-table')

    await user.click(screen.getByTestId('migrations-preview-run'))
    await screen.findByTestId('migrations-dryrun')
    // Reversible plan: no ack needed, Apply is enabled immediately.
    await user.click(screen.getByTestId('migrations-apply'))

    const done = await screen.findByTestId('migrations-done')
    expect(done).toHaveTextContent(/applied migration/i)
    expect(within(done).getByTestId('migrations-result-ids')).toHaveTextContent('20260520_rename_fullname_to_name')
    expect(fake.calls.some((c) => c.path === '/migrations/run' && c.method === 'POST')).toBe(true)
  })
})

describe('irreversible runs require an explicit acknowledgement', () => {
  it('an irreversible plan gates Apply behind the ack checkbox', async () => {
    const user = userEvent.setup()
    renderMigrations((path, init) => {
      if (path === '/migrations/run?dry_run=true') {
        return {
          ok: true,
          data: {
            result: {
              dry_run: true,
              would_run: ['20260603_reencrypt_api_secret_v2'],
              plan: [{ id: '20260603_reencrypt_api_secret_v2', operation: 'reencrypt', estimated_records: 50, reversible: false, backup: 'enabled' }],
            },
          },
        }
      }
      return standardHandler(path, init)
    })
    await screen.findByTestId('migrations-applied-table')

    await user.click(screen.getByTestId('migrations-preview-run'))
    await screen.findByTestId('migrations-dryrun')

    const apply = screen.getByTestId('migrations-apply')
    expect(apply).toBeDisabled()
    await user.click(screen.getByTestId('migrations-ack-checkbox'))
    expect(apply).toBeEnabled()
  })
})

describe('permission:run_migrations gating', () => {
  it('without the permission, run is disabled and the note renders', async () => {
    renderMigrations(standardHandler, [])
    await screen.findByTestId('migrations-applied-table')

    expect(screen.getByTestId('migrations-noperm')).toHaveTextContent('run_migrations')
    expect(screen.getByTestId('migrations-preview-run')).toBeDisabled()
    // No rollback affordance is offered either.
    expect(screen.queryByTestId('migrations-rollback-20260101_add_status_field')).not.toBeInTheDocument()
  })
})

describe('rollback is a two-step confirm over a synchronous POST', () => {
  it('confirms, posts rollback?id=, and renders the result', async () => {
    const user = userEvent.setup()
    const fake = renderMigrations()
    await screen.findByTestId('migrations-applied-table')

    await user.click(screen.getByTestId('migrations-rollback-20260101_add_status_field'))
    const confirm = await screen.findByTestId('migrations-rollback-confirm')
    const apply = within(confirm).getByTestId('migrations-rollback-apply')
    expect(apply).toBeDisabled()
    await user.click(within(confirm).getByTestId('migrations-rollback-ack-checkbox'))
    await user.click(apply)

    await screen.findByTestId('migrations-done')
    expect(
      fake.calls.some(
        (c) => c.path === '/migrations/rollback?id=20260101_add_status_field' && c.method === 'POST',
      ),
    ).toBe(true)
  })

  it('a 400 runner-unavailable on rollback renders ErrorState inside the confirm', async () => {
    const user = userEvent.setup()
    renderMigrations((path, init) => {
      if (path.startsWith('/migrations/rollback?')) {
        return { ok: false, reason: 'error', status: 400, body: { error: 'bad_request', message: 'migration runner unavailable' } }
      }
      return standardHandler(path, init)
    })
    await screen.findByTestId('migrations-applied-table')

    await user.click(screen.getByTestId('migrations-rollback-20260101_add_status_field'))
    const confirm = await screen.findByTestId('migrations-rollback-confirm')
    await user.click(within(confirm).getByTestId('migrations-rollback-ack-checkbox'))
    await user.click(within(confirm).getByTestId('migrations-rollback-apply'))

    expect(await within(confirm).findByTestId('error-state')).toBeInTheDocument()
  })
})

describe('a stopped run renders honestly, not as a clean done', () => {
  it('an incomplete result renders the partial panel with the failed phase', async () => {
    const user = userEvent.setup()
    renderMigrations((path, init) => {
      if (path === '/migrations/run' && (init?.method ?? 'GET') === 'POST') {
        return { ok: true, data: { result: { incomplete: true, failed_phase: 'reencrypt', error_code: 'KEY_UNAVAILABLE', records_processed: 12 } } }
      }
      return standardHandler(path, init)
    })
    await screen.findByTestId('migrations-applied-table')

    await user.click(screen.getByTestId('migrations-preview-run'))
    await screen.findByTestId('migrations-dryrun')
    await user.click(screen.getByTestId('migrations-apply'))

    const partial = await screen.findByTestId('migrations-partial')
    expect(partial).toHaveTextContent(/incomplete/i)
    expect(partial).toHaveTextContent('reencrypt')
  })
})
