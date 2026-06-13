// src/screens/models/ModelDetail.tsx
//
// Full descriptor reflection for one model, driven entirely from its /_meta
// entry — no extra fetch (the /_meta model carries everything). Tabs: Overview ·
// Fields · Datatypes · Indexes · Participations · Descriptor (raw JSON). Every
// section null-guards its array and renders an explicit "none declared" when the
// model has none. The Datatypes tab cross-references indexes[] to keep
// index-backing internals out of the developer-declared collection list (the
// live reflection case from the fixtures README). Cross-screen buttons are plain
// hash nav (#/records, #/integrity) — the iframe/postMessage bridge is gone.

import type React from 'react'
import { useState } from 'react'

import type {
  DatatypeDescriptor,
  FieldDescriptor,
  IndexDescriptor,
  ModelDescriptor,
  ParticipationDescriptor,
} from '../../data/descriptor'
import {
  datatypeBlurb,
  expirationLabel,
  fieldCategory,
  fieldSchema,
  partitionDatatypes,
  schemaSummary,
} from './format'

type TabId =
  | 'overview'
  | 'fields'
  | 'datatypes'
  | 'indexes'
  | 'participations'
  | 'descriptor'

interface ModelDetailProps {
  model: ModelDescriptor
  onBack(): void
}

