// src/components/PermissionNotice.test.tsx
//
// The 403 banner: surfaces the denial (as an alert, with the server's message
// or a generic fallback) and dismisses via the parent. It must never imply a
// logout — it renders alongside the authenticated shell, which
// AuthProvider.test.tsx covers end-to-end.

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PermissionNotice } from './PermissionNotice'

afterEach(cleanup)

describe('PermissionNotice', () => {
  it('renders the server-provided denial message as an alert', () => {
    render(<PermissionNotice message="Requires permission: repair" onDismiss={vi.fn()} />)

    const notice = screen.getByTestId('permission-notice')
    expect(notice).toHaveAttribute('role', 'alert')
    expect(notice).toHaveTextContent('Requires permission: repair')
  })

  it('falls back to a generic message when the server gave none', () => {
    render(<PermissionNotice message={undefined} onDismiss={vi.fn()} />)
    expect(screen.getByTestId('permission-notice')).toHaveTextContent(
      'You lack permission for that action.',
    )
  })

  it('reports dismissal up to the parent', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<PermissionNotice message="nope" onDismiss={onDismiss} />)

    await user.click(screen.getByTestId('notice-dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
