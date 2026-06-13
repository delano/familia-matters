// src/screens/explorer/ExplorerScreen.tsx
//
// The Explorer screen: a raw Redis/Valkey key browser, a typed value inspector,
// and a read-only command console — all speaking REST through useResource /
// useMutation (../../api/client via useAuth). There is NO offline fallback, NO
// seed data, NO in-browser simulator, NO escalation override, and NO live feed:
// the retired prototype's local-state fallback, the command-escalation button,
// and the simulated Live Feed tab are all deliberately absent. A blocked command
// is terminal (403 command_blocked); the allowlist has no override.
//
// Layout: a left key-search pane, a right pane with two tabs (Inspector / Server
// Info), and the command console pinned below. The root data-testid renders in
// EVERY state — including the routing smoke test that mounts this with a stub
// `request` returning {} or an unauthenticated outcome — so it never throws.

import type React from 'react'
import { useState } from 'react'

import { Console } from './Console'
import { Inspector, ServerInfoPanel } from './Inspector'
import { KeyBrowser } from './KeyBrowser'
import './explorer.css'

type RightTab = 'inspector' | 'info'

export function ExplorerScreen(): React.JSX.Element {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<RightTab>('inspector')

  const openRecords = (): void => {
    // Hash-nav to the Records screen; the model-aware detail renders the same
    // object with its schema. (The Records screen owns its own deep linking.)
    window.location.hash = '#/records'
  }

  return (
    <section className="explorer-screen" data-testid="screen-explorer">
      <h2 className="screen-title">Explorer</h2>

      <div className="explorer-panes">
        <KeyBrowser
          selectedKey={selectedKey}
          onSelect={(key) => {
            setSelectedKey(key)
            setRightTab('inspector')
          }}
        />

        <div className="explorer-right">
          <div className="explorer-tabs" role="tablist" aria-label="Inspector views">
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'inspector'}
              data-testid="explorer-tab-inspector"
              className={
                rightTab === 'inspector' ? 'explorer-tab explorer-tab--active' : 'explorer-tab'
              }
              onClick={() => setRightTab('inspector')}
            >
              Inspector
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'info'}
              data-testid="explorer-tab-info"
              className={
                rightTab === 'info' ? 'explorer-tab explorer-tab--active' : 'explorer-tab'
              }
              onClick={() => setRightTab('info')}
            >
              Server Info
            </button>
          </div>

          <div className="explorer-right-body">
            {rightTab === 'inspector' ? (
              <Inspector selectedKey={selectedKey} onOpenRecords={openRecords} />
            ) : (
              <ServerInfoPanel />
            )}
          </div>
        </div>
      </div>

      <Console />
    </section>
  )
}
