// src/screens/integrity/IssueSections.tsx
//
// The five audit-component sections (Instances, Unique indexes, Multi indexes,
// Participations, Cross-references), each a collapsible card whose count and
// rows derive straight from the HealthReport arrays — no seed, no fabrication.
// A component with zero drift renders an explicit "clean" line rather than an
// empty table. The instances section also shows the count reconciliation
// (count_timeline, O(1) and phantom-inflated, vs count_scan, authoritative).

import type React from 'react'
import { useState } from 'react'

import type { HealthReport } from './api'
import {
  crossReferenceCount,
  instancesCount,
  multiIndexCount,
  participationsCount,
  uniqueIndexCount,
  type Tone,
} from './report'

interface SectionDef {
  id: string
  title: string
  subtitle?: string
  count: number
  tone: Tone
  body: React.JSX.Element
}

interface IssueSectionsProps {
  report: HealthReport
}

export function IssueSections(props: IssueSectionsProps): React.JSX.Element {
  const { report } = props
  const instances = report.instances ?? {}

  const sections: SectionDef[] = [
    {
      id: 'instances',
      title: 'Instances',
      count: instancesCount(report),
      tone: 'broken',
      body: <InstancesBody instances={instances} />,
    },
    {
      id: 'unique_indexes',
      title: 'Unique indexes',
      count: uniqueIndexCount(report),
      tone: 'caution',
      body: <UniqueIndexBody indexes={report.unique_indexes ?? []} />,
    },
    {
      id: 'multi_indexes',
      title: 'Multi indexes',
      count: multiIndexCount(report),
      tone: 'caution',
      body: <MultiIndexBody indexes={report.multi_indexes ?? []} />,
    },
    {
      id: 'participations',
      title: 'Participations',
      count: participationsCount(report),
      tone: 'caution',
      body: <ParticipationsBody participations={report.participations ?? []} />,
    },
    {
      id: 'cross_references',
      title: 'Cross-references',
      count: crossReferenceCount(report),
      tone: 'broken',
      body: <CrossRefBody cross={report.cross_references ?? {}} />,
    },
  ]

  return (
    <div className="integrity-sections" data-testid="integrity-sections">
      <div className="integrity-section-label">Audit components</div>
      {sections.map((s) => (
        <IssueSection key={s.id} def={s} />
      ))}
    </div>
  )
}

