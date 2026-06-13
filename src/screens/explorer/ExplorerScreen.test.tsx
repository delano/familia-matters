// src/screens/explorer/ExplorerScreen.test.tsx
//
// Smoke coverage for the Explorer screen, driven through a fake AdminApi the way
// every screen test works. The corrections are the point: there is NO offline
// seed, NO force/escalation, and NO live feed. A scan pages with the SCAN cursor
// and shows "Load more" while it is non-"0"; the typed inspector narrows the
// /raw/key value per Redis type (a hash with a [CONCEALED] field, a zset member/
// score table); a blocked command surfaces the command_blocked refusal WITH its
// required_tier and never claims success; an unreachable backend renders the
// shared ErrorState, never fabricated data.

import type React from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminApi } from '../../api/client'
import { AuthProvider } from '../../auth/AuthProvider'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from '../../types'
import { ExplorerScreen } from './ExplorerScreen'

afterEach(cleanup)

const CLAIMS: Claims = {
  sub: 'admin',
  role: 'admin',
  permissions: ['raw_command'],
  exp: Math.floor(Date.now() / 1000) + 3600,
}

type Handler = (path: string, init?: RequestInit) => ApiOutcome<unknown> | undefined

interface FakeApi {
  api: AdminApi
  calls: { path: string; method: string; body?: string }[]
}

function fakeApi(handler: Handler): FakeApi {
  const calls: { path: string; method: string; body?: string }[] = []
  const api = {
    getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims: CLAIMS })),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: CLAIMS })),
    logout: vi.fn(async () => ({ ok: true })),
    request: vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({
        path,
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : undefined,
      })
      return (
        handler(path, init) ??
        ({ ok: false, reason: 'error', status: 404, body: { error: 'not_found' } } as ApiOutcome<unknown>)
      )
    }),
  } as unknown as AdminApi
  return { api, calls }
}

function renderExplorer(handler: Handler): FakeApi {
  const fake = fakeApi(handler)
  render(
    <AuthProvider api={fake.api}>
      <ExplorerScreen />
    </AuthProvider>,
  )
  return fake
}

/** A two-page SCAN: the first page returns one key and a non-"0" cursor; the
 * second page returns the rest and cursor "0" (scan complete). */
function scanHandler(path: string): ApiOutcome<unknown> | undefined {
  if (path.startsWith('/raw/keys?')) {
    const cursor = new URLSearchParams(path.split('?')[1]).get('cursor')
    if (cursor === '0') {
      return {
        ok: true,
        data: {
          keys: [
            { key: 'customer:cust_1:object', type: 'hash', ttl: 6_912_000, model: 'customer', id: 'cust_1' },
          ],
          cursor: '128',
          scanned: 100,
          matched: 1,
        },
      }
    }
    // Second page (cursor 128): finish the scan.
    return {
      ok: true,
      data: {
        keys: [{ key: 'customer:cust_1:domains', type: 'zset', ttl: -1 }],
        cursor: '0',
        scanned: 80,
        matched: 1,
      },
    }
  }
  return undefined
}

