// src/components/ErrorState.test.tsx
//
// The shared unmissable error pane: every API refusal renders as the SPECIFIC
// state it is (alert role, named title, no data implied), and retry is wired
// to the parent. These variants are the contract the screen ports rely on.

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorState } from './ErrorState'

afterEach(cleanup)

describe('ErrorState variants', () => {
  it('backend-unreachable: alert naming the outage, explicitly no fallback data', () => {
    render(<ErrorState error={{ kind: 'unreachable' }} />)

    const pane = screen.getByTestId('error-state')
    expect(pane).toHaveAttribute('role', 'alert')
    expect(pane).toHaveAttribute('data-error-kind', 'unreachable')
    expect(pane).toHaveTextContent('Backend unreachable')
    expect(pane).toHaveTextContent(/no cached or fallback data/i)
  })

  it('read_only: names the env var so the operator knows what refused them', () => {
    render(
      <ErrorState
        error={{ kind: 'forbidden', status: 403, code: 'read_only', body: { error: 'read_only' } }}
      />,
    )

    const pane = screen.getByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-code', 'read_only')
    expect(pane).toHaveTextContent('Read-only mode is on')
    expect(pane).toHaveTextContent('FAMILIA_ADMIN_READ_ONLY')
    expect(pane).toHaveTextContent(/nothing was modified/i)
  })

  it('scan_unavailable: a refusal, never an empty result', () => {
    render(
      <ErrorState
        error={{ kind: 'http', status: 400, code: 'scan_unavailable', body: { error: 'scan_unavailable' } }}
      />,
    )

    const pane = screen.getByTestId('error-state')
    expect(pane).toHaveTextContent(/no index/i)
    expect(pane).toHaveTextContent(/not an empty result/i)
  })

  it('command_blocked: surfaces the required tier from the body', () => {
    render(
      <ErrorState
        error={{
          kind: 'forbidden',
          status: 403,
          code: 'command_blocked',
          body: { error: 'command_blocked', required_tier: 'danger' },
        }}
      />,
    )

    const pane = screen.getByTestId('error-state')
    expect(pane).toHaveTextContent('Command blocked')
    expect(pane).toHaveTextContent('danger')
    expect(pane).toHaveTextContent(/nothing was executed/i)
  })

  it('record_exists: conflict, nothing written', () => {
    render(
      <ErrorState
        error={{ kind: 'http', status: 409, code: 'record_exists', body: { error: 'record_exists' } }}
      />,
    )
    expect(screen.getByTestId('error-state')).toHaveTextContent(/already exists/i)
  })

  it('plain forbidden (no code): permission denied, still signed in', () => {
    render(<ErrorState error={{ kind: 'forbidden', status: 403 }} />)
    const pane = screen.getByTestId('error-state')
    expect(pane).toHaveTextContent('Permission denied')
    expect(pane).toHaveTextContent(/still signed in/i)
  })

  it('404: not found', () => {
    render(<ErrorState error={{ kind: 'http', status: 404 }} />)
    expect(screen.getByTestId('error-state')).toHaveTextContent('Not found')
  })

  it('other HTTP failures show the status', () => {
    render(<ErrorState error={{ kind: 'http', status: 502 }} />)
    expect(screen.getByTestId('error-state')).toHaveTextContent('HTTP 502')
  })

  it('unauthenticated: session expired, place preserved (overlay opens on top)', () => {
    render(<ErrorState error={{ kind: 'unauthenticated', status: 401 }} />)
    expect(screen.getByTestId('error-state')).toHaveTextContent('Session expired')
  })
})

describe('retry wiring', () => {
  it('renders a Retry button only when onRetry is provided, and calls it', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<ErrorState error={{ kind: 'unreachable' }} onRetry={onRetry} />)

    await user.click(screen.getByTestId('error-state-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)

    rerender(<ErrorState error={{ kind: 'unreachable' }} />)
    expect(screen.queryByTestId('error-state-retry')).not.toBeInTheDocument()
  })
})
