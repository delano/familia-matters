/* seed.js — the single shared backend's system prompt + SEED block.
 *
 * Plain JS (no JSX). Loaded with <script src> so window.FAMILIA_SYSTEM_PROMPT
 * is available before any backend instance is created.
 *
 * The system prompt below is pasted VERBATIM from
 * `uploads/familia-admin/prototype/backend-simulator.md`, with the SEED
 * placeholder filled in with the contents of the four fixture files:
 *   fixtures/descriptor.sample.json
 *   fixtures/records.sample.json
 *   fixtures/health_check.sample.json
 *   fixtures/migrations.sample.json
 *
 * One backend, one StateModel, seeded once. Every screen computes its responses
 * from this shared state — never from a fixed fixture.
 */
(function () {
  // ── Fixtures (the SEED) ─────────────────────────────────────────────────────
  var DESCRIPTOR = {
    generated_at: 1749200000,
    familia_version: '2.10.1',
    models: [
      {
        model: 'customer', class: 'Customer', key_pattern: 'customer:{custid}:object',
        identifier_field: 'custid', logical_database: 0,
        fields: [
          { name: 'custid', category: 'field', persisted: true, identifier: true },
          { name: 'email', category: 'field', persisted: true, json_schema: { type: 'string', format: 'email' } },
          { name: 'name', category: 'field', persisted: true, json_schema: { type: 'string', minLength: 1, maxLength: 255 } },
          { name: 'status', category: 'field', persisted: true, json_schema: { type: 'string', enum: ['active', 'inactive', 'pending'], default: 'pending' } },
          { name: 'created_at', category: 'field', persisted: true, json_schema: { type: 'number' } },
          { name: 'updated_at', category: 'field', persisted: true, json_schema: { type: 'number' } },
          { name: 'api_secret', category: 'encrypted', persisted: true, display: '[CONCEALED]' },
          { name: 'password', category: 'transient', persisted: false, client_visible: false, display: '[REDACTED]' }
        ],
        datatypes: [
          { name: 'recent_logins', type: 'list', scope: 'instance' },
          { name: 'feature_flags', type: 'set', scope: 'instance' },
          { name: 'domains', type: 'sorted_set', scope: 'instance' },
          { name: 'metadata', type: 'hashkey', scope: 'instance' },
          { name: 'login_count', type: 'counter', scope: 'instance' }
        ],
        indexes: [
          { index_name: 'email_lookup', field: 'email', cardinality: 'unique', class_level: true, queryable: true, coordinate: 'Customer.email_lookup', logical_database: 0 },
          { index_name: 'status_index', field: 'status', cardinality: 'multi', class_level: true, queryable: true, coordinate: 'Customer.status_index', logical_database: 3 }
        ],
        participations: [],
        safe_dump_fields: ['custid', 'email', 'name', 'status', 'created_at'],
        expiration: { policy: 'ttl', default_seconds: 7776000 },
        actions: ['list', 'read', 'create', 'update', 'destroy', 'reveal', 'rebuild_index']
      },
      {
        model: 'session', class: 'Session', key_pattern: 'session:{sessid}:object',
        identifier_field: 'sessid', logical_database: 1,
        fields: [
          { name: 'sessid', category: 'field', persisted: true, identifier: true },
          { name: 'custid', category: 'field', persisted: true },
          { name: 'ip_address', category: 'field', persisted: true },
          { name: 'user_agent', category: 'field', persisted: true },
          { name: 'created_at', category: 'field', persisted: true }
        ],
        datatypes: [], indexes: [], participations: [],
        expiration: { policy: 'ttl', default_seconds: 86400 },
        actions: ['list', 'read', 'create', 'update', 'destroy']
      },
      {
        model: 'api_key', class: 'ApiKey', key_pattern: 'api_key:{keyid}:object',
        identifier_field: 'keyid', logical_database: 0,
        fields: [
          { name: 'keyid', category: 'field', persisted: true, identifier: true },
          { name: 'custid', category: 'field', persisted: true },
          { name: 'label', category: 'field', persisted: true },
          { name: 'created_at', category: 'field', persisted: true },
          { name: 'last_used_at', category: 'field', persisted: true },
          { name: 'secret', category: 'encrypted', persisted: true, display: '[CONCEALED]' }
        ],
        datatypes: [], indexes: [],
        participations: [{ collection: 'api_keys', type: 'sorted_set', target: 'Customer', scored: true, logical_database: 3 }],
        safe_dump_fields: ['keyid', 'label', 'created_at'],
        actions: ['list', 'read', 'create', 'update', 'destroy', 'reveal']
      }
    ]
  };

  var RECORDS = {
    customer: {
      count_fast: 1284,
      records: [
        { custid: 'cust_8f2a91', email: 'alice@example.com', name: 'Alice Ng', status: 'active', created_at: 1730419200, updated_at: 1748736000, api_secret: '[CONCEALED]' },
        { custid: 'cust_4410bd', email: 'bob@example.com', name: 'Bob Tran', status: 'pending', created_at: 1733011200, updated_at: 1733011200, api_secret: '[CONCEALED]' },
        { custid: 'cust_2200ee', email: 'erin@example.com', name: 'Erin Diaz', status: 'inactive', created_at: 1727740800, updated_at: 1746057600, api_secret: '[CONCEALED]' }
      ],
      collections: {
        cust_8f2a91: {
          domains: { type: 'sorted_set', members: [{ member: 'example.com', score: 1730419200 }, { member: 'alice.dev', score: 1733097600 }, { member: 'ng.consulting', score: 1744761600 }] },
          metadata: { type: 'hashkey', entries: { signup_source: 'referral', plan: 'team', region: 'eu-west' } },
          login_count: { type: 'counter', value: 318 }
        }
      },
      secrets: { cust_8f2a91: { api_secret: 'sk_live_9f8c2a7b1e4d6093' } }
    },
    api_key: {
      count_fast: 42,
      records: [
        { keyid: 'key_77c3', custid: 'cust_8f2a91', label: 'CI deploy token', created_at: 1738368000, last_used_at: 1748908800, secret: '[CONCEALED]' }
      ]
    },
    session: { count_fast: 0, records: [] }
  };

  var INDEXES = {
    customer: {
      email_lookup: { 'alice@example.com': 'cust_8f2a91', 'bob@example.com': 'cust_4410bd', 'erin@example.com': 'cust_2200ee' },
      status_index: { active: ['cust_8f2a91'], pending: ['cust_4410bd'], inactive: ['cust_2200ee'] }
    }
  };

  var HEALTH_CHECK = {
    healthy: false, model: 'Customer', checked_at: 1749200000, complete: true,
    instances: { count_timeline: 1284, count_scan: 1282, phantoms: ['cust_legacy_01', 'cust_legacy_02'], missing: ['cust_9931'] },
    unique_indexes: [{ index_name: 'email_lookup', stale: ['bob@old.example'], missing: ['dana@example.com'] }],
    multi_indexes: [{ index_name: 'status_index', stale_members: ['cust_4410bd'], orphaned_keys: ['customer:status_index:archived'] }],
    participations: [{ collection_name: 'api_keys', stale_members: [{ identifier: 'key_dead01', collection_key: 'customer:cust_8f2a91:api_keys', reason: 'record_missing' }] }],
    related_fields: { healthy: true, checked: ['recent_logins', 'feature_flags', 'domains', 'metadata', 'login_count'] },
    cross_references: {
      status: 'issues_found',
      in_instances_missing_unique_index: ['cust_2200ee'],
      index_points_to_wrong_identifier: [{ index: 'email_lookup', field_value: 'erin@example.com', points_to: 'cust_old99', actual: 'cust_2200ee' }]
    },
    summary: {
      total_issues: 9,
      by_type: { phantoms: 2, missing: 1, stale_unique_index: 1, missing_unique_index: 1, stale_multi_member: 1, orphaned_index_key: 1, stale_participation: 1, cross_ref_missing_index: 1, cross_ref_wrong_target: 1 }
    }
  };

  var MIGRATIONS = {
    applied: [
      { id: '20260101_add_status_field', applied_at: 1735689600, description: 'Add status to Customer', reversible: true },
      { id: '20260318_backfill_login_count', applied_at: 1742256000, description: 'Backfill Customer#login_count from event log', reversible: false }
    ],
    pending: [
      { id: '20260520_rename_fullname_to_name', description: 'Rename Customer#fullname to #name', reversible: true, dependencies: ['20260101_add_status_field'] },
      { id: '20260603_reencrypt_api_secret_v2', description: 'Re-encrypt Customer#api_secret under key v2', reversible: false, dependencies: [] }
    ],
    drift: [
      { model: 'Customer', changed: true, stored_digest: 'sha256:8a1c4e2f9b07d3a6', current_digest: 'sha256:91f4cc70ab12de58',
        differences: [{ field: 'fullname', change: 'removed' }, { field: 'name', change: 'added' }, { field: 'updated_at', change: 'added' }],
        suggested_migration: '20260520_rename_fullname_to_name' },
      { model: 'Session', changed: false, stored_digest: 'sha256:55de1188aa0c2f31', current_digest: 'sha256:55de1188aa0c2f31', differences: [] }
    ]
  };

  var SEED = {
    descriptor: DESCRIPTOR,
    records: RECORDS,
    indexes: INDEXES,
    health_check: HEALTH_CHECK,
    migrations: MIGRATIONS
  };

  // ── System prompt (verbatim from backend-simulator.md, SEED filled) ─────────
  var SYSTEM = [
    'You are the backend for "familia-admin", a model-aware admin for Familia (a Ruby',
    'object layer over Redis/Valkey). You receive one JSON request and return ONLY a',
    'JSON response that matches the familia-admin contract. No prose, JSON only. Do',
    'not wrap the JSON in markdown code fences.',
    '',
    'You maintain ONE in-session state object (the StateModel) shared across every',
    'screen. Seed it once from the fixtures on the first request, then mutate it as',
    'actions arrive. Every response is computed from the current StateModel, not from',
    'a fixed fixture. State changes persist for the rest of the session.',
    '',
    'SEED (load once into StateModel):',
    JSON.stringify(SEED, null, 0),
    '',
    'STATEMODEL (the single shared state):',
    '- models:        the descriptor (static schema; never mutated)',
    '- records:       per model, the live record set (seed Customer/ApiKey/Session)',
    '- collections:   per record, its datatypes (domains, metadata, login_count, ...)',
    '- indexes:       email_lookup (map), status_index (buckets)',
    '- timeline:      per model, count_fast and the phantom/missing entries',
    '- drift:         per model, the open integrity issues (seed from health_check)',
    '- migrations:    applied[], pending[], drift[]',
    '- audit_log:     append-only [{at, actor, action, target, ...}]',
    '',
    'CONTRACT (request.action -> response, all mutating the StateModel):',
    '- meta                      -> the descriptor.',
    '- records.list {model}      -> {model, offset, limit, count_fast, records:[...]}',
    '                               from StateModel. Encrypted fields "[CONCEALED]";',
    '                               transient fields absent.',
    '- records.read {model,id}   -> one record (+ "_key").',
    '- records.create {...}      -> add to records and timeline (count_fast +1); a',
    '                               clean create adds NO drift. Echo {created, _simulated:true}.',
    '- records.update {...}      -> mutate fields atomically; echo the record.',
    '- records.destroy {model,id}-> remove from records and timeline; {destroyed:true,_simulated:true}.',
    '- records.reveal {model,id,field}',
    '                            -> fake plaintext "sk_demo_<rand>" + "_audit"; append audit_log.',
    '- query.index {model,index,value}',
    '                            -> records from indexes. A NON-indexed field returns',
    '                               {error:"scan_required", hint, estimated_rows} unless force=true.',
    '- integrity.check {model}   -> compute health_check shape from drift[model]. If',
    '                               drift is empty: healthy:true, empty arrays, and',
    '                               count_fast == count_scan.',
    '- integrity.repair {model, dry_run:true}',
    '                            -> preview derived from drift[model]; NO mutation.',
    '- integrity.repair {model, dry_run:false}',
    '                            -> clear drift[model], set count_fast = count_scan,',
    '                               append audit_log; return the repaired summary. The',
    '                               NEXT integrity.check returns healthy.',
    '- migrations.status         -> {applied, pending} from StateModel.',
    '- migrations.drift          -> migrations.drift from StateModel.',
    '- migrations.run {id, dry_run}',
    '                            -> dry_run: a plan; apply: move id pending->applied,',
    '                               clear its drift entry, append audit_log.',
    '- migrations.rollback {id}  -> move id applied->pending; append audit_log.',
    '- raw.scan_keys / raw.inspect_key / raw.info',
    '                            -> derive from StateModel keys (type, ttl).',
    '',
    'STREAMING (return an ARRAY of progress events in the stream_repair shape):',
    '- integrity.check and integrity.repair with stream:true emit phase events',
    '  {phase,current,total,result} ending with a done event. The canonical repair',
    '  stream shape is, in order: a {"event":"start",model,dry_run,at} event; then for',
    '  each affected component a {"phase":<name>,"current":N,"total":N,"result":{...}}',
    '  event (phase in instances|unique_indexes|multi_indexes|participations|cross_references);',
    '  ending with {"event":"done","healthy":true,"at":...,"summary":{...}}. Return the',
    '  whole array as the JSON response.',
    '',
    'CROSS-DATABASE GUARD:',
    '- If a repair\'s fix set spans more than one logical_database (e.g. Customer drift',
    '  touching db0 instances/unique_indexes AND another db for multi_indexes/',
    '  participations), return {error:"CrossDatabaseError",',
    '  message:"Repair spans logical databases and cannot be applied atomically",',
    '  scopes:[{db, keys:[...]}, ...], remedy:"repair <model> --scope db:<n> per db"}',
    '  and offer NO destructive action. (This drives the "Refused" state.) Only apply',
    '  this guard when the request params include scope:"all" or cross_database:true;',
    '  a scoped repair (params.scope like "db:0") proceeds normally for that db.',
    '',
    'GUARDRAILS:',
    '- Prototype only. Never claim a real database connection.',
    '- Secrets are always fake; never invent a realistic-looking secret.',
    '- Destructive actions are simulated and carry "_simulated": true.',
    '- If request.tier lacks the action, return {error:"forbidden", required_tier:<t>,',
    '  held:<the tier on the request>}. integrity.check is readable at permission:read;',
    '  integrity.repair (any dry_run) requires permission:repair.'
  ].join('\n');

  window.FAMILIA_SEED = SEED;
  window.FAMILIA_SYSTEM_PROMPT = SYSTEM;
})();