export function ModelDetail(props: ModelDetailProps): React.JSX.Element {
  const { model, onBack } = props
  const [tab, setTab] = useState<TabId>('overview')

  const fields = model.fields ?? []
  const indexes = model.indexes ?? []
  const participations = model.participations ?? []
  const { declared, internals } = partitionDatatypes(model)

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'fields', label: 'Fields', count: fields.length },
    { id: 'datatypes', label: 'Datatypes', count: declared.length },
    { id: 'indexes', label: 'Indexes', count: indexes.length },
    { id: 'participations', label: 'Participations', count: participations.length },
    { id: 'descriptor', label: 'Descriptor' },
  ]

  return (
    <div className="model-detail" data-testid="models-detail">
      <button
        type="button"
        className="model-back"
        data-testid="models-back"
        onClick={onBack}
      >
        ‹ All models
      </button>

      <div className="model-head">
        <h3 className="model-title" data-testid="models-detail-title">
          <code>{model.class ?? model.model}</code>
        </h3>
        {model.logical_database !== undefined && (
          <span className="models-db-chip">db{model.logical_database}</span>
        )}
        {model.key_pattern && (
          <code className="models-keypattern">{model.key_pattern}</code>
        )}
        <span className="model-head-actions">
          <button
            type="button"
            data-testid="models-browse-records"
            onClick={() => {
              window.location.hash = '#/records'
            }}
          >
            Browse records
          </button>
          <button
            type="button"
            data-testid="models-integrity-check"
            onClick={() => {
              window.location.hash = '#/integrity'
            }}
          >
            Integrity check
          </button>
        </span>
      </div>

      <nav className="model-tabs" data-testid="models-tabs" aria-label="Model sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? 'model-tab model-tab--active' : 'model-tab'}
            data-testid={`models-tab-${t.id}`}
            aria-current={t.id === tab ? 'true' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && <span className="model-tab-count">{t.count}</span>}
          </button>
        ))}
      </nav>

      <div className="model-tabpanel" data-testid={`models-panel-${tab}`}>
        {tab === 'overview' && <OverviewTab model={model} />}
        {tab === 'fields' && <FieldsTab fields={fields} />}
        {tab === 'datatypes' && <DatatypesTab declared={declared} internals={internals} />}
        {tab === 'indexes' && <IndexesTab indexes={indexes} />}
        {tab === 'participations' && <ParticipationsTab participations={participations} />}
        {tab === 'descriptor' && <DescriptorTab model={model} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Section(props: {
  title: string
  testid?: string
  children: React.ReactNode
}): React.JSX.Element {
  const { title, testid, children } = props
  return (
    <section className="model-section" data-testid={testid}>
      <h4 className="model-section-title">{title}</h4>
      {children}
    </section>
  )
}

function NoneDeclared(props: { children: React.ReactNode }): React.JSX.Element {
  return <p className="models-none">{props.children}</p>
}

function Chip(props: { children: React.ReactNode; tone?: string }): React.JSX.Element {
  const className = props.tone ? `models-chip models-chip--${props.tone}` : 'models-chip'
  return <span className={className}>{props.children}</span>
}

// ---------------------------------------------------------------------------

function OverviewTab(props: { model: ModelDescriptor }): React.JSX.Element {
  const { model } = props
  const exp = model.expiration
  const safeDump = model.safe_dump_fields ?? []
  const actions = model.actions ?? []
  const dangerous = new Set(['destroy', 'reveal'])

  const facts: { label: string; value: string }[] = [
    { label: 'Class', value: model.class ?? '—' },
    { label: 'Identifier field', value: model.identifier_field ?? '—' },
    {
      label: 'Logical database',
      value: model.logical_database !== undefined ? `db${model.logical_database}` : 'db0',
    },
    {
      label: 'Expiration',
      value: expirationLabel(model),
    },
  ]
  if (exp?.default_seconds !== undefined && exp.default_seconds !== null) {
    facts.push({ label: 'Default seconds', value: String(exp.default_seconds) })
  }

  return (
    <div className="model-overview">
      <Section title="Definition" testid="models-overview-definition">
        <dl className="model-facts">
          {facts.map((f) => (
            <div key={f.label} className="model-fact">
              <dt>{f.label}</dt>
              <dd className="cell-mono">{f.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title={`Safe-dump fields · ${safeDump.length}`} testid="models-overview-safedump">
        {safeDump.length === 0 ? (
          <NoneDeclared>
            No safe-dump allowlist — nothing is client-serialized by default.
          </NoneDeclared>
        ) : (
          <>
            <div className="models-chiprow">
              {safeDump.map((f) => (
                <Chip key={f}>{f}</Chip>
              ))}
            </div>
            <p className="models-subtle">
              Only these fields cross the wire to clients. Encrypted and transient
              fields are never in the allowlist.
            </p>
          </>
        )}
      </Section>

      <Section title={`Actions · ${actions.length}`} testid="models-overview-actions">
        {actions.length === 0 ? (
          <NoneDeclared>No actions declared for this model.</NoneDeclared>
        ) : (
          <div className="models-chiprow">
            {actions.map((a) => (
              <Chip key={a} tone={dangerous.has(a) ? 'broken' : undefined}>
                {a}
              </Chip>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------------------

function FieldsTab(props: { fields: FieldDescriptor[] }): React.JSX.Element {
  const { fields } = props
  if (fields.length === 0) {
    return (
      <NoneDeclared>
        No fields declared — reflection surfaced no schema for this model.
      </NoneDeclared>
    )
  }
  return (
    <table className="data-table" data-testid="models-fields-table">
      <thead>
        <tr>
          <th scope="col">field</th>
          <th scope="col">category</th>
          <th scope="col">persisted</th>
          <th scope="col">client_visible</th>
          <th scope="col">display</th>
          <th scope="col">json_schema</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => {
          const category = fieldCategory(f)
          const tone =
            category === 'encrypted'
              ? 'caution'
              : category === 'transient'
                ? 'broken'
                : category === 'identifier'
                  ? 'preview'
                  : undefined
          const summary = schemaSummary(fieldSchema(f))
          return (
            <tr key={f.name} data-testid={`models-field-${f.name}`}>
              <td className="cell-mono">
                {f.name}
                {f.identifier && <span className="models-id-marker"> ▪</span>}
              </td>
              <td>
                <Chip tone={tone}>{category}</Chip>
              </td>
              <td className="cell-mono">{f.persisted === false ? '—' : '✓'}</td>
              <td className="cell-mono">
                {f.client_visible === false ? 'no' : f.client_visible === true ? 'yes' : '—'}
              </td>
              <td className="cell-mono models-muted">{f.display ?? '—'}</td>
              <td className="cell-mono models-muted">{summary ?? '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------

function DatatypeRows(props: {
  datatypes: DatatypeDescriptor[]
  testid: string
}): React.JSX.Element {
  const { datatypes, testid } = props
  return (
    <table className="data-table" data-testid={testid}>
      <thead>
        <tr>
          <th scope="col">name</th>
          <th scope="col">type</th>
          <th scope="col">scope</th>
          <th scope="col">semantics</th>
        </tr>
      </thead>
      <tbody>
        {datatypes.map((dt) => (
          <tr key={dt.name} data-testid={`models-datatype-${dt.name}`}>
            <td className="cell-mono">{dt.name}</td>
            <td>
              <Chip>{dt.type ?? 'unknown'}</Chip>
            </td>
            <td>
              <Chip tone={dt.scope === 'instance' ? 'healthy' : undefined}>
                {dt.scope ?? '—'}
              </Chip>
            </td>
            <td className="models-subtle">{datatypeBlurb(dt.type)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DatatypesTab(props: {
  declared: DatatypeDescriptor[]
  internals: DatatypeDescriptor[]
}): React.JSX.Element {
  const { declared, internals } = props
  return (
    <div className="model-datatypes">
      <Section title={`Datatypes · ${declared.length}`} testid="models-datatypes-declared">
        {declared.length === 0 ? (
          <NoneDeclared>No datatypes declared — this model attaches no collections.</NoneDeclared>
        ) : (
          <DatatypeRows datatypes={declared} testid="models-datatypes-table" />
        )}
      </Section>
      {internals.length > 0 && (
        <Section
          title={`Index internals · ${internals.length}`}
          testid="models-datatypes-internals"
        >
          <p className="models-subtle">
            These class-scoped structures back unique/multi indexes (a unique index
            is itself a hashkey). Reflection surfaces them; they are not
            developer-declared collections.
          </p>
          <DatatypeRows datatypes={internals} testid="models-internals-table" />
        </Section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function IndexesTab(props: { indexes: IndexDescriptor[] }): React.JSX.Element {
  const { indexes } = props
  if (indexes.length === 0) {
    return <NoneDeclared>No indexes declared for this model.</NoneDeclared>
  }
  return (
    <table className="data-table" data-testid="models-indexes-table">
      <thead>
        <tr>
          <th scope="col">index_name</th>
          <th scope="col">field</th>
          <th scope="col">cardinality</th>
          <th scope="col">queryable</th>
          <th scope="col">coordinate</th>
        </tr>
      </thead>
      <tbody>
        {indexes.map((ix) => (
          <tr key={ix.index_name} data-testid={`models-index-${ix.index_name}`}>
            <td className="cell-mono">{ix.index_name}</td>
            <td className="cell-mono models-muted">{ix.field ?? '—'}</td>
            <td>
              <Chip tone={ix.cardinality === 'unique' ? 'healthy' : undefined}>
                {ix.cardinality ?? '—'}
              </Chip>
            </td>
            <td className="cell-mono">
              {ix.queryable === true ? 'yes' : ix.queryable === false ? 'no' : '—'}
            </td>
            <td className="cell-mono models-muted">{ix.coordinate ?? ix.index_name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------

function ParticipationsTab(props: {
  participations: ParticipationDescriptor[]
}): React.JSX.Element {
  const { participations } = props
  if (participations.length === 0) {
    return (
      <NoneDeclared>This model does not participate in any parent collection.</NoneDeclared>
    )
  }
  return (
    <table className="data-table" data-testid="models-participations-table">
      <thead>
        <tr>
          <th scope="col">collection</th>
          <th scope="col">type</th>
          <th scope="col">target</th>
          <th scope="col">scored</th>
          <th scope="col">through</th>
        </tr>
      </thead>
      <tbody>
        {participations.map((p, i) => (
          <tr key={p.collection ?? i} data-testid="models-participation-row">
            <td className="cell-mono">{p.collection ?? '—'}</td>
            <td>
              <Chip>{p.type ?? '—'}</Chip>
            </td>
            <td className="cell-mono models-muted">{p.target ?? '—'}</td>
            <td className="cell-mono">{p.scored === true ? '✓' : '—'}</td>
            <td className="cell-mono models-muted">{p.through ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------

function DescriptorTab(props: { model: ModelDescriptor }): React.JSX.Element {
  const { model } = props
  return (
    <div className="model-descriptor">
      <p className="models-subtle">
        The raw reflection contract for this model — <code>/_meta</code> →{' '}
        models[{model.model}]. The descriptor is the hero: this is exactly what the
        UI builds itself from.
      </p>
      <pre className="model-json" data-testid="models-descriptor-json">
        {JSON.stringify(model, null, 2)}
      </pre>
      {model.json_schema !== undefined && (
        <>
          <h4 className="model-section-title">model json_schema</h4>
          <pre className="model-json" data-testid="models-descriptor-schema">
            {JSON.stringify(model.json_schema, null, 2)}
          </pre>
        </>
      )}
    </div>
  )
}
