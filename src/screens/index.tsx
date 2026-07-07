// src/screens/index.tsx
//
// The route table for the admin screens. The original five (plan §6 T7) —
// Records, Models, Integrity, Migrations, Explorer — are joined by the Audit
// trail (R-AUD-1), the operator-facing view of the append-only audit sink that
// has shipped on the backend since T6. Each screen builds itself from the
// backend contract (the /_meta descriptor, the integrity/migration/raw/audit
// endpoints) and renders explicit error/honest states on failure, never seed
// data. The table is what the AppShell nav and route switch consume, so a
// screen only ever owns its own component subtree under ./<slug>/.

import type React from 'react'

import { AuditScreen } from './audit/AuditScreen'
import { ExplorerScreen } from './explorer/ExplorerScreen'
import { IntegrityScreen } from './integrity/IntegrityScreen'
import { MigrationsScreen } from './migrations/MigrationsScreen'
import { ModelsScreen } from './models/ModelsScreen'
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
    render: () => <ModelsScreen />,
  },
  {
    path: '/integrity',
    slug: 'integrity',
    label: 'Integrity',
    render: () => <IntegrityScreen />,
  },
  {
    path: '/migrations',
    slug: 'migrations',
    label: 'Migrations',
    render: () => <MigrationsScreen />,
  },
  {
    path: '/audit',
    slug: 'audit',
    label: 'Audit',
    render: () => <AuditScreen />,
  },
  {
    path: '/explorer',
    slug: 'explorer',
    label: 'Explorer',
    render: () => <ExplorerScreen />,
  },
]
