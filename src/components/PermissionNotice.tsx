// src/components/PermissionNotice.tsx
//
// Presentational, dismissible banner shown when a protected action is denied for
// lack of permission (a 403). The operator STAYS authenticated; this only
// surfaces the denial. The parent owns dismissal via onDismiss.

import type React from 'react'

import type { PermissionNotice as PermissionNoticeData } from '../types'

interface PermissionNoticeProps extends PermissionNoticeData {
  onDismiss(): void
}

const DEFAULT_MESSAGE = 'You lack permission for that action.'

export function PermissionNotice(props: PermissionNoticeProps): React.JSX.Element {
  const { message, onDismiss } = props

  return (
    <div
      className="permission-notice"
      data-testid="permission-notice"
      role="alert"
    >
      <span className="permission-notice-text">{message ?? DEFAULT_MESSAGE}</span>
      <button
        className="notice-dismiss"
        data-testid="notice-dismiss"
        type="button"
        aria-label="Dismiss notice"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  )
}
