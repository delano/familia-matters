// src/screens/models/ModelList.tsx
//
// The model registry, reflected straight off the /_meta descriptor: every
// column here is read off the reflection contract, never hardcoded. Each row
// opens that model's detail view. The descriptor IS the source of truth — when
// reflection omits a value (class, identifier_field, ...) the cell renders an
// explicit em dash rather than inventing one.

import type React from 'react'

import type { ModelDescriptor } from '../../data/descriptor'
import { expirationLabel, lengthOf } from './format'

interface ModelListProps {
  models: ModelDescriptor[]
  onOpen(name: string): void
}

/** An em dash for any value reflection did not provide. */
function dash(value: string | undefined): React.ReactNode {
  return value === undefined || value === '' ? <span className="models-muted">—</span> : value
}

export function ModelList(props: ModelListProps): React.JSX.Element {
  const { models, onOpen } = props

  return (
    <div className="models-list" data-testid="models-list">
      <p className="models-context" data-testid="models-context">
        Every column is read straight off the reflection contract —{' '}
        <code>/_meta</code>. The descriptor is the frontend's source of truth.
      </p>
      <table className="data-table" data-testid="models-table">
        <thead>
          <tr>
            <th scope="col">class</th>
            <th scope="col">key_pattern</th>
            <th scope="col">identifier</th>
            <th scope="col" className="cell-num">
              fields
            </th>
            <th scope="col" className="cell-num">
              datatypes
            </th>
            <th scope="col" className="cell-num">
              indexes
            </th>
            <th scope="col">expiration</th>
            <th scope="col" aria-label="Row actions" />
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.model} data-testid="models-row">
              <td className="cell-mono">
                {dash(m.class)}
                {m.logical_database !== undefined && (
                  <span className="models-db-chip">db{m.logical_database}</span>
                )}
              </td>
              <td className="cell-mono models-muted">{dash(m.key_pattern)}</td>
              <td className="cell-mono">{dash(m.identifier_field)}</td>
              <td className="cell-mono cell-num">{lengthOf(m.fields)}</td>
              <td className="cell-mono cell-num">{lengthOf(m.datatypes)}</td>
              <td className="cell-mono cell-num">{lengthOf(m.indexes)}</td>
              <td className="cell-mono models-muted">{expirationLabel(m)}</td>
              <td className="cell-actions">
                <button
                  type="button"
                  data-testid={`models-open-${m.model}`}
                  onClick={() => onOpen(m.model)}
                >
                  Detail
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
