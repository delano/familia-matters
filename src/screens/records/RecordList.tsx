// src/screens/records/RecordList.tsx
//
// Descriptor-driven record listing: columns from fields[], identifier from
// identifier_field, paging off the instances timeline (count_fast is O(1) and
// may include phantoms — labeled as such, reconciled by the integrity screen).
// The query bar runs ONLY declared queryable indexes; an unindexed query the
// server gates with scan_required renders the explicit refusal pane. There is
// no force escalation and no client-side filtering theater.

import type React from 'react'
import { useState } from 'react'

import { ErrorState } from '../../components/ErrorState'
import {
  identifierOf,
  modelActions,
  queryableIndexes,
  visibleFields,
  editableFields,
  type FieldDescriptor,
  type ModelDescriptor,
  type RecordData,
} from '../../data/descriptor'
import { useResource } from '../../data/useResource'
import { listRecords, queryIndex, PAGE_LIMIT, type QueryIndexResult } from './api'
import { formatFieldValue } from './format'

interface RecordListProps {
  model: ModelDescriptor
  /** Bumped by the parent after mutations; re-runs the fetch. */
  epoch: number
  onOpen(id: string): void
  onCreate(): void
}

export function RecordList(props: RecordListProps): React.JSX.Element {
  const { model, epoch, onOpen, onCreate } = props
  const [offset, setOffset] = useState(0)
  /** The submitted index query; while set, results replace the page listing. */
  const [query, setQuery] = useState<{ index: string; value: string } | null>(null)

  const page = useResource(
    (api) => listRecords(api, model.model, offset),
    [model.model, offset, epoch],
  )

  const actions = modelActions(model)
  const fields = visibleFields(model)
  const canCreate = actions.includes('create') && editableFields(model, 'create').length > 0
  const indexes = queryableIndexes(model)

  return (
    <div className="records-list" data-testid="records-list">
      <div className="records-toolbar">
        {indexes.length > 0 && (
          <QueryBar
            indexes={indexes.map((i) => i.index_name)}
            onRun={(index, value) => setQuery({ index, value })}
            onClear={() => setQuery(null)}
            active={query !== null}
          />
        )}
        {canCreate && (
          <button
            type="button"
            className="records-create-btn"
            data-testid="records-new"
            onClick={onCreate}
          >
            New record
          </button>
        )}
      </div>

      {query ? (
        <QueryResults
          model={model}
          fields={fields}
          index={query.index}
          value={query.value}
          onOpen={onOpen}
          onClear={() => setQuery(null)}
        />
      ) : (
        renderPage()
      )}
    </div>
  )

  function renderPage(): React.JSX.Element {
    if (page.state.phase === 'loading') {
      return (
        <p className="screen-loading" data-testid="records-page-loading">
          <span className="spinner" aria-hidden="true" /> Loading records…
        </p>
      )
    }
    if (page.state.phase === 'error') {
      return <ErrorState error={page.state.error} onRetry={page.reload} />
    }

    const data = page.state.data
    const records = data.records ?? []
    const countFast = data.count_fast

    return (
      <>
        <div className="records-meta" data-testid="records-meta">
          <span>
            {countFast === null || countFast === undefined
              ? 'count unavailable'
              : `${countFast} record${countFast === 1 ? '' : 's'} (count_fast — may include phantoms)`}
          </span>
          <span className="records-pager">
            <button
              type="button"
              data-testid="records-prev"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
            >
              ‹ Prev
            </button>
            <span>
              offset {offset} · limit {PAGE_LIMIT}
            </span>
            <button
              type="button"
              data-testid="records-next"
              disabled={records.length < PAGE_LIMIT}
              onClick={() => setOffset(offset + PAGE_LIMIT)}
            >
              Next ›
            </button>
          </span>
        </div>
        <RecordsTable model={model} fields={fields} records={records} onOpen={onOpen} />
      </>
    )
  }
}

// ---------------------------------------------------------------------------

interface RecordsTableProps {
  model: ModelDescriptor
  fields: FieldDescriptor[]
  records: RecordData[]
  onOpen(id: string): void
}

