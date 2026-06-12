// src/screens/records/RecordsScreen.tsx
//
// The records screen (T7's de-hardcode screen). Everything is driven by the
// /_meta descriptor: the model picker lists descriptor.models, the identifier
// comes from identifier_field, columns and forms come from fields[], queries
// from indexes[], collections from instance-scoped datatypes[]. There is no
// hardcoded model name, no key-pattern regex, and no offline fallback — a
// failed fetch renders the shared ErrorState, full stop.

import type React from 'react'
import { useState } from 'react'

import { ErrorState } from '../../components/ErrorState'
import type { AppDescriptor, ModelDescriptor } from '../../data/descriptor'
import { useResource } from '../../data/useResource'
import { CreateRecord } from './CreateRecord'
import { RecordDetail } from './RecordDetail'
import { RecordList } from './RecordList'

type View = { name: 'list' } | { name: 'detail'; id: string } | { name: 'create' }

export function RecordsScreen(): React.JSX.Element {
  const meta = useResource<AppDescriptor>((api) => api.request('/_meta'), [])
  const [modelName, setModelName] = useState<string | null>(null)
  const [view, setView] = useState<View>({ name: 'list' })
  // Bumped after every successful mutation so the list refetches live data.
  const [listEpoch, setListEpoch] = useState(0)

  return (
    <section className="records-screen" data-testid="screen-records">
      <h2 className="screen-title">Records</h2>
      {renderBody()}
    </section>
  )

  function renderBody(): React.JSX.Element {
    if (meta.state.phase === 'loading') {
      return (
        <p className="screen-loading" data-testid="records-loading">
          <span className="spinner" aria-hidden="true" /> Loading model descriptors…
        </p>
      )
    }
    if (meta.state.phase === 'error') {
      return <ErrorState error={meta.state.error} onRetry={meta.reload} />
    }

    const models = meta.state.data.models ?? []
    if (models.length === 0) {
      return (
        <p data-testid="records-no-models">
          The descriptor lists no models. Nothing to browse — check the server
          boot (model registration) rather than this screen.
        </p>
      )
    }

    const model = models.find((m) => m.model === modelName) ?? models[0]
    return (
      <>
        <ModelPicker
          models={models}
          current={model}
          onChange={(name) => {
            setModelName(name)
            setView({ name: 'list' })
          }}
        />
        {renderView(model)}
      </>
    )
  }

  function renderView(model: ModelDescriptor): React.JSX.Element {
    const bumpEpoch = (): void => setListEpoch((n) => n + 1)

    switch (view.name) {
      case 'detail':
        return (
          <RecordDetail
            key={`${model.model}:${view.id}`}
            model={model}
            id={view.id}
            onBack={() => setView({ name: 'list' })}
            onChanged={bumpEpoch}
          />
        )
      case 'create':
        return (
          <CreateRecord
            key={model.model}
            model={model}
            onCancel={() => setView({ name: 'list' })}
            onCreated={() => {
              bumpEpoch()
              setView({ name: 'list' })
            }}
          />
        )
      default:
        return (
          <RecordList
            key={model.model}
            model={model}
            epoch={listEpoch}
            onOpen={(id) => setView({ name: 'detail', id })}
            onCreate={() => setView({ name: 'create' })}
          />
        )
    }
  }
}

interface ModelPickerProps {
  models: ModelDescriptor[]
  current: ModelDescriptor
  onChange(name: string): void
}

function ModelPicker(props: ModelPickerProps): React.JSX.Element {
  const { models, current, onChange } = props
  return (
    <div className="records-modelbar">
      <label className="records-modelbar-label" htmlFor="records-model-select">
        Model
      </label>
      <select
        id="records-model-select"
        data-testid="records-model-select"
        value={current.model}
        onChange={(e) => onChange(e.target.value)}
      >
        {models.map((m) => (
          <option key={m.model} value={m.model}>
            {m.model}
          </option>
        ))}
      </select>
      {current.key_pattern && (
        <code className="records-keypattern" data-testid="records-key-pattern">
          {current.key_pattern}
        </code>
      )}
      {current.identifier_field ? (
        <span className="records-modelbar-note">
          identifier: <code>{current.identifier_field}</code>
        </span>
      ) : (
        <span className="records-modelbar-note" data-testid="records-no-identifier">
          no identifier field declared — records cannot be opened individually
        </span>
      )}
    </div>
  )
}
