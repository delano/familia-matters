/* models/ModelDetail.jsx — full descriptor reflection for one model.
 * Tabs: Overview · Fields · DataTypes · Indexes · Participations · Descriptor.
 * Everything is read off the descriptor; the Descriptor tab shows the raw JSON
 * (the admin's "hero" is the contract itself). Cross-links jump to that model's
 * records and to the integrity console. Exports window.ModelDetail. */
const MD_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Badge: MDBadge, StatusDot: MDDot, Mono: MDMono, FieldChip: MDChip, Tabs: MDTabs, Button: MDBtn } = MD_DS;
const { Eyebrow: MDEyebrow, fmtTime: MDfmt } = window.RLIB;

const DT_BLURB = {
  list: 'Ordered · duplicates allowed · LPUSH / RPUSH',
  set: 'Unique members · unordered · SADD / SREM',
  sorted_set: 'Member + score · ordered by score · ZADD',
  hashkey: 'Field → value map · HSET / HDEL',
  counter: 'Atomic integer · INCRBY / DECRBY',
};
const DT_ICON = { list: 'list', set: 'tag', sorted_set: 'globe', hashkey: 'braces', counter: 'sigma' };
const DANGER_ACTIONS = ['destroy', 'reveal'];

function schemaSummary(schema) {
  if (!schema) return null;
  const bits = [];
  if (schema.type) bits.push(schema.type);
  if (schema.format) bits.push(`format: ${schema.format}`);
  if (schema.enum) bits.push(`enum: ${schema.enum.join(' | ')}`);
  if (schema.minLength != null) bits.push(`min ${schema.minLength}`);
  if (schema.maxLength != null) bits.push(`max ${schema.maxLength}`);
  if (schema.default != null) bits.push(`default ${schema.default}`);
  return bits.join(' · ');
}
function ttlLabel(exp) {
  if (!exp || exp.policy !== 'ttl') return 'none';
  const d = Math.floor(exp.default_seconds / 86400);
  return d >= 1 ? `${d}d` : `${Math.floor(exp.default_seconds / 3600)}h`;
}

/* A bordered surface section with a header bar — mirrors the integrity console. */
function Section({ title, right, children, pad = true }) {
  return (
    <div style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', overflow: 'hidden' }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 14px', background: 'var(--admin-surface-sunken)', borderBottom: '1px solid var(--admin-border-color)' }}>
          <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>{title}</MDEyebrow>
          {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
        </div>
      )}
      <div style={pad ? { padding: 14 } : undefined}>{children}</div>
    </div>
  );
}

/* Dense rows with a left rule, matching the audit-component body rows. */
function Rows({ children }) {
  return <div style={{ border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>{children}</div>;
}
function Row({ cols, children, head }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '0 12px', minHeight: head ? 30 : 38, borderTop: head ? 'none' : '1px solid var(--admin-border-color)', background: head ? 'var(--admin-surface-sunken)' : 'transparent' }}>
      {children}
    </div>
  );
}

function Pill({ children, tone }) {
  const color = tone ? `var(--admin-status-${tone})` : 'var(--admin-text-muted)';
  const bg = tone ? `var(--admin-status-${tone}-bg)` : 'var(--admin-surface-sunken)';
  const bd = tone ? `var(--admin-status-${tone})40` : 'var(--admin-border-color)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 10px', background: bg, border: `1px solid ${bd}`, borderRadius: 9999, fontFamily: 'var(--admin-mono)', fontSize: 11, color }}>
      {children}
    </span>
  );
}

