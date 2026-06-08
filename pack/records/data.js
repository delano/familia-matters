/* records/data.js — fixture data for the Customer record screens.
 * Mirrors familia-admin/fixtures/{descriptor,records}.sample.json and extends
 * the record set so filtering / scan demos are meaningful. Plain JS → window.REC. */

/* Fixed "now" so relative timestamps are stable in the prototype. */
const REC_NOW = 1749200300; // 2026-06-06 ~18:18 UTC

/* ── Customer model descriptor (subset used by these screens) ─────────────── */
const CUSTOMER = {
  model: 'customer',
  class: 'Customer',
  key_pattern: 'customer:{custid}:object',
  identifier_field: 'custid',
  fields: [
    { name: 'custid', category: 'field', persisted: true, identifier: true, label: 'Customer id' },
    { name: 'email', category: 'field', persisted: true, label: 'Email',
      json_schema: { type: 'string', format: 'email' } },
    { name: 'name', category: 'field', persisted: true, label: 'Name',
      json_schema: { type: 'string', minLength: 1, maxLength: 255 } },
    { name: 'status', category: 'field', persisted: true, label: 'Status',
      json_schema: { type: 'string', enum: ['active', 'inactive', 'pending'], default: 'pending' } },
    { name: 'created_at', category: 'field', persisted: true, label: 'Created at',
      json_schema: { type: 'number' }, readonly: true },
    { name: 'updated_at', category: 'field', persisted: true, label: 'Updated at',
      json_schema: { type: 'number' }, readonly: true },
    { name: 'api_secret', category: 'encrypted', persisted: true, display: '[CONCEALED]', label: 'Api secret' },
    { name: 'password', category: 'transient', persisted: false, client_visible: false, display: '[REDACTED]', label: 'Password' },
  ],
  datatypes: [
    { name: 'recent_logins', type: 'list', scope: 'instance' },
    { name: 'feature_flags', type: 'set', scope: 'instance' },
    { name: 'domains', type: 'sorted_set', scope: 'instance' },
    { name: 'metadata', type: 'hashkey', scope: 'instance' },
    { name: 'login_count', type: 'counter', scope: 'instance' },
  ],
  indexes: [
    { index_name: 'email_lookup', field: 'email', cardinality: 'unique', class_level: true, queryable: true, coordinate: 'Customer.email_lookup' },
    { index_name: 'status_index', field: 'status', cardinality: 'multi', class_level: true, queryable: true, coordinate: 'Customer.status_index' },
  ],
  safe_dump_fields: ['custid', 'email', 'name', 'status', 'created_at'],
  expiration: { policy: 'ttl', default_seconds: 7776000 },
  actions: ['list', 'read', 'create', 'update', 'destroy', 'reveal', 'rebuild_index'],
};

/* Columns surfaced in the list = plain persisted fields (no encrypted/transient). */
const LIST_FIELDS = ['custid', 'email', 'name', 'status', 'created_at'];

/* ── Record set ───────────────────────────────────────────────────────────
 * The 3 canonical fixture rows (alice/bob/erin) plus a wider set so the index
 * filter (status / email) and the full-scan warning have something to act on.
 * count_fast is the O(1) timeline count and is intentionally larger than the
 * loaded page — the integrity console reconciles the difference. */
const D = (s) => Math.floor(new Date(s + 'T00:00:00Z').getTime() / 1000);

