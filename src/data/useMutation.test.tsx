// src/data/useMutation.test.tsx
//
// The write-side pattern: a successful run resolves with data, a refused run
// resolves null with an explicit ResourceError (rendered via ErrorState by the
// probe, exactly as the screens do), and reset() clears the error for the next
// attempt. The 401 side effect itself is callOutcome's and is covered in
// AuthProvider.test.tsx / useResource.test.tsx.

import type React from 'react'
import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminApi } from '../api/client'
import { AuthProvider } from '../auth/AuthProvider'
import { ErrorState } from '../components/ErrorState'
import type { ApiOutcome, Claims, LoginResult, SessionResult } from '../types'
import { useMutation } from './useMutation'

afterEach(cleanup)

const CLAIMS: Claims = {
  sub: 'admin',
  role: 'admin',
  permissions: [],
  exp: Math.floor(Date.now() / 1000) + 3600,
}

function mockApi(outcome: ApiOutcome<unknown>): AdminApi {
  return {
    getSession: vi.fn(async (): Promise<SessionResult> => ({ ok: true, claims: CLAIMS })),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: true, claims: CLAIMS })),
    logout: vi.fn(async () => ({ ok: true })),
    request: vi.fn(async () => outcome),
  } as unknown as AdminApi
}

function Probe(): React.JSX.Element {
  const { state, run, reset } = useMutation()
  const [result, setResult] = useState<string | null>(null)

  return (
    <div>
      <button
        type="button"
        data-testid="mutate"
        onClick={async () => {
          const data = await run<{ value: string }>((api) =>
            api.request('/write', { method: 'POST' }),
          )
          setResult(data ? data.value : null)
        }}
      >
        mutate
      </button>
      <button type="button" data-testid="reset" onClick={reset}>
        reset
      </button>
      {state.phase === 'pending' && <p data-testid="pending">pending</p>}
      {state.phase === 'error' && <ErrorState error={state.error} />}
      {result && <p data-testid="result">{result}</p>}
    </div>
  )
}

function renderProbe(api: AdminApi) {
  return render(
    <AuthProvider api={api}>
      <Probe />
    </AuthProvider>,
  )
}

describe('useMutation', () => {
  it('resolves with the response data on success and stays idle', async () => {
    const user = userEvent.setup()
    renderProbe(mockApi({ ok: true, data: { value: 'written' } }))

    await user.click(screen.getByTestId('mutate'))

    expect(await screen.findByTestId('result')).toHaveTextContent('written')
    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument()
  })

  it('a 403 read_only resolves null and surfaces the specific refusal', async () => {
    const user = userEvent.setup()
    renderProbe(
      mockApi({
        ok: false,
        reason: 'forbidden',
        message: 'read_only',
        body: { error: 'read_only' },
      }),
    )

    await user.click(screen.getByTestId('mutate'))

    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-code', 'read_only')
    expect(screen.queryByTestId('result')).not.toBeInTheDocument()
  })

  it('a 409 record_exists surfaces the conflict; reset clears it', async () => {
    const user = userEvent.setup()
    renderProbe(
      mockApi({ ok: false, reason: 'error', status: 409, body: { error: 'record_exists' } }),
    )

    await user.click(screen.getByTestId('mutate'))
    const pane = await screen.findByTestId('error-state')
    expect(pane).toHaveAttribute('data-error-code', 'record_exists')

    await user.click(screen.getByTestId('reset'))
    expect(screen.queryByTestId('error-state')).not.toBeInTheDocument()
  })
})