function IssueSection(props: { def: SectionDef }): React.JSX.Element {
  const { def } = props
  const clean = def.count === 0
  // Default-open the sections that carry drift.
  const [open, setOpen] = useState(!clean)

  return (
    <section
      className="integrity-section"
      data-testid={`integrity-section-${def.id}`}
      data-section-clean={clean}
    >
      <button
        type="button"
        className="integrity-section-head"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="integrity-section-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="integrity-section-title">{def.title}</span>
        {def.subtitle && <code className="integrity-section-subtitle">{def.subtitle}</code>}
        <span className="integrity-section-status">
          {clean ? (
            <span className="integrity-badge integrity-badge-healthy">Clean</span>
          ) : (
            <span
              className={`integrity-badge integrity-badge-${def.tone}`}
              data-testid={`integrity-count-${def.id}`}
            >
              {def.count} {def.count === 1 ? 'issue' : 'issues'}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="integrity-section-body">
          {clean ? (
            <p className="integrity-clean-note">No issues found in this component.</p>
          ) : (
            def.body
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

function SevDot(props: { tone: Tone }): React.JSX.Element {
  return <span className={`integrity-dot integrity-dot-${props.tone}`} aria-hidden="true" />
}

interface Row {
  key: string
  tone: Tone
  cells: React.ReactNode[]
}

function MiniTable(props: { headers: string[]; rows: Row[] }): React.JSX.Element {
  const { headers, rows } = props
  return (
    <table className="data-table integrity-table">
      <thead>
        <tr>
          <th scope="col" aria-label="Severity" />
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>
              <SevDot tone={r.tone} />
            </td>
            {r.cells.map((c, i) => (
              <td key={i}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function InstancesBody(props: { instances: NonNullable<HealthReport['instances']> }): React.JSX.Element {
  const { instances } = props
  const timeline = instances.count_timeline
  const scan = instances.count_scan
  const mismatch =
    typeof timeline === 'number' && typeof scan === 'number' && timeline !== scan
      ? timeline - scan
      : null

  const rows: Row[] = [
    ...(instances.phantoms ?? []).map((id) => ({
      key: `p:${id}`,
      tone: 'broken' as Tone,
      cells: [
        <code key="k">{id}</code>,
        'phantom',
        'Key exists in timeline, no object on SCAN',
      ],
    })),
    ...(instances.missing ?? []).map((id) => ({
      key: `m:${id}`,
      tone: 'broken' as Tone,
      cells: [
        <code key="k">{id}</code>,
        'missing',
        'Object present, absent from instances index',
      ],
    })),
  ]

  return (
    <div className="integrity-body">
      <div className="integrity-count-recon" data-testid="integrity-count-recon">
        <span className="integrity-count-pair">
          <span className="integrity-count-label">timeline (O(1))</span>
          <code data-testid="integrity-count-timeline">{timeline ?? '—'}</code>
          <span className="integrity-count-sep">vs</span>
          <span className="integrity-count-label">scan (authoritative)</span>
          <code data-testid="integrity-count-scan">{scan ?? '—'}</code>
        </span>
        {mismatch !== null && mismatch !== 0 && (
          <span className="integrity-count-note">
            timeline count is inflated by {Math.abs(mismatch)} phantom
            {Math.abs(mismatch) === 1 ? '' : 's'} (may include phantoms).
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <MiniTable headers={['Identifier', 'Kind', 'Detail']} rows={rows} />
      )}
    </div>
  )
}

function UniqueIndexBody(props: {
  indexes: NonNullable<HealthReport['unique_indexes']>
}): React.JSX.Element {
  const rows: Row[] = props.indexes.flatMap((ix) => [
    ...(ix.stale ?? []).map((v) => ({
      key: `s:${ix.index_name}:${v}`,
      tone: 'caution' as Tone,
      cells: [<code key="i">{ix.index_name}</code>, 'stale', <code key="v">{v}</code>, 'Entry resolves to a removed identifier'],
    })),
    ...(ix.missing ?? []).map((v) => ({
      key: `m:${ix.index_name}:${v}`,
      tone: 'broken' as Tone,
      cells: [<code key="i">{ix.index_name}</code>, 'missing', <code key="v">{v}</code>, 'Live field value has no index entry'],
    })),
  ])
  return <MiniTable headers={['Index', 'State', 'Field value', 'Detail']} rows={rows} />
}

function MultiIndexBody(props: {
  indexes: NonNullable<HealthReport['multi_indexes']>
}): React.JSX.Element {
  const rows: Row[] = props.indexes.flatMap((ix) => [
    ...(ix.stale_members ?? []).map((m) => ({
      key: `sm:${ix.index_name}:${m}`,
      tone: 'caution' as Tone,
      cells: [<code key="i">{ix.index_name}</code>, 'stale member', <code key="v">{m}</code>, 'Member points to a missing record'],
    })),
    ...(ix.orphaned_keys ?? []).map((k) => ({
      key: `ok:${ix.index_name}:${k}`,
      tone: 'broken' as Tone,
      cells: [<code key="i">{ix.index_name}</code>, 'orphaned key', <code key="v">{k}</code>, 'Index key with no live definition'],
    })),
  ])
  return <MiniTable headers={['Index', 'Kind', 'Key / member', 'Detail']} rows={rows} />
}

function ParticipationsBody(props: {
  participations: NonNullable<HealthReport['participations']>
}): React.JSX.Element {
  const rows: Row[] = props.participations.flatMap((p) =>
    (p.stale_members ?? []).map((m) => ({
      key: `pp:${p.collection_name}:${m.identifier}`,
      tone: 'caution' as Tone,
      cells: [
        <code key="c">{p.collection_name}</code>,
        <code key="m">{m.identifier}</code>,
        <code key="ck">{m.collection_key}</code>,
        (m.reason ?? '').replace(/_/g, ' '),
      ],
    })),
  )
  return <MiniTable headers={['Collection', 'Member', 'Collection key', 'Reason']} rows={rows} />
}

function CrossRefBody(props: {
  cross: NonNullable<HealthReport['cross_references']>
}): React.JSX.Element {
  const { cross } = props
  const missing = cross.in_instances_missing_unique_index ?? []
  const wrong = cross.index_points_to_wrong_identifier ?? []

  const missingRows: Row[] = missing.map((id) => ({
    key: `cm:${id}`,
    tone: 'broken' as Tone,
    cells: [<code key="i">{id}</code>, 'In instances index but absent from its unique index'],
  }))

  return (
    <div className="integrity-body">
      {missing.length > 0 && (
        <div>
          <div className="integrity-subhead">In instances, missing unique index</div>
          <MiniTable headers={['Identifier', 'Detail']} rows={missingRows} />
        </div>
      )}
      {wrong.length > 0 && (
        <div>
          <div className="integrity-subhead">Index points to wrong identifier</div>
          <div className="integrity-wrong-list">
            {wrong.map((w, i) => (
              <div key={i} className="integrity-wrong-row">
                <div className="integrity-wrong-head">
                  <SevDot tone="broken" />
                  <code>{w.index}</code>
                  <span className="integrity-count-sep">field value</span>
                  <code>{w.field_value}</code>
                </div>
                <div className="integrity-wrong-pointers">
                  <div className="integrity-pointer integrity-pointer-broken">
                    <span className="integrity-pointer-label">Points to</span>
                    <code className="integrity-pointer-struck">{w.points_to}</code>
                  </div>
                  <span className="integrity-pointer-arrow" aria-hidden="true">
                    →
                  </span>
                  <div className="integrity-pointer integrity-pointer-healthy">
                    <span className="integrity-pointer-label">Actual</span>
                    <code>{w.actual}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