function ModelDetail({ model, count, onBack, onNav }) {
  const RI = window.RICONS;
  const [tab, setTab] = React.useState('overview');
  const participations = model.participations || [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'fields', label: 'Fields', count: model.fields.length },
    { id: 'datatypes', label: 'DataTypes', count: model.datatypes.length },
    { id: 'indexes', label: 'Indexes', count: model.indexes.length },
    { id: 'participations', label: 'Participations', count: participations.length },
    { id: 'descriptor', label: 'Descriptor' },
  ];

  const facts = [
    { label: 'Class', value: model.class },
    { label: 'Identifier field', value: model.identifier_field },
    { label: 'Logical database', value: `db${model.logical_database != null ? model.logical_database : 0}` },
    { label: 'Expiration', value: model.expiration && model.expiration.policy === 'ttl' ? `ttl · ${ttlLabel(model.expiration)}` : 'none' },
  ];

  return (
    <div style={{ position: 'relative', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 96px', display: 'grid', gap: 16 }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 12 }}>
          <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'start', background: 'transparent', border: 'none', color: 'var(--admin-text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0 }}>
            <RI.arrowLeft size={13} /> All models
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><RI.layers size={18} /></span>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', fontFamily: 'var(--admin-mono)' }}>{model.class}</h1>
                <MDBadge tone="neutral" uppercase>db{model.logical_database != null ? model.logical_database : 0}</MDBadge>
                <MDDot status="healthy" label="Registered" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}><MDEyebrow>Key</MDEyebrow><MDMono size="sm" muted>{model.key_pattern}</MDMono></span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}><MDEyebrow>Records</MDEyebrow><MDMono size="sm">{count != null ? count.toLocaleString() : '—'}</MDMono></span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MDBtn variant="secondary" size="md" iconLeft={<RI.table />} onClick={() => onNav('records', model.model)}>Browse records</MDBtn>
              <MDBtn variant="secondary" size="md" iconLeft={<RI.shield />} onClick={() => onNav('integrity', model.model)}>Integrity check</MDBtn>
            </div>
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <MDTabs activeId={tab} onChange={setTab} tabs={tabs} />

        {/* ── Overview ───────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <Section title="Definition">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1, background: 'var(--admin-border-color)', border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
                {facts.map((f) => (
                  <div key={f.label} style={{ background: 'var(--admin-bg)', padding: '10px 12px', display: 'grid', gap: 4 }}>
                    <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>{f.label}</MDEyebrow>
                    <MDMono size="md">{f.value}</MDMono>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={`Safe-dump fields · ${(model.safe_dump_fields || []).length}`}>
              {(model.safe_dump_fields || []).length === 0
                ? <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>No safe-dump allowlist — nothing is client-serialized by default.</span>
                : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {model.safe_dump_fields.map((f) => <Pill key={f}>{f}</Pill>)}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>Only these fields cross the wire to clients. Encrypted and transient fields are never in the allowlist.</span>
                  </div>
                )}
            </Section>

            <Section title={`Actions · ${(model.actions || []).length}`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(model.actions || []).map((a) => (
                  <Pill key={a} tone={DANGER_ACTIONS.includes(a) ? 'broken' : null}>{a}</Pill>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* ── Fields ─────────────────────────────────────────────────────── */}
        {tab === 'fields' && (
          <Section title={`Fields · ${model.fields.length}`} pad={false}>
            <div style={{ padding: 12 }}>
              <Rows>
                <Row cols="150px 1fr 84px 1fr" head>
                  <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Field</MDEyebrow>
                  <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Category</MDEyebrow>
                  <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Persisted</MDEyebrow>
                  <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Schema / client value</MDEyebrow>
                </Row>
                {model.fields.map((f) => {
                  const cat = f.identifier ? 'identifier' : f.category;
                  const display = f.display || (f.category === 'field' ? '(raw)' : null);
                  const schema = schemaSummary(f.json_schema);
                  return (
                    <Row key={f.name} cols="150px 1fr 84px 1fr">
                      <MDMono size="sm">{f.name}</MDMono>
                      <span><MDChip category={cat} /></span>
                      <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: f.persisted ? 'var(--admin-status-healthy)' : 'var(--admin-text-subtle)' }}>{f.persisted ? '✓' : '—'}</span>
                      <span style={{ minWidth: 0 }}>
                        {schema && <div style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)' }}>{schema}</div>}
                        {display && <div style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: f.category === 'field' ? 'var(--admin-text-subtle)' : 'var(--admin-status-caution)' }}>{display}</div>}
                        {!schema && !display && <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>—</span>}
                      </span>
                    </Row>
                  );
                })}
              </Rows>
            </div>
          </Section>
        )}

        {/* ── DataTypes ──────────────────────────────────────────────────── */}
        {tab === 'datatypes' && (
          <Section title={`DataTypes · ${model.datatypes.length}`} pad={false}>
            <div style={{ padding: 12 }}>
              {model.datatypes.length === 0
                ? <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>No attached DataTypes.</span>
                : (
                  <Rows>
                    {model.datatypes.map((dt) => {
                      const Icon = RI[DT_ICON[dt.type]] || RI.braces;
                      return (
                        <Row key={dt.name} cols="24px 1fr 110px 100px 1.4fr">
                          <span style={{ color: 'var(--admin-text-subtle)', display: 'flex' }}><Icon size={14} /></span>
                          <MDMono size="sm">{dt.name}</MDMono>
                          <span><MDBadge tone="neutral" uppercase>{dt.type}</MDBadge></span>
                          <span><MDBadge tone="neutral">{dt.scope}</MDBadge></span>
                          <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{DT_BLURB[dt.type] || ''}</span>
                        </Row>
                      );
                    })}
                  </Rows>
                )}
            </div>
          </Section>
        )}

        {/* ── Indexes ────────────────────────────────────────────────────── */}
        {tab === 'indexes' && (
          <Section title={`Indexes · ${model.indexes.length}`} pad={false}>
            <div style={{ padding: 12 }}>
              {model.indexes.length === 0
                ? <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>No indexes defined.</span>
                : (
                  <Rows>
                    <Row cols="1fr 120px 100px 100px 1.2fr" head>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Index</MDEyebrow>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Field</MDEyebrow>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Cardinality</MDEyebrow>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Queryable</MDEyebrow>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Coordinate</MDEyebrow>
                    </Row>
                    {model.indexes.map((ix) => (
                      <Row key={ix.index_name} cols="1fr 120px 100px 100px 1.2fr">
                        <MDMono size="sm">{ix.index_name}</MDMono>
                        <MDMono size="sm" muted>{ix.field}</MDMono>
                        <span><MDBadge tone={ix.cardinality === 'unique' ? 'healthy' : 'neutral'} uppercase>{ix.cardinality}</MDBadge></span>
                        <span>{ix.queryable ? <MDDot status="healthy" label="yes" /> : <MDDot status="caution" label="no" />}</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <MDMono size="sm" muted>{ix.coordinate || ix.index_name}</MDMono>
                          {ix.logical_database != null && <MDBadge tone="neutral" uppercase>db{ix.logical_database}</MDBadge>}
                        </span>
                      </Row>
                    ))}
                  </Rows>
                )}
            </div>
          </Section>
        )}

        {/* ── Participations ─────────────────────────────────────────────── */}
        {tab === 'participations' && (
          <Section title={`Participations · ${participations.length}`} pad={false}>
            <div style={{ padding: 12 }}>
              {participations.length === 0
                ? <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>This model does not participate in any parent collection.</span>
                : (
                  <Rows>
                    <Row cols="1fr 110px 1fr 90px 80px" head>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Collection</MDEyebrow>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Type</MDEyebrow>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Target</MDEyebrow>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Scored</MDEyebrow>
                      <MDEyebrow style={{ color: 'var(--admin-text-muted)' }}>DB</MDEyebrow>
                    </Row>
                    {participations.map((p, i) => (
                      <Row key={i} cols="1fr 110px 1fr 90px 80px">
                        <MDMono size="sm">{p.collection}</MDMono>
                        <span><MDBadge tone="neutral" uppercase>{p.type}</MDBadge></span>
                        <MDMono size="sm" muted>{p.target}</MDMono>
                        <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: p.scored ? 'var(--admin-status-healthy)' : 'var(--admin-text-subtle)' }}>{p.scored ? '✓' : '—'}</span>
                        <span>{p.logical_database != null ? <MDBadge tone="neutral" uppercase>db{p.logical_database}</MDBadge> : <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>—</span>}</span>
                      </Row>
                    ))}
                  </Rows>
                )}
            </div>
          </Section>
        )}

        {/* ── Descriptor (raw JSON) ──────────────────────────────────────── */}
        {tab === 'descriptor' && (
          <Section title="Descriptor · reflection contract" pad={false}
            right={<MDMono size="sm" muted>meta → models[{model.class}]</MDMono>}>
            <pre style={{ margin: 0, padding: 16, fontFamily: 'var(--admin-mono)', fontSize: 12, lineHeight: 1.5, color: 'var(--admin-text)', background: 'var(--admin-bg)', overflowX: 'auto', whiteSpace: 'pre' }}>
              {JSON.stringify(model, null, 2)}
            </pre>
          </Section>
        )}
      </div>
    </div>
  );
}

window.ModelDetail = ModelDetail;
