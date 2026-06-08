/* records/collections.jsx — attached-collection panels for the record detail.
 * One editor per Familia datatype: list, set, sorted_set, hashkey, counter.
 * Exports window.RecordCollections. */
const RC_DS = window.FamiliaAdminDesignSystem_a9098d;
const { Badge: RCBadge, Mono: RCMono, Button: RCBtn, Input: RCInput, Switch: RCSwitch } = RC_DS;
const { Eyebrow: RCEyebrow, fmtTime: RCfmt, fmtDate: RCfmtDate, relTime: RCrel, useToast: RCtoast } = window.RLIB;

const TYPE_META = {
  list:       { icon: 'list',   blurb: 'Ordered · duplicates allowed · LPUSH / RPUSH' },
  set:        { icon: 'tag',    blurb: 'Unique members · unordered · SADD / SREM' },
  sorted_set: { icon: 'globe',  blurb: 'Member + score · ordered by score · ZADD' },
  hashkey:    { icon: 'braces', blurb: 'Field → value map · HSET / HDEL' },
  counter:    { icon: 'sigma',  blurb: 'Atomic integer · INCRBY / DECRBY' },
};

function PanelShell({ name, type, count, children, headerRight }) {
  const RI = window.RICONS;
  const meta = TYPE_META[type];
  const Icon = RI[meta.icon];
  return (
    <section style={{ border: 'var(--admin-border)', borderRadius: 'var(--admin-radius)', background: 'var(--admin-surface)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40, padding: '0 12px', borderBottom: '1px solid var(--admin-border-color)' }}>
        <span style={{ color: 'var(--admin-text-subtle)', display: 'flex' }}><Icon size={14} /></span>
        <RCMono size="md">{name}</RCMono>
        <RCBadge tone="neutral" uppercase>{type}</RCBadge>
        {count != null && <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 11, color: 'var(--admin-text-muted)' }}>{count}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{meta.blurb}</span>
          {headerRight}
        </span>
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </section>
  );
}

/* Small add-row used by list / set. */
function AddRow({ placeholder, onAdd, mono = true }) {
  const RI = window.RICONS;
  const [v, setV] = React.useState('');
  const submit = () => { const t = v.trim(); if (t) { onAdd(t); setV(''); } };
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <RCInput mono={mono} size="md" value={v} placeholder={placeholder} style={{ flex: 1 }}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
      <RCBtn variant="secondary" size="md" iconLeft={<RI.plus />} onClick={submit}>Add</RCBtn>
    </div>
  );
}

function RemoveBtn({ onClick, title = 'Remove' }) {
  const RI = window.RICONS;
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: '1px solid transparent', background: 'transparent', borderRadius: 'var(--admin-radius-sm)', color: 'var(--admin-text-subtle)', cursor: 'pointer' }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--admin-status-broken)'; e.currentTarget.style.borderColor = 'var(--admin-status-broken)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--admin-text-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
    ><RI.x size={12} /></button>
  );
}

/* ── list — recent_logins ─────────────────────────────────────────────────── */
function ListPanel({ name, data }) {
  const toast = RCtoast();
  const [items, setItems] = React.useState(data.members);
  const add = (raw) => { setItems((p) => [{ at: window.REC.NOW, ip: raw, ua: 'manual entry' }, ...p]); toast({ title: 'LPUSH', detail: `${name} ← head`, mono: true }); };
  const remove = (i) => { setItems((p) => p.filter((_, k) => k !== i)); toast({ tone: 'caution', title: 'LREM', detail: `removed index ${i}`, mono: true }); };
  return (
    <PanelShell name={name} type="list" count={`${items.length} items`}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto 22px', gap: 10, alignItems: 'center', padding: '0 10px', height: 34, borderTop: i ? '1px solid var(--admin-border-color)' : 'none' }}>
              <RCMono size="sm" muted>[{i}]</RCMono>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                <RCMono size="sm">{RCfmt(it.at)}</RCMono>
                <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{RCrel(it.at)}</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                <RCMono size="sm" muted>{it.ip}</RCMono>
                <span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{it.ua}</span>
              </span>
              <RemoveBtn onClick={() => remove(i)} />
            </div>
          ))}
        </div>
        <AddRow placeholder="Append login source (LPUSH to head)" onAdd={add} />
      </div>
    </PanelShell>
  );
}