const RECORDS = [
  { custid: 'cust_8f2a91', email: 'alice@example.com',    name: 'Alice Ng',        status: 'active',   created_at: 1730419200, updated_at: 1748736000 },
  { custid: 'cust_4410bd', email: 'bob@example.com',      name: 'Bob Tran',        status: 'pending',  created_at: 1733011200, updated_at: 1733011200 },
  { custid: 'cust_2200ee', email: 'erin@example.com',     name: 'Erin Diaz',       status: 'inactive', created_at: 1727740800, updated_at: 1746057600 },
  { custid: 'cust_91ab3c', email: 'carla@northwind.io',   name: 'Carla Okonkwo',   status: 'active',   created_at: D('2025-05-21'), updated_at: D('2025-05-30') },
  { custid: 'cust_77de02', email: 'dmitri@valkey.dev',    name: 'Dmitri Sokolov',  status: 'active',   created_at: D('2025-05-04'), updated_at: D('2025-05-19') },
  { custid: 'cust_5c0f18', email: 'fatima@helio.co',      name: 'Fatima Rahman',   status: 'pending',  created_at: D('2025-04-28'), updated_at: D('2025-04-28') },
  { custid: 'cust_aa31f9', email: 'grace@quanta.sh',      name: 'Grace Lindqvist', status: 'active',   created_at: D('2025-04-12'), updated_at: D('2025-05-09') },
  { custid: 'cust_3b6710', email: 'hassan@bridge.app',    name: 'Hassan Yusuf',    status: 'inactive', created_at: D('2025-03-30'), updated_at: D('2025-04-02') },
  { custid: 'cust_d20ace', email: 'ingrid@oslo.no',       name: 'Ingrid Halvorsen',status: 'active',   created_at: D('2025-03-18'), updated_at: D('2025-05-22') },
  { custid: 'cust_6e44b1', email: 'jamal@axiom.io',       name: 'Jamal Carter',    status: 'pending',  created_at: D('2025-03-01'), updated_at: D('2025-03-01') },
  { custid: 'cust_0fc827', email: 'kenji@sakura.jp',      name: 'Kenji Watanabe',  status: 'active',   created_at: D('2025-02-14'), updated_at: D('2025-04-30') },
  { custid: 'cust_b8e150', email: 'lucia@delsol.es',      name: 'Lucía Fernández', status: 'inactive', created_at: D('2025-01-27'), updated_at: D('2025-02-03') },
  { custid: 'cust_4d9a22', email: 'omar@meridian.ae',     name: 'Omar Al-Najjar',  status: 'active',   created_at: D('2025-01-09'), updated_at: D('2025-03-15') },
  { custid: 'cust_71ff63', email: 'priya@tatva.in',       name: 'Priya Nair',      status: 'pending',  created_at: D('2024-09-20'), updated_at: D('2024-09-20') },
];

const COUNT_FAST = 1284; // timeline / instances index, O(1), may include phantoms
const COUNT_SCAN = 1282; // exact SCAN count from the integrity console

/* ── Per-record encrypted plaintext (returned once by the reveal endpoint) ── */
const SECRETS = {
  cust_8f2a91: 'sk_live_9f8c2a7b1e4d6093',
  cust_4410bd: 'sk_live_3c1f08a92be7d145',
};
function secretFor(custid) {
  return SECRETS[custid] || ('sk_live_' + custid.replace('cust_', '') + 'f4a0c7e1');
}

/* ── Attached collections for cust_8f2a91 (one of each datatype) ──────────── */
const COLLECTIONS = {
  recent_logins: { // list — ordered, newest pushed to head
    type: 'list',
    members: [
      { at: D('2025-06-05'), ip: '203.0.113.10', ua: 'Firefox 128 · macOS' },
      { at: D('2025-06-01'), ip: '198.51.100.24', ua: 'Chrome 126 · Windows' },
      { at: D('2025-05-28'), ip: '203.0.113.10', ua: 'Firefox 128 · macOS' },
      { at: D('2025-05-22'), ip: '192.0.2.77', ua: 'Safari 17 · iOS' },
      { at: D('2025-05-19'), ip: '203.0.113.10', ua: 'Firefox 128 · macOS' },
    ],
  },
  feature_flags: { // set — unique, unordered
    type: 'set',
    members: ['beta_dashboard', 'api_v2', 'sso_okta', 'audit_export'],
  },
  domains: { // sorted_set — member + numeric score (scores are timestamps here)
    type: 'sorted_set',
    members: [
      { member: 'example.com', score: 1730419200 },
      { member: 'alice.dev', score: 1733097600 },
      { member: 'ng.consulting', score: 1744761600 },
    ],
  },
  metadata: { // hashkey — field → value
    type: 'hashkey',
    entries: { signup_source: 'referral', plan: 'team', region: 'eu-west' },
  },
  login_count: { // counter — single integer
    type: 'counter',
    value: 318,
  },
};

/* ── Reveal audit record (written server-side; UI surfaces "logged") ──────── */
function auditFor(custid, field) {
  return { at: REC_NOW, actor: 'admin_42', action: 'reveal', model: 'customer', id: custid, field };
}

window.REC = {
  NOW: REC_NOW,
  CUSTOMER,
  LIST_FIELDS,
  RECORDS,
  COUNT_FAST,
  COUNT_SCAN,
  COLLECTIONS,
  secretFor,
  auditFor,
};
