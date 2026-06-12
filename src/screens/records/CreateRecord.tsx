// src/screens/records/CreateRecord.tsx
//
// Descriptor-driven create form. Editable fields come from editableFields()
// ('create' mode: timestamps excluded — the server stamps them; identifier
// included as optional input). Encrypted fields are writable (a new secret),
// stored concealed. Failures render the explicit refusal inline: 409
// record_exists (unique-index conflict), 403 read_only, 400 bad_request.

import type React from 'react'
import { useState } from 'react'

import { ErrorState } from '../../components/ErrorState'
import { editableFields, type ModelDescriptor } from '../../data/descriptor'
import { useMutation } from '../../data/useMutation'
import { createRecord } from './api'

interface CreateRecordProps {
  model: ModelDescriptor
  onCancel(): void
  onCreated(): void
}

export function CreateRecord(props: CreateRecordProps): React.JSX.Element {
  const { model, onCancel, onCreated } = props
  const fields = editableFields(model, 'create')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const mutation = useMutation()

  const submit = async (): Promise<void> => {
    // Only send fields the operator actually filled in; the server applies
    // model defaults (and stamps timestamps) for the rest.
    const payload: Record<string, string> = {}
    for (const f of fields) {
      const value = (draft[f.name] ?? '').trim()
      if (value !== '') payload[f.name] = value
    }
    if (Object.keys(payload).length === 0) return

    const created = await mutation.run((api) => createRecord(api, model.model, payload))
    if (created !== null) onCreated()
  }

  const hasInput = fields.some((f) => (draft[f.name] ?? '').trim() !== '')

  return (
    <div className="record-form" data-testid="records-create">
      <h3 className="record-form-title">
        New <code>{model.model}</code> record
      </h3>
      <p className="records-note">
        Timestamps are server-stamped. Only filled-in fields are sent.
      </p>

      <div className="record-form-fields">
        {fields.map((f) => (
          <label key={f.name} className="record-form-field">
            <span className="record-form-label">
              <code>{f.name}</code>
              {f.identifier && <em> identifier — optional if the model assigns one</em>}
              {f.category === 'encrypted' && <em> encrypted — stored concealed</em>}
            </span>
            <input
              type="text"
              data-testid={`create-input-${f.name}`}
              value={draft[f.name] ?? ''}
              disabled={mutation.state.phase === 'pending'}
              onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      {mutation.state.phase === 'error' && <ErrorState error={mutation.state.error} />}

      <div className="record-form-actions">
        <button
          type="button"
          data-testid="create-cancel"
          disabled={mutation.state.phase === 'pending'}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="records-create-btn"
          data-testid="create-submit"
          disabled={!hasInput || mutation.state.phase === 'pending'}
          onClick={() => void submit()}
        >
          {mutation.state.phase === 'pending' ? 'Creating…' : 'Create record'}
        </button>
      </div>
    </div>
  )
}
