// src/components/SessionBar.test.tsx
//
// Presentational coverage for the claims header: every claim renders, the
// expiry shows a relative hint, and logout reports up. The Claims type carries
// no token, so "never renders a token" is enforced by the compiler; these tests
// pin the operator-visible behavior.

import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Claims } from '../types'
import { SessionBar } from './SessionBar'

afterEach(cleanup)

function claims(overrides: Partial<Claims> = {}): Claims {
  return {
    sub: 'admin',
    role: 'admin',
    permissions: ['repair', 'reveal_secrets'],
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  }
}

describe('SessionBar', () => {
  it('renders subject, role, and one chip per permission', () => {
    render(<SessionBar claims={claims()} onLogout={vi.fn()} />)

    expect(screen.getByTestId('claim-sub')).toHaveTextContent('admin')
    expect(screen.getByTestId('claim-role')).toHaveTextContent('admin')
    const chips = within(screen.getByTestId('claim-permissions'))
    expect(chips.getByText('repair')).toBeInTheDocument()
    expect(chips.getByText('reveal_secrets')).toBeInTheDocument()
  })

  it('renders an explicit "none" chip for an empty permission set', () => {
    render(<SessionBar claims={claims({ permissions: [] })} onLogout={vi.fn()} />)
    expect(screen.getByTestId('claim-permissions')).toHaveTextContent('none')
  })

  it('shows a relative hint for a future expiry and "expired" for a past one', () => {
    const { unmount } = render(<SessionBar claims={claims()} onLogout={vi.fn()} />)
    expect(screen.getByTestId('claim-exp').textContent).toMatch(/\(in \d+[smhd]\)/)
    unmount()

    render(
      <SessionBar
        claims={claims({ exp: Math.floor(Date.now() / 1000) - 60 })}
        onLogout={vi.fn()}
      />,
    )
    expect(screen.getByTestId('claim-exp')).toHaveTextContent('expired')
  })

  it('reports logout clicks up to the parent', async () => {
    const user = userEvent.setup()
    const onLogout = vi.fn()
    render(<SessionBar claims={claims()} onLogout={onLogout} />)

    await user.click(screen.getByTestId('logout-btn'))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
