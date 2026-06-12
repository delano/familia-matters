// src/screens/records/RecordDetail.tsx
//
// Descriptor-driven record detail: every field row comes from fields[]
// (transient rendered as deliberately absent, encrypted as [CONCEALED] with
// the audited reveal flow when the model declares the action), edit mode from
// editableFields('update'), per-record collections from instance-scoped
// datatypes[]. Mutations run through useMutation so refusals (read_only,
// record_exists, missing permission) render inline and unmissable.

import type React from 'react'
import { useState } from 'react'

import { ErrorState } from '../../components/ErrorState'
import {
  editableFields,
  instanceDatatypes,
  modelActions,
  type DatatypeDescriptor,
  type FieldDescriptor,
  type ModelDescriptor,
  type RecordData,
} from '../../data/descriptor'
import { useMutation } from '../../data/useMutation'
import { useResource } from '../../data/useResource'
import {
  destroyRecord,
  readCollection,
  readRecord,
  revealField,
  updateRecord,
  type CollectionPage,
} from './api'
import { formatFieldValue, formatMember } from './format'

interface RecordDetailProps {
  model: ModelDescriptor
  id: string
  onBack(): void
  /** Called after any successful mutation so the parent list refetches. */
  onChanged(): void
}

export function RecordDetail(props: RecordDetailProps): React.JSX.Element {
  const { model, id, onBack, onChanged } = props
  const record = useResource<RecordData>(
    (api) => readRecord(api, model.model, id),
    [model.model, id],
  )

  return (
    <div className="record-detail" data-testid="records-detail">
      <button type="button" className="record-back" data-testid="records-back" onClick={onBack}>
        ‹ All {model.model} records
      </button>
      {renderBody()}
    </div>
  )

  function renderBody(): React.JSX.Element {
    if (record.state.phase === 'loading') {
      return (
        <p className="screen-loading" data-testid="records-detail-loading">
          <span className="spinner" aria-hidden="true" /> Loading record…
        </p>
      )
    }
    if (record.state.phase === 'error') {
      return <ErrorState error={record.state.error} onRetry={record.reload} />
    }
    return (
      <RecordDetailBody
        model={model}
        id={id}
        record={record.state.data}
        onSaved={() => {
          record.reload()
          onChanged()
        }}
        onDestroyed={() => {
          onChanged()
          onBack()
        }}
      />
    )
  }
}

// ---------------------------------------------------------------------------

interface RecordDetailBodyProps {
  model: ModelDescriptor
  id: string
  record: RecordData
  onSaved(): void
  onDestroyed(): void
}