describe('key scan (SCAN paging, no seed)', () => {
  it('is idle until a scan runs, then renders matched keys', async () => {
    const user = userEvent.setup()
    renderExplorer(scanHandler)

    // Idle: no scan has run yet.
    expect(screen.getByTestId('explorer-scan-idle')).toBeInTheDocument()
    expect(screen.queryByTestId('explorer-key-list')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('explorer-scan'))

    const list = await screen.findByTestId('explorer-key-list')
    expect(within(list).getByTestId('explorer-key-customer:cust_1:object')).toBeInTheDocument()
    expect(screen.getByTestId('explorer-scan-count')).toHaveTextContent('matched')
    // The model badge shows on a model-backed key.
    expect(screen.getByTestId('explorer-key-badge-customer:cust_1:object')).toHaveTextContent('customer')
  })

  it('shows "Load more" while the cursor != "0" and appends the next page', async () => {
    const user = userEvent.setup()
    renderExplorer(scanHandler)
    await user.click(screen.getByTestId('explorer-scan'))

    // First page returned cursor 128 → Load more is offered.
    const more = await screen.findByTestId('explorer-load-more')
    expect(more).toHaveTextContent('cursor 128')

    await user.click(more)

    // Second page appends the zset key and returns cursor 0 → Load more is gone.
    await waitFor(() =>
      expect(screen.getByTestId('explorer-key-customer:cust_1:domains')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('explorer-key-customer:cust_1:object')).toBeInTheDocument()
    expect(screen.queryByTestId('explorer-load-more')).not.toBeInTheDocument()
  })

  it('a second scan REPLACES the first — no cross-scan key contamination', async () => {
    const user = userEvent.setup()
    // Single-page scans keyed by the MATCH pattern: each returns its own key and
    // cursor "0" (complete). Re-scanning must clear the prior list, not append.
    const byPattern: Handler = (path) => {
      if (!path.startsWith('/raw/keys?')) return undefined
      const pattern = new URLSearchParams(path.split('?')[1]).get('pattern')
      const key =
        pattern === 'session:*' ? 'session:sess_9:object' : 'customer:cust_1:object'
      return {
        ok: true,
        data: { keys: [{ key, type: 'hash', ttl: -1 }], cursor: '0', scanned: 10, matched: 1 },
      }
    }
    renderExplorer(byPattern)
    const input = screen.getByTestId('explorer-pattern')

    // First scan: customer:*
    await user.clear(input)
    await user.type(input, 'customer:*')
    await user.click(screen.getByTestId('explorer-scan'))
    expect(await screen.findByTestId('explorer-key-customer:cust_1:object')).toBeInTheDocument()

    // Second scan: session:* — the customer key must be GONE, not appended, and
    // the matched count reflects the second scan alone (1), never 1+1.
    await user.clear(input)
    await user.type(input, 'session:*')
    await user.click(screen.getByTestId('explorer-scan'))
    expect(await screen.findByTestId('explorer-key-session:sess_9:object')).toBeInTheDocument()
    expect(screen.queryByTestId('explorer-key-customer:cust_1:object')).not.toBeInTheDocument()
    expect(screen.getByTestId('explorer-scan-count')).toHaveTextContent('matched 1')
  })

  it('renders an explicit "0 keys matched" on an empty completed scan', async () => {
    const user = userEvent.setup()
    renderExplorer((path) => {
      if (path.startsWith('/raw/keys?')) {
        return { ok: true, data: { keys: [], cursor: '0', scanned: 50, matched: 0 } }
      }
      return undefined
    })
    await user.click(screen.getByTestId('explorer-scan'))

    expect(await screen.findByTestId('explorer-scan-empty')).toHaveTextContent('0 keys matched')
    expect(screen.queryByTestId('explorer-load-more')).not.toBeInTheDocument()
  })

  it('an unreachable backend on the scan renders ErrorState, never fake rows', async () => {
    const user = userEvent.setup()
    renderExplorer((path) =>
      path.startsWith('/raw/keys?') ? { ok: false, reason: 'error' } : undefined,
    )
    await user.click(screen.getByTestId('explorer-scan'))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')
    expect(screen.queryByTestId('explorer-key-list')?.childElementCount ?? 0).toBe(0)
  })
})

describe('typed inspector (value narrowed per Redis type)', () => {
  function inspectHandler(path: string): ApiOutcome<unknown> | undefined {
    const scanned = scanHandler(path)
    if (scanned) return scanned
    if (path.startsWith('/raw/key?')) {
      const key = decodeURIComponent(new URLSearchParams(path.split('?')[1]).get('key') ?? '')
      if (key === 'customer:cust_1:object') {
        return {
          ok: true,
          data: {
            key,
            type: 'hash',
            ttl: 6_912_000,
            db: 0,
            memory: 312,
            model: 'customer',
            id: 'cust_1',
            value: {
              custid: 'cust_1',
              email: 'alice@example.com',
              api_secret: '[CONCEALED]',
            },
          },
        }
      }
      if (key === 'customer:cust_1:domains') {
        return {
          ok: true,
          data: {
            key,
            type: 'zset',
            ttl: -1,
            db: 0,
            memory: 264,
            value: [
              ['example.com', 1_700_000_000],
              ['otto.example', 1_700_000_500],
            ],
          },
        }
      }
    }
    return undefined
  }

  it('renders a hash with a [CONCEALED] field flagged, plus the model banner', async () => {
    const user = userEvent.setup()
    renderExplorer(inspectHandler)
    await user.click(screen.getByTestId('explorer-scan'))
    await user.click(await screen.findByTestId('explorer-key-customer:cust_1:object'))

    const inspector = await screen.findByTestId('explorer-inspector')
    expect(within(inspector).getByTestId('explorer-inspect-key')).toHaveTextContent(
      'customer:cust_1:object',
    )
    // The concealed field shows the server's mask, flagged as concealed.
    const concealed = within(inspector).getByTestId('explorer-hash-api_secret')
    expect(concealed).toHaveTextContent('[CONCEALED]')
    expect(within(concealed).getByText('[CONCEALED]')).toHaveClass('explorer-hash-value--concealed')
    // The model banner offers a hash-nav to Records.
    expect(within(inspector).getByTestId('explorer-model-banner')).toHaveTextContent(
      /This key is a .*customer.* record .*cust_1/,
    )
    expect(within(inspector).getByTestId('explorer-open-records')).toBeInTheDocument()
  })

  it('renders a zset as a member + score table', async () => {
    const user = userEvent.setup()
    renderExplorer(inspectHandler)
    await user.click(screen.getByTestId('explorer-scan'))
    await user.click(await screen.findByTestId('explorer-load-more'))
    await user.click(await screen.findByTestId('explorer-key-customer:cust_1:domains'))

    const table = await screen.findByTestId('explorer-zset')
    const rows = within(table).getAllByTestId('explorer-zset-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('example.com')
    expect(rows[0]).toHaveTextContent('1700000000')
  })

  it('a missing key (404) renders the not-found ErrorState', async () => {
    const user = userEvent.setup()
    renderExplorer((path) => {
      const scanned = scanHandler(path)
      if (scanned) return scanned
      if (path.startsWith('/raw/key?')) {
        return { ok: false, reason: 'error', status: 404, body: { error: 'not_found', resource: 'key' } }
      }
      return undefined
    })
    await user.click(screen.getByTestId('explorer-scan'))
    await user.click(await screen.findByTestId('explorer-key-customer:cust_1:object'))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveTextContent('Not found')
  })
})

describe('command console (no force, no escalation, no live feed)', () => {
  it('runs an allowlisted command and renders its result honestly', async () => {
    const user = userEvent.setup()
    const fake = renderExplorer((path, init) => {
      if (path === '/raw/command' && init?.method === 'POST') {
        return {
          ok: true,
          data: { cmd: 'PING', args: [], result: 'PONG', simulated: false, truncated: false },
        }
      }
      return undefined
    })

    await user.type(screen.getByTestId('explorer-command-input'), 'PING')
    await user.click(screen.getByTestId('explorer-command-run'))

    const result = await screen.findByTestId('explorer-console-result')
    expect(result).toHaveTextContent('PONG')
    // The POST carried { cmd, args } and never a force flag.
    const cmdCall = fake.calls.find((c) => c.path === '/raw/command')
    expect(cmdCall?.body).toBe(JSON.stringify({ cmd: 'PING', args: [] }))
    expect(fake.calls.every((c) => !(c.body ?? '').includes('force'))).toBe(true)
  })

  it('recalls submitted commands with ArrowUp / ArrowDown and preserves the draft', async () => {
    const user = userEvent.setup()
    renderExplorer((path, init) => {
      if (path === '/raw/command' && init?.method === 'POST') {
        return { ok: true, data: { cmd: 'X', args: [], result: 'PONG', simulated: false, truncated: false } }
      }
      return undefined
    })

    const input = screen.getByTestId('explorer-command-input') as HTMLInputElement

    // Run two commands so both enter the recall history (oldest -> newest).
    await user.type(input, 'PING')
    await user.click(screen.getByTestId('explorer-command-run'))
    await waitFor(() => expect(input).toHaveValue(''))
    await user.type(input, 'DBSIZE')
    await user.click(screen.getByTestId('explorer-command-run'))
    await waitFor(() => expect(input).toHaveValue(''))

    // Start a fresh draft, then navigate: it must survive the round trip.
    await user.type(input, 'INF')
    input.focus()

    await user.keyboard('{ArrowUp}') // newest
    expect(input).toHaveValue('DBSIZE')
    await user.keyboard('{ArrowUp}') // older
    expect(input).toHaveValue('PING')
    await user.keyboard('{ArrowUp}') // clamped at the oldest
    expect(input).toHaveValue('PING')
    await user.keyboard('{ArrowDown}') // newer again
    expect(input).toHaveValue('DBSIZE')
    await user.keyboard('{ArrowDown}') // past the newest -> the preserved draft
    expect(input).toHaveValue('INF')
  })

  it('flags a truncated result without claiming the whole value', async () => {
    const user = userEvent.setup()
    renderExplorer((path, init) => {
      if (path === '/raw/command' && init?.method === 'POST') {
        return {
          ok: true,
          data: { cmd: 'LRANGE', args: ['k', '0', '-1'], result: ['a', 'b'], simulated: false, truncated: true },
        }
      }
      return undefined
    })

    await user.type(screen.getByTestId('explorer-command-input'), 'LRANGE k 0 -1')
    await user.click(screen.getByTestId('explorer-command-run'))

    expect(await screen.findByTestId('explorer-console-truncated')).toHaveTextContent('truncated')
  })

  it('a blocked command surfaces command_blocked WITH required_tier and never claims success', async () => {
    const user = userEvent.setup()
    renderExplorer((path, init) => {
      if (path === '/raw/command' && init?.method === 'POST') {
        return {
          ok: false,
          reason: 'forbidden',
          message: 'command_blocked',
          body: { error: 'command_blocked', required_tier: 'permission:raw_command' },
        }
      }
      return undefined
    })

    await user.type(screen.getByTestId('explorer-command-input'), 'FLUSHDB')
    await user.click(screen.getByTestId('explorer-command-run'))

    const entry = await screen.findByTestId('explorer-console-entry-error')
    const pane = within(entry).getByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-code', 'command_blocked')
    expect(pane).toHaveTextContent('permission:raw_command')
    // No success result was rendered, and there is NO force/escalation control.
    expect(screen.queryByTestId('explorer-console-result')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /force|escalat|raw_command/i })).not.toBeInTheDocument()
  })

  it('a command runtime error (400) renders honestly as a failure', async () => {
    const user = userEvent.setup()
    renderExplorer((path, init) => {
      if (path === '/raw/command' && init?.method === 'POST') {
        return { ok: false, reason: 'error', status: 400, body: { error: 'bad_request', message: 'command failed: …' } }
      }
      return undefined
    })

    await user.type(screen.getByTestId('explorer-command-input'), 'GET missing')
    await user.click(screen.getByTestId('explorer-command-run'))

    const entry = await screen.findByTestId('explorer-console-entry-error')
    expect(within(entry).getByTestId('error-state')).toBeInTheDocument()
    expect(screen.queryByTestId('explorer-console-result')).not.toBeInTheDocument()
  })
})

