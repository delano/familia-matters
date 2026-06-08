/* data.js — fixtures for the Integrity Console.
 * Plain JS (no JSX). Loaded with <script src> so it's available before Babel runs.
 * Source: familia-admin/fixtures/health_check.sample.json + stream_repair.sample.jsonl
 * Assigns everything to window.ADMIN.
 */
(function () {
  // ── GET /admin/api/integrity/customer — the "issues found" report ──────────
  const HEALTH = {
    endpoint: 'GET /admin/api/integrity/customer',
    healthy: false,
    model: 'Customer',
    checked_at: 1749200000, // 2026-06-06 11:33:20 UTC
    complete: true,
    instances: {
      count_timeline: 1284,
      count_scan: 1282,
      phantoms: ['cust_legacy_01', 'cust_legacy_02'],
      missing: ['cust_9931'],
    },
    unique_indexes: [
      { index_name: 'email_lookup', stale: ['bob@old.example'], missing: ['dana@example.com'] },
    ],
    multi_indexes: [
      { index_name: 'status_index', stale_members: ['cust_4410bd'], orphaned_keys: ['customer:status_index:archived'] },
    ],
    participations: [
      {
        collection_name: 'api_keys',
        stale_members: [
          { identifier: 'key_dead01', collection_key: 'customer:cust_8f2a91:api_keys', reason: 'record_missing' },
        ],
      },
    ],
    related_fields: { healthy: true, checked: ['recent_logins', 'feature_flags', 'domains', 'metadata', 'login_count'] },
    cross_references: {
      status: 'issues_found',
      in_instances_missing_unique_index: ['cust_2200ee'],
      index_points_to_wrong_identifier: [
        { index: 'email_lookup', field_value: 'erin@example.com', points_to: 'cust_old99', actual: 'cust_2200ee' },
      ],
    },
    summary: {
      total_issues: 9,
      by_type: {
        phantoms: 2,
        missing: 1,
        stale_unique_index: 1,
        missing_unique_index: 1,
        stale_multi_member: 1,
        orphaned_index_key: 1,
        stale_participation: 1,
        cross_ref_missing_index: 1,
        cross_ref_wrong_target: 1,
      },
    },
  };

  // ── The same report after a clean scan: empty arrays, healthy: true ─────────
  const HEALTH_OK = {
    endpoint: 'GET /admin/api/integrity/customer',
    healthy: true,
    model: 'Customer',
    checked_at: 1749200214, // post-repair
    complete: true,
    instances: { count_timeline: 1282, count_scan: 1282, phantoms: [], missing: [] },
    unique_indexes: [{ index_name: 'email_lookup', stale: [], missing: [] }],
    multi_indexes: [{ index_name: 'status_index', stale_members: [], orphaned_keys: [] }],
    participations: [{ collection_name: 'api_keys', stale_members: [] }],
    related_fields: { healthy: true, checked: ['recent_logins', 'feature_flags', 'domains', 'metadata', 'login_count'] },
    cross_references: { status: 'clean', in_instances_missing_unique_index: [], index_points_to_wrong_identifier: [] },
    summary: {
      total_issues: 0,
      by_type: {
        phantoms: 0, missing: 0, stale_unique_index: 0, missing_unique_index: 0,
        stale_multi_member: 0, orphaned_index_key: 0, stale_participation: 0,
        cross_ref_missing_index: 0, cross_ref_wrong_target: 0,
      },
    },
  };

  // ── stream_repair.sample.jsonl — one event per line ─────────────────────────
  const REPAIR_STREAM = [
    { event: 'start', model: 'Customer', dry_run: false, at: 1749200200 },
    { phase: 'instances', current: 0, total: 1284 },
    { phase: 'instances', current: 428, total: 1284 },
    { phase: 'instances', current: 856, total: 1284 },
    { phase: 'instances', current: 1284, total: 1284, result: { phantoms_removed: 2, missing_added: 1 } },
    { phase: 'unique_indexes', current: 1, total: 1, index: 'email_lookup', result: { stale_removed: 1, rebuilt: 1 } },
    { phase: 'multi_indexes', current: 1, total: 1, index: 'status_index', result: { stale_members_removed: 1, orphaned_keys_removed: 1 } },
    { phase: 'participations', current: 1, total: 1, collection: 'api_keys', result: { stale_removed: 1 } },
    { phase: 'cross_references', current: 1, total: 1, result: { reindexed: 1, retargeted: 1 } },
    {
      event: 'done', healthy: true, at: 1749200214,
      summary: {
        phantoms_removed: 2, missing_added: 1, indexes_rebuilt: 2, stale_members_removed: 2,
        orphaned_keys_removed: 1, participations_fixed: 1, cross_refs_fixed: 2,
      },
    },
  ];

  // Human labels + semantic severity for each summary.by_type key.
  // amber/caution = stale drift · red/broken = missing/phantom/orphaned/mistarget.
  const TYPE_META = {
    phantoms:               { label: 'Phantoms',            sev: 'broken',  section: 'instances' },
    missing:                { label: 'Missing',             sev: 'broken',  section: 'instances' },
    stale_unique_index:     { label: 'Stale unique idx',    sev: 'caution', section: 'unique_indexes' },
    missing_unique_index:   { label: 'Missing unique idx',  sev: 'broken',  section: 'unique_indexes' },
    stale_multi_member:     { label: 'Stale multi-member',  sev: 'caution', section: 'multi_indexes' },
    orphaned_index_key:     { label: 'Orphaned keys',       sev: 'broken',  section: 'multi_indexes' },
    stale_participation:    { label: 'Stale participation', sev: 'caution', section: 'participations' },
    cross_ref_missing_index:{ label: 'Cross-ref missing',   sev: 'broken',  section: 'cross_references' },
    cross_ref_wrong_target: { label: 'Cross-ref mistarget', sev: 'broken',  section: 'cross_references' },
  };

  // Per-section planned changes for the dry-run preview, derived from the
  // repair stream's result fields. Keyed by section id.
  const PLAN = {
    instances: [
      { op: 'remove', what: 'phantom records', n: 2, tone: 'broken', detail: 'cust_legacy_01, cust_legacy_02' },
      { op: 'add', what: 'missing record to index', n: 1, tone: 'broken', detail: 'cust_9931' },
    ],
    unique_indexes: [
      { op: 'remove', what: 'stale entry from email_lookup', n: 1, tone: 'caution', detail: 'bob@old.example' },
      { op: 'rebuild', what: 'missing entry in email_lookup', n: 1, tone: 'broken', detail: 'dana@example.com' },
    ],
    multi_indexes: [
      { op: 'remove', what: 'stale member from status_index', n: 1, tone: 'caution', detail: 'cust_4410bd' },
      { op: 'remove', what: 'orphaned index key', n: 1, tone: 'broken', detail: 'customer:status_index:archived' },
    ],
    participations: [
      { op: 'remove', what: 'stale member from api_keys', n: 1, tone: 'caution', detail: 'key_dead01 · record_missing' },
    ],
    cross_references: [
      { op: 'reindex', what: 'instance missing unique index', n: 1, tone: 'broken', detail: 'cust_2200ee' },
      { op: 'retarget', what: 'index pointer to correct identifier', n: 1, tone: 'broken', detail: 'cust_old99 → cust_2200ee' },
    ],
  };

  // ── State 9: partial-stage failure ─────────────────────────────────────────
  // multi_indexes stage hit a WATCH/optimistic-lock conflict and applied nothing;
  // the other four stages committed independently. This is the post-repair report:
  // everything reconciles except the failed stage's two issues.
  const HEALTH_PARTIAL = {
    ...HEALTH,
    healthy: false,
    checked_at: 1749200214,
    instances: { count_timeline: 1282, count_scan: 1282, phantoms: [], missing: [] },
    unique_indexes: [{ index_name: 'email_lookup', stale: [], missing: [] }],
    multi_indexes: HEALTH.multi_indexes, // still broken — stage failed
    participations: [{ collection_name: 'api_keys', stale_members: [] }],
    cross_references: { status: 'clean', in_instances_missing_unique_index: [], index_points_to_wrong_identifier: [] },
    summary: {
      total_issues: 2,
      by_type: {
        phantoms: 0, missing: 0, stale_unique_index: 0, missing_unique_index: 0,
        stale_multi_member: 1, orphaned_index_key: 1, stale_participation: 0,
        cross_ref_missing_index: 0, cross_ref_wrong_target: 0,
      },
    },
  };

  // Per-stage outcome map for the partial-failure panel. Stages are independent;
  // committed stages stay written, only the failed stage offers a retry.
  const PARTIAL_STAGES = [
    { phase: 'instances', label: 'Instances', status: 'ok', result: '2 phantoms removed · 1 missing added' },
    { phase: 'unique_indexes', label: 'Unique indexes', status: 'ok', result: '1 stale removed · 1 entry rebuilt' },
    {
      phase: 'multi_indexes', label: 'Multi indexes', status: 'failed', result: null,
      error_code: 'WATCH_CONFLICT',
      error: 'customer:status_index:archived was modified by another client during the transaction. The optimistic lock failed, so this stage was rolled back and applied no changes.',
      remaining: 2,
    },
    { phase: 'participations', label: 'Participations', status: 'ok', result: '1 stale member removed' },
    { phase: 'cross_references', label: 'Cross-references', status: 'ok', result: '1 reindexed · 1 retargeted' },
  ];

  // ── State 11: refused — cross-database scope ────────────────────────────────
  const REFUSED = {
    error: 'CrossDatabaseError',
    headline: 'Repair spans logical databases and cannot be applied atomically.',
    detail: 'The fix set touches keys in two logical databases. Redis MULTI/EXEC is not atomic across databases, so a single repair transaction could partially apply and leave the graph in a worse state. Familia refuses the operation rather than risk it.',
    spans: [
      { db: 0, scope: 'instances · unique_indexes', keys: ['customer:{custid}:object', 'customer:email_lookup'] },
      { db: 3, scope: 'multi_indexes · participations', keys: ['customer:status_index:*', 'customer:{custid}:api_keys'] },
    ],
    remedy: 'repair customer --scope db:0   # then  repair customer --scope db:3',
  };

  // ── State 12: insufficient permission ───────────────────────────────────────
  const AUTH = {
    actor: 'ops@familia.dev',
    held: 'permission:read',
    required: 'permission:repair',
    note: 'The integrity report is readable at your tier. Applying a repair writes to the object graph and requires the permission:repair tier.',
  };

  window.ADMIN = {
    HEALTH, HEALTH_OK, HEALTH_PARTIAL, REPAIR_STREAM, PARTIAL_STAGES,
    REFUSED, AUTH, TYPE_META, PLAN,
  };
})();