/* ── set — feature_flags ──────────────────────────────────────────────────── */
function SetPanel({ name, data }) {
  const toast = RCtoast();
  const [members, setMembers] = React.useState(data.members);
  const add = (raw) => {
    const v = raw.replace(/\s+/g, '_').toLowerCase();
    if (members.includes(v)) { toast({ tone: 'caution', title: 'Already a member', detail: v, mono: true }); return; }
    setMembers((p) => [...p, v]); toast({ title: 'SADD', detail: `${name} += ${v}`, mono: true });
  };
  const remove = (m) => { setMembers((p) => p.filter((x) => x !== m)); toast({ tone: 'caution', title: 'SREM', detail: `${name} -= ${m}`, mono: true }); };
  return (
    <PanelShell name={name} type="set" count={`${members.length} members`}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {members.map((m) => (
            <span key={m} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 4px 0 10px', background: 'var(--admin-surface-sunken)', border: '1px solid var(--admin-border-color)', borderRadius: 9999 }}>
              <RCMono size="sm">{m}</RCMono>
              <RemoveBtn onClick={() => remove(m)} title={`SREM ${m}`} />
            </span>
          ))}
          {members.length === 0 && <span style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>Empty set.</span>}
        </div>
        <AddRow placeholder="Add flag (SADD — deduplicated)" onAdd={add} />
      </div>
    </PanelShell>
  );
}

