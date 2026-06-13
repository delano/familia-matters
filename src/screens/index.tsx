// src/screens/index.tsx
//
// The route table for the five admin screens (plan §6 T7). Each entry is a
// placeholder until its port lands; the table is what the AppShell nav and
// route switch consume, so a screen port only ever touches its own component.

import type React from 'react'

import { PlaceholderScreen } from './PlaceholderScreen'
import { RecordsScreen } from './records/RecordsScreen'

export interface ScreenRoute {
  /** Route path, e.g. '/records'. */
  path: string
  /** Route slug for testids, e.g. 'records'. */
  slug: string
  /** Nav label. */
  label: string
  render(): React.JSX.Element
}

export const SCREEN_ROUTES: readonly ScreenRoute[] = [
  {
    path: '/records',
    slug: 'records',
    label: 'Records',
    render: () => <RecordsScreen />,
  },
  {
    path: '/models',
    slug: 'models',
    label: 'Models',
    render: () => (
      <PlaceholderScreen
        name="Models"
        slug="models"
        description="Model descriptors from /_meta: fields and categories, datatypes, indexes, participations, and expiration policy."
      />
    ),
  },
  {
    path: '/integrity',
    slug: 'integrity',
    label: 'Integrity',
    render: () => (
      <PlaceholderScreen
        name="Integrity"
        slug="integrity"
        description="Per-model health checks, dry-run and live repair, with progress streamed over EventSource as it happens."
      />
    ),
  },
  {
    path: '/migrations',
    slug: 'migrations',
    label: 'Migrations',
    render: () => (
      <PlaceholderScreen
        name="Migrations"
        slug="migrations"
        description="Migration runner status and schema drift. Renders an explicit 'runner unavailable' state while Familia ships no migration runner — never fabricated progress."
      />
    ),
  },
  {
    path: '/explorer',
    slug: 'explorer',
    label: 'Explorer',
    render: () => (
      <PlaceholderScreen
        name="Explorer"
        slug="explorer"
        description="Raw key browser (SCAN paging), typed value inspector, and the allowlisted command console."
      />
    ),
  },
]
