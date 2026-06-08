/* records/RecordDetail.jsx — Customer record detail + edit.
 * Typed field editors, [CONCEALED] encrypted field with a gated/audited reveal,
 * transient field shown as absent, atomic multi-field save with a diff preview,
 * and the attached-collection panels. Exports window.RecordDetail. */
const RD_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Button: RDBtn, Badge: RDBadge, StatusDot: RDDot, Mono: RDMono, FieldChip: RDChip, Select: RDSelect, Input: RDInput, Tabs: RDTabs, DryRunConfirm: RDDryRun, Banner: RDBanner } = RD_DS;
const { Eyebrow: RDEyebrow, DualTime: RDDualTime, fmtTime: RDfmt, useToast: RDtoast } = window.RLIB;

const RD_STATUS_TONE = { active: 'healthy', pending: 'preview', inactive: 'neutral' };
const RD_STATUS_OPTS = [{ value: 'active' }, { value: 'inactive' }, { value: 'pending' }];

function copy(text, toast) {
  try { navigator.clipboard.writeText(text); } catch (e) { /* noop */ }
  toast({ tone: 'preview', title: 'Copied to clipboard', detail: text, mono: true });
}

/* ── A single field row ───────────────────────────────────────────────────── */
function FieldRow({ field, value, editing, draft, onChange, children, validity }) {
  const invalid = validity && validity.ok === false;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, alignItems: 'start', padding: '11px 14px', borderTop: '1px solid var(--admin-border-color)' }}>
      <div style={{ display: 'grid', gap: 5, paddingTop: 3 }}>
        <RDMono size="md">{field.name}</RDMono>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <RDChip category={field.category} />
          {field.identifier && <RDBadge tone="neutral" uppercase>identifier</RDBadge>}
          {field.readonly && <RDBadge tone="neutral" uppercase>system</RDBadge>}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        {children}
        {invalid && <span style={{ fontSize: 11, color: 'var(--admin-status-broken)' }}>{validity.msg}</span>}
        {!invalid && field.json_schema && editing && <SchemaHint schema={field.json_schema} />}
      </div>
    </div>
  );
}

function SchemaHint({ schema }) {
  const bits = [];
  if (schema.format) bits.push(`format: ${schema.format}`);
  if (schema.enum) bits.push(`enum: ${schema.enum.join(' | ')}`);
  if (schema.minLength != null) bits.push(`min ${schema.minLength}`);
  if (schema.maxLength != null) bits.push(`max ${schema.maxLength}`);
  if (schema.type) bits.unshift(schema.type);
  return <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 10, color: 'var(--admin-text-subtle)' }}>{bits.join(' · ')}</span>;
}