function RecordDetailBody(props: RecordDetailBodyProps): React.JSX.Element {
  const { model, id, record, onSaved, onDestroyed } = props
  const actions = modelActions(model)
  const fields = model.fields ?? []
  const updatable = editableFields(model, 'update')

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [confirmingDestroy, setConfirmingDestroy] = useState(false)
  const saveMutation = useMutation()
  const destroyMutation = useMutation()

  const startEdit = (): void => {
    const initial: Record<string, string> = {}
    for (const f of updatable) {
      // Encrypted values display as '[CONCEALED]'; prefilling would write the
      // mask back as the secret. Encrypted inputs start empty: blank = keep.
      initial[f.name] =
        f.category === 'encrypted' ? '' : String(record[f.name] ?? '')
    }
    setDraft(initial)
    saveMutation.reset()
    setEditing(true)
  }

  const changedFields = (): Record<string, string> => {
    const changes: Record<string, string> = {}
    for (const f of updatable) {
      const value = draft[f.name] ?? ''
      if (f.category === 'encrypted') {
        if (value.trim() !== '') changes[f.name] = value
      } else if (value !== String(record[f.name] ?? '')) {
        changes[f.name] = value
      }
    }
    return changes
  }

  const save = async (): Promise<void> => {
    const changes = changedFields()
    if (Object.keys(changes).length === 0) return
    const saved = await saveMutation.run((api) =>
      updateRecord(api, model.model, id, changes),
    )
    if (saved !== null) {
      setEditing(false)
      onSaved()
    }
  }

  const destroy = async (): Promise<void> => {
    const result = await destroyMutation.run((api) =>
      destroyRecord(api, model.model, id),
    )
    if (result !== null) onDestroyed()
  }

  const key = record._key
  const hasChanges = Object.keys(changedFields()).length > 0

  return (
    <>
      <div className="record-head">
        <h3 className="record-id" data-testid="records-detail-id">
          <code>{id}</code>
        </h3>
        {typeof key === 'string' && (
          <code className="records-keypattern" data-testid="records-detail-key">
            {key}
          </code>
        )}
        <span className="record-head-actions">
          {!editing && actions.includes('update') && updatable.length > 0 && (
            <button type="button" data-testid="records-edit" onClick={startEdit}>
              Edit
            </button>
          )}
          {!editing && actions.includes('destroy') && (
            <button
              type="button"
              className="record-destroy-btn"
              data-testid="records-destroy"
              onClick={() => {
                destroyMutation.reset()
                setConfirmingDestroy(true)
              }}
            >
              Destroy
            </button>
          )}
          {editing && (
            <>
              <button
                type="button"
                data-testid="records-edit-cancel"
                disabled={saveMutation.state.phase === 'pending'}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="records-create-btn"
                data-testid="records-save"
                disabled={!hasChanges || saveMutation.state.phase === 'pending'}
                onClick={() => void save()}
              >
                {saveMutation.state.phase === 'pending' ? 'Saving…' : 'Save changes'}
              </button>
            </>
          )}
        </span>
      </div>

      {confirmingDestroy && (
        <div className="destroy-confirm" role="alertdialog" data-testid="records-destroy-confirm">
          <p>
            Destroy <code>{id}</code>? This deletes the record, its index
            entries, and its collections. It cannot be undone (a serialized
            snapshot is written to the audit trail).
          </p>
          {destroyMutation.state.phase === 'error' && (
            <ErrorState error={destroyMutation.state.error} />
          )}
          <div className="record-form-actions">
            <button
              type="button"
              data-testid="records-destroy-cancel"
              disabled={destroyMutation.state.phase === 'pending'}
              onClick={() => setConfirmingDestroy(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="record-destroy-btn"
              data-testid="records-destroy-apply"
              disabled={destroyMutation.state.phase === 'pending'}
              onClick={() => void destroy()}
            >
              {destroyMutation.state.phase === 'pending' ? 'Destroying…' : 'Destroy record'}
            </button>
          </div>
        </div>
      )}

      {editing && saveMutation.state.phase === 'error' && (
        <ErrorState error={saveMutation.state.error} />
      )}

      <div className="field-rows" data-testid="records-fields">
        {fields.length === 0 && (
          <p className="records-note" data-testid="records-fields-raw">
            The descriptor declares no fields for this model; raw record:{' '}
            <code>{JSON.stringify(record)}</code>
          </p>
        )}
        {fields.map((f) => (
          <FieldRow
            key={f.name}
            model={model}
            id={id}
            field={f}
            record={record}
            editing={editing && updatable.some((u) => u.name === f.name)}
            draftValue={draft[f.name] ?? ''}
            onDraftChange={(value) => setDraft((d) => ({ ...d, [f.name]: value }))}
          />
        ))}
      </div>

      <CollectionsSection model={model} id={id} />
    </>
  )
}

// ---------------------------------------------------------------------------

interface FieldRowProps {
  model: ModelDescriptor
  id: string
  field: FieldDescriptor
  record: RecordData
  editing: boolean
  draftValue: string
  onDraftChange(value: string): void
}

function FieldRow(props: FieldRowProps): React.JSX.Element {
  const { model, id, field, record, editing, draftValue, onDraftChange } = props

  return (
    <div className="field-row" data-testid={`field-${field.name}`}>
      <span className="field-row-name">
        <code>{field.name}</code>
        {field.identifier && <em>identifier</em>}
        {field.category && field.category !== 'field' && <em>{field.category}</em>}
      </span>
      <span className="field-row-value">{renderValue()}</span>
    </div>
  )

  function renderValue(): React.ReactNode {
    if (field.category === 'transient') {
      return (
        <span className="records-note">
          transient — never persisted; absent from API payloads by design
        </span>
      )
    }
    if (field.category === 'encrypted') {
      if (editing) {
        return (
          <span className="field-edit-encrypted">
            <input
              type="text"
              data-testid={`edit-input-${field.name}`}
              placeholder="leave blank to keep the current secret"
              value={draftValue}
              onChange={(e) => onDraftChange(e.target.value)}
            />
          </span>
        )
      }
      return <EncryptedValue model={model} id={id} field={field} record={record} />
    }
    if (editing) {
      return (
        <input
          type="text"
          data-testid={`edit-input-${field.name}`}
          value={draftValue}
          onChange={(e) => onDraftChange(e.target.value)}
        />
      )
    }
    return <span>{formatFieldValue(field.name, record[field.name])}</span>
  }
}

interface EncryptedValueProps {
  model: ModelDescriptor
  id: string
  field: FieldDescriptor
  record: RecordData
}

/** [CONCEALED] display with the gated, audited reveal flow. */
function EncryptedValue(props: EncryptedValueProps): React.JSX.Element {
  const { model, id, field, record } = props
  const canReveal = modelActions(model).includes('reveal')
  const [stage, setStage] = useState<'concealed' | 'confirm' | 'revealed'>('concealed')
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [audit, setAudit] = useState<unknown>(null)
  const reveal = useMutation()

  const doReveal = async (): Promise<void> => {
    const result = await reveal.run((api) => revealField(api, model.model, id, field.name))
    if (result !== null) {
      setPlaintext(String(result[field.name] ?? ''))
      setAudit(result._audit ?? null)
      setStage('revealed')
    }
  }

  if (stage === 'revealed' && plaintext !== null) {
    return (
      <span className="field-revealed">
        <code data-testid={`revealed-${field.name}`}>{plaintext}</code>
        <button
          type="button"
          data-testid={`conceal-${field.name}`}
          onClick={() => {
            setPlaintext(null)
            setStage('concealed')
          }}
        >
          Conceal
        </button>
        <span className="records-note">
          revealed once and written to the audit trail
          {audit !== null && <code> {JSON.stringify(audit)}</code>}
        </span>
      </span>
    )
  }

  return (
    <span className="field-concealed">
      <code>{String(record[field.name] ?? field.display ?? '[CONCEALED]')}</code>
      {canReveal && stage === 'concealed' && (
        <button
          type="button"
          data-testid={`reveal-${field.name}`}
          onClick={() => {
            reveal.reset()
            setStage('confirm')
          }}
        >
          Reveal
        </button>
      )}
      {stage === 'confirm' && (
        <span className="reveal-confirm" data-testid={`reveal-confirm-${field.name}`}>
          Elevated and audited — the reveal is written to the audit trail.
          <button
            type="button"
            data-testid={`reveal-cancel-${field.name}`}
            disabled={reveal.state.phase === 'pending'}
            onClick={() => setStage('concealed')}
          >
            Cancel
          </button>
          <button
            type="button"
            className="records-create-btn"
            data-testid={`reveal-apply-${field.name}`}
            disabled={reveal.state.phase === 'pending'}
            onClick={() => void doReveal()}
          >
            {reveal.state.phase === 'pending' ? 'Revealing…' : 'Reveal once'}
          </button>
        </span>
      )}
      {reveal.state.phase === 'error' && <ErrorState error={reveal.state.error} />}
    </span>
  )
}

// ---------------------------------------------------------------------------

interface CollectionsSectionProps {
  model: ModelDescriptor
  id: string
}

function CollectionsSection(props: CollectionsSectionProps): React.JSX.Element {
  const { model, id } = props
  const datatypes = instanceDatatypes(model)

  return (
    <div className="collections" data-testid="records-collections">
      <h4 className="collections-title">Collections</h4>
      {datatypes.length === 0 && (
        <p className="records-note">No instance-level collections declared.</p>
      )}
      {datatypes.map((dt) => (
        <CollectionPanel key={dt.name} model={model} id={id} datatype={dt} />
      ))}
    </div>
  )
}

interface CollectionPanelProps {
  model: ModelDescriptor
  id: string
  datatype: DatatypeDescriptor
}

function CollectionPanel(props: CollectionPanelProps): React.JSX.Element {
  const { model, id, datatype } = props

  return (
    <div className="collection-panel" data-testid={`collection-${datatype.name}`}>
      <div className="collection-head">
        <code>{datatype.name}</code>
        <span className="collection-type">{datatype.type ?? 'unknown'}</span>
      </div>
      {datatype.type === 'counter' ? (
        // The collections endpoint enumerates members; a counter has none and
        // its value is not exposed there. Saying so beats rendering a fake 0.
        <p className="records-note" data-testid={`collection-${datatype.name}-counter`}>
          counter — its value is not exposed by the collections API.
        </p>
      ) : (
        <CollectionMembers model={model} id={id} name={datatype.name} />
      )}
    </div>
  )
}

function CollectionMembers(props: {
  model: ModelDescriptor
  id: string
  name: string
}): React.JSX.Element {
  const { model, id, name } = props
  const page = useResource<CollectionPage>(
    (api) => readCollection(api, model.model, id, name),
    [model.model, id, name],
  )

  if (page.state.phase === 'loading') {
    return (
      <p className="screen-loading">
        <span className="spinner" aria-hidden="true" /> Loading…
      </p>
    )
  }
  if (page.state.phase === 'error') {
    return <ErrorState error={page.state.error} onRetry={page.reload} />
  }

  const members = page.state.data.members ?? []
  if (members.length === 0) {
    return <p className="records-note">empty</p>
  }
  return (
    <ul className="collection-members">
      {members.map((m, i) => (
        <li key={i}>
          <code>{formatMember(m)}</code>
        </li>
      ))}
    </ul>
  )
}