/* ── sorted_set — domains (scores are timestamps) ─────────────────────────── */
function SortedSetPanel({ name, data }) {
  const toast = RCtoast();
  const [members, setMembers] = React.useState([...data.members].sort((a, b) => a.score - b.score));
  const [asTime, setAsTime] = React.useState(true);
  const [member, setMember] = React.useState('');
  const [score, setScore] = React.useState('');

  const add = () => {
    const mm = member.trim(); if (!mm) return;
    let sc = Number(score);
    if (!score.trim()) sc = window.REC.NOW;
    else if (/[-:]/.test(score)) { const t = Date.parse(score + (score.length <= 10 ? 'T00:00:00Z' : 'Z')); if (!Number.isNaN(t)) sc = Math.floor(t / 1000); }
    const next = [...members.filter((x) => x.member !== mm), { member: mm, score: sc }].sort((a, b) => a.score - b.score);
    setMembers(next); setMember(''); setScore('');
    toast({ title: 'ZADD', detail: `${name} ${sc} ${mm}`, mono: true });
  };
  const remove = (m) => { setMembers((p) => p.filter((x) => x.member !== m)); toast({ tone: 'caution', title: 'ZREM', detail: `${name} -= ${m}`, mono: true }); };

  return (
    <PanelShell name={name} type="sorted_set" count={`${members.length} members`}
      headerRight={<RCSwitch checked={asTime} onChange={setAsTime} label="Time view" />}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 200px 22px', gap: 10, alignItems: 'center', padding: '0 10px', height: 28, background: 'var(--admin-surface-sunken)' }}>
            <RCEyebrow style={{ color: 'var(--admin-text-muted)' }}>#</RCEyebrow>
            <RCEyebrow style={{ color: 'var(--admin-text-muted)' }}>Member</RCEyebrow>
            <RCEyebrow style={{ color: 'var(--admin-text-muted)' }}>{asTime ? 'Score (as time)' : 'Score (raw)'}</RCEyebrow>
            <span />
          </div>
          {members.map((it, i) => (
            <div key={it.member} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 200px 22px', gap: 10, alignItems: 'center', padding: '0 10px', height: 34, borderTop: '1px solid var(--admin-border-color)' }}>
              <RCMono size="sm" muted>{i}</RCMono>
              <RCMono size="sm">{it.member}</RCMono>
              {asTime
                ? <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}><RCMono size="sm">{RCfmtDate(it.score)}</RCMono><span style={{ fontSize: 11, color: 'var(--admin-text-subtle)' }}>{RCrel(it.score)}</span></span>
                : <RCMono size="sm" muted>{it.score}</RCMono>}
              <RemoveBtn onClick={() => remove(it.member)} title={`ZREM ${it.member}`} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <RCInput mono size="md" value={member} placeholder="member" style={{ flex: 1 }} onChange={(e) => setMember(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <RCInput mono size="md" value={score} placeholder="score / YYYY-MM-DD" style={{ width: 200 }} onChange={(e) => setScore(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <RCBtn variant="secondary" size="md" iconLeft={<window.RICONS.plus />} onClick={add}>ZADD</RCBtn>
        </div>
      </div>
    </PanelShell>
  );
}

/* ── hashkey — metadata ───────────────────────────────────────────────────── */
function HashPanel({ name, data }) {
  const toast = RCtoast();
  const [entries, setEntries] = React.useState(() => Object.entries(data.entries).map(([k, v]) => ({ k, v })));
  const [k, setK] = React.useState('');
  const [v, setV] = React.useState('');
  const set = (key, val) => { setEntries((p) => p.map((e) => (e.k === key ? { ...e, v: val } : e))); };
  const add = () => { const kk = k.trim(); if (!kk) return; setEntries((p) => [...p.filter((e) => e.k !== kk), { k: kk, v: v.trim() }]); setK(''); setV(''); toast({ title: 'HSET', detail: `${name} ${kk}`, mono: true }); };
  const remove = (key) => { setEntries((p) => p.filter((e) => e.k !== key)); toast({ tone: 'caution', title: 'HDEL', detail: `${name} ${key}`, mono: true }); };
  return (
    <PanelShell name={name} type="hashkey" count={`${entries.length} fields`}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ border: '1px solid var(--admin-border-color)', borderRadius: 'var(--admin-radius-sm)', overflow: 'hidden' }}>
          {entries.map((e, i) => (
            <div key={e.k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 22px', gap: 10, alignItems: 'center', padding: '0 10px', height: 36, borderTop: i ? '1px solid var(--admin-border-color)' : 'none' }}>
              <RCMono size="sm">{e.k}</RCMono>
              <RCInput mono size="sm" value={e.v} style={{ width: '100%' }} onChange={(ev) => set(e.k, ev.target.value)} />
              <RemoveBtn onClick={() => remove(e.k)} title={`HDEL ${e.k}`} />
            </div>
          ))}
          {entries.length === 0 && <div style={{ padding: '10px', fontSize: 12, color: 'var(--admin-text-muted)' }}>Empty hash.</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <RCInput mono size="md" value={k} placeholder="field" style={{ width: 180 }} onChange={(e) => setK(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <RCInput mono size="md" value={v} placeholder="value" style={{ flex: 1 }} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <RCBtn variant="secondary" size="md" iconLeft={<window.RICONS.plus />} onClick={add}>HSET</RCBtn>
        </div>
      </div>
    </PanelShell>
  );
}

/* ── counter — login_count ────────────────────────────────────────────────── */
function CounterPanel({ name, data }) {
  const toast = RCtoast();
  const [value, setValue] = React.useState(data.value);
  const [by, setBy] = React.useState('1');
  const apply = (sign) => { const n = Math.max(1, Number(by) || 1); setValue((v) => v + sign * n); toast({ title: sign > 0 ? 'INCRBY' : 'DECRBY', detail: `${name} ${sign > 0 ? '+' : '-'}${n}`, mono: true }); };
  return (
    <PanelShell name={name} type="counter">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <RCEyebrow style={{ color: 'var(--admin-text-muted)' }}>Value</RCEyebrow>
          <span style={{ fontFamily: 'var(--admin-mono)', fontSize: 28, fontWeight: 700, lineHeight: 1, color: 'var(--admin-text)' }}>{value.toLocaleString()}</span>
        </div>
        <span style={{ width: 1, height: 36, background: 'var(--admin-border-color)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RCBtn variant="secondary" size="md" onClick={() => apply(-1)}>− DECRBY</RCBtn>
          <RCInput mono size="md" value={by} style={{ width: 72 }} onChange={(e) => setBy(e.target.value.replace(/[^0-9]/g, ''))} />
          <RCBtn variant="secondary" size="md" onClick={() => apply(1)}>+ INCRBY</RCBtn>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--admin-text-subtle)' }}>Atomic — no read-modify-write race.</span>
      </div>
    </PanelShell>
  );
}

function RecordCollections({ collections }) {
  const C = collections;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <ListPanel name="recent_logins" data={C.recent_logins} />
      <SetPanel name="feature_flags" data={C.feature_flags} />
      <SortedSetPanel name="domains" data={C.domains} />
      <HashPanel name="metadata" data={C.metadata} />
      <CounterPanel name="login_count" data={C.login_count} />
    </div>
  );
}

window.RecordCollections = RecordCollections;