export function RecordsTable(props: RecordsTableProps): React.JSX.Element {
  const { model, fields, records, onOpen } = props
  const canRead = modelActions(model).includes('read')

  if (records.length === 0) {
    return (
      <p className="records-empty" data-testid="records-empty">
        0 records returned for this page.
      </p>
    )
  }

  if (fields.length === 0) {
    // The descriptor could not reflect any fields (compact-omitted). Render
    // the raw serialized records rather than pretending to know a schema.
    return (
      <div data-testid="records-raw">
        <p className="records-note">
          The descriptor declares no persistent fields for this model; showing
          raw serialized records.
        </p>
        <ul className="records-raw-list">
          {records.map((rec, i) => (
            <li key={i}>
              <code>{JSON.stringify(rec)}</code>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <table className="data-table" data-testid="records-table">
      <thead>
        <tr>
          {fields.map((f) => (
            <th key={f.name} scope="col">
              {f.name}
              {f.identifier ? ' ▪' : ''}
            </th>
          ))}
          <th scope="col" aria-label="Row actions" />
        </tr>
      </thead>
      <tbody>
        {records.map((rec, i) => {
          const id = identifierOf(model, rec)
          return (
            <tr key={id ?? i} data-testid="records-row">
              {fields.map((f) => (
                <td key={f.name} className={f.identifier ? 'cell-mono' : undefined}>
                  {formatFieldValue(f.name, rec[f.name])}
                </td>
              ))}
              <td className="cell-actions">
                {canRead && id !== null && (
                  <button
                    type="button"
                    data-testid={`records-open-${id}`}
                    onClick={() => onOpen(id)}
                  >
                    Open
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------

interface QueryBarProps {
  indexes: string[]
  active: boolean
  onRun(index: string, value: string): void
  onClear(): void
}

function QueryBar(props: QueryBarProps): React.JSX.Element {
  const { indexes, active, onRun, onClear } = props
  const [index, setIndex] = useState(indexes[0])
  const [value, setValue] = useState('')

  const run = (): void => {
    if (value.trim()) onRun(index, value.trim())
  }

  return (
    <div className="records-querybar" data-testid="records-querybar">
      <label htmlFor="records-query-index">Index</label>
      <select
        id="records-query-index"
        data-testid="records-query-index"
        value={index}
        onChange={(e) => setIndex(e.target.value)}
      >
        {indexes.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="text"
        data-testid="records-query-value"
        placeholder="value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') run()
        }}
      />
      <button
        type="button"
        data-testid="records-query-run"
        disabled={!value.trim()}
        onClick={run}
      >
        Run query
      </button>
      {active && (
        <button type="button" data-testid="records-query-clear" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  )
}

interface QueryResultsProps {
  model: ModelDescriptor
  fields: FieldDescriptor[]
  index: string
  value: string
  onOpen(id: string): void
  onClear(): void
}

function QueryResults(props: QueryResultsProps): React.JSX.Element {
  const { model, fields, index, value, onOpen, onClear } = props
  const result = useResource<QueryIndexResult>(
    (api) => queryIndex(api, model.model, index, value),
    [model.model, index, value],
  )

  if (result.state.phase === 'loading') {
    return (
      <p className="screen-loading" data-testid="records-query-loading">
        <span className="spinner" aria-hidden="true" /> Running indexed query…
      </p>
    )
  }
  if (result.state.phase === 'error') {
    return <ErrorState error={result.state.error} onRetry={result.reload} />
  }

  const data = result.state.data

  // The 200 scan_required contract: no queryable index covers the request.
  // This is a refusal pane, not an empty result — and there is no force
  // button, because the server has no scan to run (T5: scan_unavailable).
  if (data.error === 'scan_required') {
    return (
      <div className="scan-gate" role="alert" data-testid="records-scan-gate">
        <h3>Query refused: a full scan would be required</h3>
        <p>
          No queryable index covers <code>{index}</code> for this request. The
          server estimates ≈{data.estimated_rows ?? '?'} rows would be walked.
          Ad-hoc scans are unavailable by design — no data was fetched, and
          this tool cannot force one.
        </p>
        {data.hint && <p className="records-note">{data.hint}</p>}
      </div>
    )
  }

  const records = data.records ?? []
  return (
    <>
      <div className="records-meta" data-testid="records-query-meta">
        <span>
          indexed query <code>{index}</code> = <code>{value}</code> ·{' '}
          {records.length} match{records.length === 1 ? '' : 'es'}
        </span>
        <button type="button" onClick={onClear}>
          Back to all records
        </button>
      </div>
      <RecordsTable model={model} fields={fields} records={records} onOpen={onOpen} />
    </>
  )
}