/* ── Encrypted field with gated reveal ────────────────────────────────────── */
function EncryptedField({ field, custid, autoReveal }) {
  const RI = window.RICONS;
  const toast = RDtoast();
  const [stage, setStage] = React.useState('concealed'); // concealed | confirm | revealed
  const [plaintext, setPlaintext] = React.useState(null);
  const [audit, setAudit] = React.useState(null);

  React.useEffect(() => { if (autoReveal) setStage('confirm'); }, [autoReveal]);

  const [revealing, setRevealing] = React.useState(false);
  const doReveal = async () => {
    setRevealing(true);
    const res = await window.RSTORE.reveal(custid, field.name);
    setRevealing(false);
    setPlaintext(res.plaintext);
    setAudit(res.audit);
    setStage('revealed');
    toast({ tone: 'preview', title: 'Reveal logged', detail: `records.reveal · actor admin_42 · ${field.name}${res.offline ? ' · simulated' : ''}`, mono: true });
  };

  if (stage === 'revealed') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 10px', background: 'var(--admin-bg)', border: '1px solid var(--admin-border-strong)', borderRadius: 'var(--admin-radius-sm)' }}>
            <RDMono size="md">{plaintext}</RDMono>
          </span>
          <RDBtn variant="secondary" size="md" iconLeft={<RI.copy />} onClick={() => copy(plaintext, toast)}>Copy</RDBtn>
          <RDBtn variant="ghost" size="md" iconLeft={<RI.eyeOff />} onClick={() => { setStage('concealed'); setPlaintext(null); }}>Conceal</RDBtn>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--admin-status-preview-bg)', border: '1px solid var(--admin-status-preview)40', borderLeft: '3px solid var(--admin-status-preview)', borderRadius: 'var(--admin-radius-sm)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'var(--admin-status-preview)', flex: 'none' }} />
          <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
            Returned once and written to the audit trail —{' '}
            <RDMono size="sm">reveal · actor=admin_42 · {RDfmt(audit.at)}</RDMono>. Re-reading requires a new reveal.
          </span>
        </div>
      </div>
    );
  }

  if (stage === 'confirm') {
    return (
      <div style={{ display: 'grid', gap: 10, padding: '10px 12px', background: 'var(--admin-surface-sunken)', border: '1px solid var(--admin-status-caution)', borderRadius: 'var(--admin-radius-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ color: 'var(--admin-status-caution)', display: 'flex', marginTop: 1 }}><RI.lock size={14} /></span>
          <div style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>
            <span style={{ color: 'var(--admin-text)', fontWeight: 600 }}>Reveal {field.name}?</span> Elevated + audited.
            Returns the plaintext <strong style={{ color: 'var(--admin-text)' }}>once</strong> and writes a reveal entry to the audit trail.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <RDBtn variant="secondary" size="md" onClick={() => setStage('concealed')} disabled={revealing}>Cancel</RDBtn>
          <RDBtn variant="primary" size="md" iconLeft={<RI.eye />} loading={revealing} onClick={doReveal}>Reveal once</RDBtn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <RDChip category="encrypted" />
      <RDBtn variant="secondary" size="md" iconLeft={<RI.eye />} onClick={() => setStage('confirm')}>Reveal</RDBtn>
      <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>Encrypted at rest · never returned in list or safe-dump</span>
    </div>
  );
}

/* ── Validation per field ─────────────────────────────────────────────────── */
function validateField(field, v) {
  const s = field.json_schema || {};
  if (field.name === 'email') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { ok: false, msg: 'Must be a valid email (json_schema format: email).' };
  }
  if (s.minLength != null && v.length < s.minLength) return { ok: false, msg: `Minimum length ${s.minLength}.` };
  if (s.maxLength != null && v.length > s.maxLength) return { ok: false, msg: `Maximum length ${s.maxLength}.` };
  return { ok: true };
}

/* ── Save preview (atomic) ────────────────────────────────────────────────── */
function SavePreview({ changes, onCancel, onApply, busy }) {
  const RI = window.RICONS;
  return (
    <div style={{ border: '1px solid var(--admin-status-preview)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--admin-status-preview-bg)', borderBottom: '1px solid var(--admin-status-preview)40' }}>
        <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'var(--admin-status-preview)', flex: 'none' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Review changes — {changes.length} field{changes.length === 1 ? '' : 's'}</div>
          <div style={{ fontSize: 12, color: 'var(--admin-text-muted)', marginTop: 1 }}>Written as a single atomic HSET. Nothing is saved until you apply.</div>
        </div>
        <RDBadge tone="preview" uppercase>preview</RDBadge>
      </div>
      <div style={{ padding: 4 }}>
        {changes.map((c) => (
          <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'center', padding: '8px 12px' }}>
            <RDMono size="sm">{c.name}</RDMono>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-status-broken)', textDecoration: 'line-through', textDecorationColor: 'var(--admin-status-broken)', opacity: 0.85 }}>{String(c.from) || '∅'}</code>
              <span style={{ color: 'var(--admin-text-subtle)', display: 'flex' }}><RI.arrowRight size={13} /></span>
              <code style={{ fontFamily: 'var(--admin-mono)', fontSize: 12, color: 'var(--admin-status-healthy)' }}>{String(c.to) || '∅'}</code>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid var(--admin-border-color)' }}>
        <RDMono size="sm" muted>1 write · HSET customer:…:object · updated_at bumped</RDMono>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <RDBtn variant="secondary" size="md" onClick={onCancel} disabled={busy}>Cancel</RDBtn>
          <RDBtn variant="primary" size="md" iconLeft={<RI.save />} onClick={onApply} loading={busy}>Apply atomic save</RDBtn>
        </div>
      </div>
    </div>
  );
}

function RecordDetail({ custid, intent, onBack }) {
  const RI = window.RICONS;
  const toast = RDtoast();
  const model = window.REC.CUSTOMER;
  const base = React.useMemo(() => window.RSTORE.getLocal(custid) || window.REC.RECORDS.find((r) => r.custid === custid) || window.REC.RECORDS[0], [custid]);

  const [record, setRecord] = React.useState(base);
  React.useEffect(() => {
    setRecord(base);
    let alive = true;
    window.RSTORE.read(custid).then((res) => { if (alive && res.record) setRecord(res.record); });
    return () => { alive = false; };
  }, [base, custid]);

  const [editing, setEditing] = React.useState(intent === 'edit');
  const [draft, setDraft] = React.useState({});
  const [reviewing, setReviewing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState('fields');
  const [destroy, setDestroy] = React.useState(intent === 'destroy');

  const editable = model.fields.filter((f) => f.category === 'field' && !f.identifier && !f.readonly);

  const startEdit = () => { setDraft(Object.fromEntries(editable.map((f) => [f.name, record[f.name]]))); setEditing(true); setReviewing(false); };
  const cancelEdit = () => { setEditing(false); setReviewing(false); setDraft({}); };

  const changes = editable
    .map((f) => ({ name: f.name, from: record[f.name], to: draft[f.name] }))
    .filter((c) => String(c.from) !== String(c.to));

  const validities = Object.fromEntries(editable.map((f) => [f.name, editing ? validateField(f, String(draft[f.name] ?? '')) : { ok: true }]));
  const anyInvalid = Object.values(validities).some((v) => v.ok === false);

  const applySave = async () => {
    setBusy(true);
    const changeObj = Object.fromEntries(changes.map((c) => [c.name, c.to]));
    const res = await window.RSTORE.update(custid, changeObj);
    setRecord(res.record);
    setBusy(false); setEditing(false); setReviewing(false); setDraft({});
    toast({ tone: 'healthy', title: `Saved — ${changes.length} field${changes.length === 1 ? '' : 's'}`, detail: `records.update · atomic HSET · updated_at bumped${res.offline ? ' · simulated' : ''}`, mono: true });
  };

  const set = (name, v) => setDraft((d) => ({ ...d, [name]: v }));

  return (
    <div style={{ position: 'relative', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 96px', display: 'grid', gap: 16 }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 12 }}>
          <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'start', background: 'transparent', border: 'none', color: 'var(--admin-text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0 }}>
            <RI.arrowLeft size={13} /> All customer records
          </button>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--admin-accent)', display: 'flex' }}><RI.table size={18} /></span>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', fontFamily: 'var(--admin-mono)' }}>{record.custid}</h1>
                <RDDot status={RD_STATUS_TONE[record.status]} label={record.status} />
                {editing && <RDBadge tone="accent" uppercase>editing</RDBadge>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}><RDEyebrow>Key</RDEyebrow><RDMono size="sm" muted>customer:{record.custid}:object</RDMono></span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}><RDEyebrow>Updated</RDEyebrow><RDDualTime ts={record.updated_at} /></span>
                <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}><RDEyebrow>Logins</RDEyebrow><RDMono size="md">{window.REC.COLLECTIONS.login_count.value.toLocaleString()}</RDMono></span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!editing && model.actions.includes('update') && (
                <RDBtn variant="secondary" size="md" iconLeft={<RI.edit />} onClick={startEdit}>Edit</RDBtn>
              )}
              {!editing && model.actions.includes('destroy') && (
                <RDBtn variant="secondary" size="md" iconLeft={<RI.trash />} onClick={() => setDestroy(true)} style={{ color: 'var(--admin-status-broken)' }}>Destroy</RDBtn>
              )}
              {editing && (
                <>
                  <RDBtn variant="secondary" size="md" onClick={cancelEdit}>Cancel</RDBtn>
                  <RDBtn variant="primary" size="md" iconLeft={<RI.check />} disabled={changes.length === 0 || anyInvalid} onClick={() => setReviewing(true)}>
                    {changes.length === 0 ? 'No changes' : `Review ${changes.length} change${changes.length === 1 ? '' : 's'}`}
                  </RDBtn>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Save preview ───────────────────────────────────────────────── */}
        {editing && reviewing && changes.length > 0 && (
          <SavePreview changes={changes} busy={busy} onCancel={() => setReviewing(false)} onApply={applySave} />
        )}

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <RDTabs activeId={tab} onChange={setTab} tabs={[
          { id: 'fields', label: 'Fields', count: model.fields.length },
          { id: 'collections', label: 'Collections', count: model.datatypes.length },
        ]} />

        {tab === 'fields' && (
          <div style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, padding: '0 14px', background: 'var(--admin-surface-sunken)' }}>
              <RDEyebrow style={{ color: 'var(--admin-text-muted)' }}>Persisted fields</RDEyebrow>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--admin-text-subtle)' }}>safe-dump: <RDMono size="sm" muted>{model.safe_dump_fields.join(', ')}</RDMono></span>
            </div>

            {model.fields.map((f) => {
              // transient — absent by design
              if (f.category === 'transient') {
                return (
                  <FieldRow key={f.name} field={f} editing={editing}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <RDChip category="transient" />
                      <span style={{ fontSize: 12, color: 'var(--admin-text-subtle)' }}>Transient — never persisted, absent from the payload. Not editable here.</span>
                    </div>
                  </FieldRow>
                );
              }
              // encrypted — concealed + reveal
              if (f.category === 'encrypted') {
                return (
                  <FieldRow key={f.name} field={f} editing={editing}>
                    <EncryptedField field={f} custid={record.custid} autoReveal={intent === 'reveal'} />
                  </FieldRow>
                );
              }
              // identifier / readonly — display only
              const isEditable = !f.identifier && !f.readonly;
              const val = record[f.name];
              const dval = draft[f.name];
              if (!editing || !isEditable) {
                let display;
                if (f.name === 'created_at' || f.name === 'updated_at') display = <RDDualTime ts={val} />;
                else if (f.name === 'status') display = <RDDot status={RD_STATUS_TONE[val]} label={val} />;
                else display = <RDMono size="md">{String(val)}</RDMono>;
                return <FieldRow key={f.name} field={f} editing={editing}>{display}</FieldRow>;
              }
              // editable in edit mode
              let editor;
              if (f.name === 'status') {
                editor = <RDSelect value={dval} onChange={(e) => set('status', e.target.value)} options={RD_STATUS_OPTS} />;
              } else {
                editor = (
                  <RDInput mono={f.name === 'email'} size="md" value={dval ?? ''} invalid={validities[f.name]?.ok === false}
                    style={{ width: f.name === 'email' ? 320 : 280 }} onChange={(e) => set(f.name, e.target.value)} />
                );
              }
              return <FieldRow key={f.name} field={f} editing value={val} draft={dval} validity={validities[f.name]}>{editor}</FieldRow>;
            })}
          </div>
        )}

        {tab === 'collections' && (
          <window.RecordCollections collections={window.REC.COLLECTIONS} />
        )}
      </div>

      {/* ── Destroy dialog (dry-run → confirm → apply) ───────────────────── */}
      {destroy && (
        <>
          <button type="button" aria-label="Close" onClick={() => setDestroy(false)}
            style={{ position: 'fixed', top: 16, right: 16, zIndex: 101, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, background: 'var(--admin-surface-raised)', border: '1px solid var(--admin-border-strong)', borderRadius: 'var(--admin-radius-sm)', color: 'var(--admin-text-muted)', cursor: 'pointer' }}>
            <RI.x size={14} />
          </button>
          <RDDryRun
            variant="dialog"
            title={`Destroy ${record.custid}`}
            description="Deletes the object, its index entries, and all attached collections."
            applyLabel="Destroy record"
            dryRunLabel="Preview impact"
            ackLabel="I understand this permanently deletes this record and cannot be undone."
            impact={[
              { label: 'Object key', value: `customer:${record.custid}:object`, tone: 'broken' },
              { label: 'Unique index (email_lookup)', value: '−1 entry', tone: 'caution' },
              { label: 'Multi index (status_index)', value: `−1 member (${record.status})`, tone: 'caution' },
              { label: 'Attached collections', value: '5 keys', tone: 'broken' },
              { label: 'Instances timeline', value: '−1', tone: 'caution' },
            ]}
            onApply={() => window.RSTORE.destroy(custid).then((res) => {
              toast({ tone: 'broken', title: `Destroyed ${record.custid}`, detail: `records.destroy · timeline −1 → ${res.countFast.toLocaleString()}${res.offline ? ' · simulated' : ''}`, mono: true });
              setTimeout(() => { setDestroy(false); onBack(); }, 600);
            })}
          />
        </>
      )}
    </div>
  );
}

window.RecordDetail = RecordDetail;
