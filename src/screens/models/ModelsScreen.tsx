// src/screens/models/ModelsScreen.tsx
//
// The Models screen: a read-only schema browser built entirely from the /_meta
// app descriptor (lib/familia/admin/descriptor.rb). It is loaded ONCE through
// useResource — the same data layer the records screen uses — and there is no
// offline fallback, no seed data, and no fake-backend simulator (the retired
// prototype's request-simulator, seed globals, and offline copies are all
// deleted). A failed fetch renders the shared ErrorState, full stop; the real
// SPA speaks REST through api.request, exactly like the records screen.
// An empty/absent models list
// renders an explicit empty state. The root data-testid="screen-models" renders
// in EVERY state, including when /_meta answers {} (an empty object) or the
// session is dead — both are null-guarded, never thrown on.
//
// List view: descriptor.models as a .data-table, columns read off the
// reflection contract. Detail view: per-model tabs (Overview, Fields, Datatypes,
// Indexes, Participations, Descriptor) driven straight from that model's /_meta
// entry — no second fetch needed.

import type React from 'react'
import { useState } from 'react'

import './models.css'

import { ErrorState } from '../../components/ErrorState'
import type { AppDescriptor } from '../../data/descriptor'
import { useResource } from '../../data/useResource'
import { ModelDetail } from './ModelDetail'
import { ModelList } from './ModelList'

export function ModelsScreen(): React.JSX.Element {
  const meta = useResource<AppDescriptor>((api) => api.request('/_meta'), [])
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <section className="models-screen" data-testid="screen-models">
      <h2 className="screen-title">Models</h2>
      {renderBody()}
    </section>
  )

  function renderBody(): React.JSX.Element {
    if (meta.state.phase === 'loading') {
      return (
        <p className="screen-loading" data-testid="models-loading">
          <span className="spinner" aria-hidden="true" /> Loading model descriptors…
        </p>
      )
    }
    if (meta.state.phase === 'error') {
      return <ErrorState error={meta.state.error} onRetry={meta.reload} />
    }

    // The descriptor may be {} (no models key) or carry an empty list — both
    // mean "nothing to browse" and must not throw.
    const models = meta.state.data.models ?? []
    if (models.length === 0) {
      return (
        <p data-testid="models-empty">
          The descriptor lists no models — check server boot / model registration
          rather than this screen.
        </p>
      )
    }

    const model = models.find((m) => m.model === selected)
    if (model) {
      return (
        <ModelDetail
          key={model.model}
          model={model}
          onBack={() => setSelected(null)}
        />
      )
    }
    return <ModelList models={models} onOpen={(name) => setSelected(name)} />
  }
}