describe('server info tab', () => {
  it('renders the parsed INFO sections', async () => {
    const user = userEvent.setup()
    renderExplorer((path) => {
      if (path === '/raw/info') {
        return {
          ok: true,
          data: {
            server: { server_version: '8.0.1', mode: 'standalone' },
            memory: { used_memory_human: '39.6M' },
            clients: { connected_clients: '18' },
            stats: { keyspace_hits: '8120443' },
            keyspace: { db0: 'keys=1330,expires=1284' },
          },
        }
      }
      return undefined
    })

    await user.click(screen.getByTestId('explorer-tab-info'))

    const info = await screen.findByTestId('explorer-info')
    expect(within(info).getByTestId('explorer-info-server')).toHaveTextContent('8.0.1')
    expect(within(info).getByTestId('explorer-info-memory')).toHaveTextContent('39.6M')
    expect(within(info).getByTestId('explorer-info-keyspace')).toHaveTextContent('db0')
  })
})

describe('routing tolerance (root testid in every state)', () => {
  it('renders screen-explorer even when request returns an empty body', async () => {
    renderExplorer(() => ({ ok: true, data: {} }))
    expect(screen.getByTestId('screen-explorer')).toBeInTheDocument()
  })

  it('renders screen-explorer when request is unauthenticated, without throwing', async () => {
    renderExplorer(() => ({ ok: false, reason: 'unauthenticated' }))
    expect(screen.getByTestId('screen-explorer')).toBeInTheDocument()
  })
})
