export const meta = {
  name: 'familia-admin-phase2',
  description: 'Phase 2: author Tryouts+node contract tests, fix 7 known bugs to green, adversarially re-verify',
  phases: [
    { title: 'Author', detail: 'serial: Rack::Test helper + per-domain Tryouts files + node adapter test; baseline reds' },
    { title: 'Fix', detail: 'parallel disjoint: backend (api.rb+boot.rb) Ruby suite, frontend (backend-client.js) node test' },
    { title: 'Verify', detail: 'independent adversarial confirmation of all 7 bugs + full suite' },
  ],
}

const REPO = '/Users/d/Projects/dev/delano/familia-admin'

const AUTHOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['filesWritten', 'helperWorks', 'baseline', 'nodeAdapterBaseline', 'notes'],
  properties: {
    filesWritten: { type: 'array', items: { type: 'string' } },
    helperWorks: { type: 'boolean', description: 'true iff the Rack::Test helper booted and a basic _meta + records test ran green' },
    baseline: {
      type: 'object',
      additionalProperties: false,
      required: ['bug1', 'bug2', 'bug3', 'bug4', 'bug7'],
      description: 'red = test fails against current source (expected, pre-fix); green = already correct; error = could not run',
      properties: {
        bug1: { type: 'string', enum: ['red', 'green', 'error'] },
        bug2: { type: 'string', enum: ['red', 'green', 'error'] },
        bug3: { type: 'string', enum: ['red', 'green', 'error'] },
        bug4: { type: 'string', enum: ['red', 'green', 'error'] },
        bug7: { type: 'string', enum: ['red', 'green', 'error'] },
      },
    },
    nodeAdapterBaseline: { type: 'string', enum: ['red', 'green', 'error'], description: 'state of the node adapter test (bugs 5/6) against current backend-client.js' },
    nonBugSuiteGreen: { type: 'boolean', description: 'true iff all NON-bug contract tests (discovery, CRUD shapes, etc.) pass at baseline' },
    deltasDocumented: { type: 'array', items: { type: 'string' }, description: 'live-shape adaptations vs fixtures (health_check report.to_h, etc.)' },
    notes: { type: 'string' },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['perBug', 'suiteGreen', 'filesChanged', 'notes'],
  properties: {
    perBug: { type: 'object', additionalProperties: { type: 'string', enum: ['green', 'red', 'test-looks-wrong'] } },
    bug3RootCause: { type: 'string', description: 'backend only: empirical finding for the stream_repair healthy divergence' },
    suiteGreen: { type: 'boolean' },
    regressions: { type: 'array', items: { type: 'string' } },
    filesChanged: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suite', 'nodeTest', 'perBug', 'overall', 'blockers'],
  properties: {
    suite: { type: 'object', additionalProperties: false, required: ['passed', 'failed'], properties: { passed: { type: 'number' }, failed: { type: 'number' } } },
    nodeTest: { type: 'boolean' },
    perBug: {
      type: 'object',
      additionalProperties: false,
      required: ['bug1', 'bug2', 'bug3', 'bug4', 'bug5', 'bug6', 'bug7'],
      properties: {
        bug1: { type: 'string', enum: ['confirmed', 'failed', 'inconclusive'] },
        bug2: { type: 'string', enum: ['confirmed', 'failed', 'inconclusive'] },
        bug3: { type: 'string', enum: ['confirmed', 'failed', 'inconclusive'] },
        bug4: { type: 'string', enum: ['confirmed', 'failed', 'inconclusive'] },
        bug5: { type: 'string', enum: ['confirmed', 'failed', 'inconclusive'] },
        bug6: { type: 'string', enum: ['confirmed', 'failed', 'inconclusive'] },
        bug7: { type: 'string', enum: ['confirmed', 'failed', 'inconclusive'] },
      },
    },
    securityBug4: { type: 'string', description: 'detail: did raw DEL/ZADD/HSET against audit_log:entries get blocked AND leave data intact?' },
    overall: { type: 'string', enum: ['pass', 'fail'] },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}

const COMMON = `
Repo: ${REPO}. App: Otto (Rack 3) + Familia 2.10.1 admin API over live Valkey at 127.0.0.1:6379.
Canonical files: lib/familia/admin/{api,boot,auth,audit_log,descriptor}.rb, lib/models.rb,
resources/00-assets/routes.txt, resources/01-designs/prototype/backend-client.js,
resources/00-assets/fixtures/*.sample.json (illustrative wire shapes; values are NOT the seed data).
Models: Customer (db0, custid id, fields incl created_at/updated_at, encrypted api_secret, transient password,
collections recent_logins/feature_flags/domains/metadata/login_count, unique_index :email=>:email_lookup,
multi_index :status=>:status_index), Session (db1, sessid, created_at only), ApiKey (db0, keyid, created_at,
last_used_at, encrypted secret, participates_in Customer :api_keys).
Auth: PASETO v2.local. Mint tokens via Familia::Admin::Auth.mint(sub:, permissions:[...], role:'admin', ttl:).
Elevated permissions used by routes.txt: reveal_secrets, repair, run_migrations, raw_command. A "reduced" admin
token = role:admin with permissions:[] (no elevated). Routes gate per-permission; the client envelope 'tier' is
never trusted server-side.
Run Familia/Ruby from the repo with: cd ${REPO} && bundle exec <cmd>.
`

const AUTHOR_PROMPT = `You are the SOLE serial test-author for Phase 2 of familia-admin. You alone touch Redis right now.
${COMMON}

GOAL: author the Phase 2 contract test suite that LOCKS the wire contract and SPECIFIES the 7 corrections.
Tests assert CORRECT behavior, so the 7-bug tests will be RED against current source (that is expected and
desired — fixers make them green next). Run everything and report the baseline.

TEST HARNESS (write first, smoke before fanning out into domains):
- Tryouts v3. BEFORE writing any test, run \`cd ${REPO} && bundle exec try --help\` and consult the
  spring-tryouts skill so your comment-based expectations parse. Default to \`--agent\` output mode.
- Create a helper (e.g. try/test_helper.rb) providing an in-process Rack::Test harness against the SAME Otto
  app config.ru builds: require 'familia/admin/boot'; Familia::Admin::Boot.setup!(APP_ROOT); otto =
  Otto.new(routes_path); Familia::Admin::Auth.register!(otto); then drive it with Rack::Test (app = otto — all
  test requests are /admin/api/*, so the static/prefix wrapper is irrelevant). Provide:
    * reset_and_seed!: flush db0 AND db1, clear Familia::Admin::AuditLog.entries, then seed a SMALL deterministic
      dataset with KNOWN ids (e.g. cust_alice active / cust_bob inactive / cust_pending pending, one api_key, one
      session). Tests assert against THIS seed, not the fixtures' illustrative values. (The existing Rakefile
      db:seed task shows working seed code you may mirror.)
    * token helpers: admin (all elevated perms), reduced (role:admin, permissions:[]), and custom(perms:).
    * request helpers returning [status, parsed_json] for GET/POST/PUT/DELETE with Authorization: Bearer and JSON.
    * an SSE helper: issue the stream request, read last_response.body, parse 'data: {json}' frames → array of events.
  SMOKE IT: GET /admin/api/_meta (admin token) → 200 bare descriptor with models; a basic records.list shape.
  Only proceed once the helper round-trips green.

DOMAINS (organize into per-domain try/*_try.rb files; reset_and_seed! at the start of each so files don't
contaminate each other): discovery (_meta/models/describe_model), records (list/read/create/update/destroy/
reveal), collections (read_collection/mutate_collection), query (query_index), integrity (health_check, repair
dry-run, stream_repair SSE), migrations (status/drift/run/rollback), raw (scan_keys/inspect_key/server_info/
run_command), streams (stream_repair; stream_commands degraded-path).

INVERTED TIEBREAKER (critical — do not enshrine current buggy output): live-shape-is-truth for EVERYTHING
EXCEPT the 7 bugs below, where the SPEC is truth. For non-bug shapes assert KEYS/structure against live output
and the fixture shapes; for documented deltas assert the live shape and note it (health_check => report.to_h,
migration_status => runner.status, schema_drift => registry.schema_drift). Assert structure, not the fixtures'
illustrative literals (no count 1284, no cust_8f2a91).

THE 7 CORRECTIONS — assert CORRECT behavior:
1. query_index unique value filter: GET /models/customer/index/email_lookup?value=<seeded alice email> returns
   ONLY alice's record; a non-existent value returns 0 records. GET .../index/status_index?value=active returns
   ONLY active customers (multi bucket). (Current source returns ALL records for the unique case → RED.)
2. created_at/updated_at: POST a new customer → response has created_at AND updated_at as numbers ~= now. PUT an
   update → updated_at bumped, created_at unchanged. Only assert fields the model has (Customer has both;
   ApiKey has no updated_at; Session created_at only).
3. stream_repair healthy agreement: on CLEAN seeded data, the repair SSE 'done' event has healthy:true AND it
   AGREES with GET /integrity/customer healthy:true on identical data. (Current source diverges → RED.)
4. run_command READ-ONLY: with an admin+raw_command token, POST /raw/command {cmd:'DEL', args:['audit_log:entries'],
   force:true} → 403 {error:'command_blocked', required_tier:'permission:raw_command'} AND audit_log:entries is
   NOT mutated. Same for ZADD, HSET, ZREMRANGEBYRANK (writes hard-denied regardless of force). A read
   (cmd:'TYPE' or 'DBSIZE') still returns 200. (Current source lets force+raw_command run writes → RED.)
7. boot fail-closed: when env != development AND the dev-default PASETO/encryption keys are in use, boot must
   refuse. The current test process already booted with dev keys, so assert this via a SUBPROCESS: run something
   like \`RACK_ENV=production bundle exec ruby -e "require 'familia/admin/boot'; Familia::Admin::Boot.setup!('${REPO}')"\`
   (with $LOAD_PATH set) and assert NON-ZERO exit / raised error; the same without RACK_ENV (development) exits 0.
   (Current boot.rb has no guard → the production subprocess will exit 0 → RED.)

BUGS 5 & 6 ARE CLIENT-JS ONLY (no Ruby test can reach them). Write a node test that loads
resources/01-designs/prototype/backend-client.js into a constructed global and asserts adapter behavior:
  - Approach: in resources/01-designs/prototype/backend-client.test.mjs, set globalThis.window = { localStorage:
    a tiny in-memory shim } and globalThis.fetch = a mock; evaluate the file source (it is an IIFE using global
    window + global fetch) via node 'vm' runInThisContext or new Function; then read window.familiaBackend.
  - Assert #5: a mock fetch returning status 403, ok:false, text:()=>JSON of {error:'command_blocked',
    required_tier:'permission:raw_command'} → request({action:'raw.command',params:{cmd:'DEL'}}) RESOLVES that
    body verbatim (error === 'command_blocked'), NOT {error:'forbidden'}.
  - Assert generic-auth: status 401 with empty/unparseable body → resolves {error:'forbidden', required_tier:...}.
  - Assert #6: for a stream action (integrity.repair {stream:true}), a mock fetch returning a 302 (or
    {type:'opaqueredirect', status:0} or a 200 with non-event-stream content-type / html body) → request RESOLVES
    {error:'forbidden', required_tier:'permission:repair'} (fix will use redirect:'manual'). Your mock should
    record the init.redirect the adapter passes so you can assert it requests manual redirect after the fix —
    but the BEHAVIORAL assertion (resolves forbidden) is the one that must go red→green.
  - Regression: a 2xx SSE body (text of 'data: {json}\\n\\n' frames) still parses to the events array.
  Run it: \`node resources/01-designs/prototype/backend-client.test.mjs\`. It is RED now (adapter unfixed).

CONSTRAINTS: you write TESTS only — do NOT edit lib/ or backend-client.js. Reset+seed before each domain.
Run the full Ruby suite (\`cd ${REPO} && bundle exec try --agent try/\`) and the node test; capture baseline.
Report which bug tests are red (expected) and confirm the NON-bug suite is green. If the helper itself can't
round-trip, set helperWorks:false and explain — that blocks the whole phase.`

const BACKEND_FIX_PROMPT = `You own lib/familia/admin/api.rb and lib/familia/admin/boot.rb ONLY. You may NOT
edit any try/ file or backend-client.js. The Phase 2 Tryouts suite already exists under try/ and asserts the
correct behavior; make the backend bug tests GREEN without regressing any currently-green test. You are the only
Redis user right now.
${COMMON}

Fix these with the confirmed root causes (verified against Familia 2.10.1 source):

BUG 1 — query_index ignores value for UNIQUE indexes (data exposure). In Familia, IndexDescriptor#each_record(value:)
buckets correctly for MULTI indexes (delegates to owner.<index_name>_for(value), an UnsortedSet) but for a
class-level UNIQUE index it returns the WHOLE class hashkey and iterates ALL records — value is ignored. FIX in
#query_index: branch on cardinality. If the descriptor is unique (desc.unique? or desc.cardinality == :unique),
resolve the single record via the generated class finder: rec = klass.public_send("find_by_\#{desc.field}", value);
records = Array(rec). If multi, keep the existing desc.each_record(value: ...) path. Preserve the scan_required /
force contract for unindexed fields. (Confirmed: unique_index_generators.rb defines singleton find_by_<field>
returning one record or nil.)

BUG 2 — create/update don't set timestamps. In #create_record set created_at AND updated_at to Familia.now.to_i
for fields the model actually has (guard with klass.persistent_fields.include?(:created_at) etc.). In
#update_record set updated_at (leave created_at). Never fabricate a field the model lacks (ApiKey has no
updated_at; Session has created_at only). Set them through the same permitted/atomic_write path so they persist
and indexes stay consistent.

BUG 3 — stream_repair done.healthy disagrees with health_check on clean data. ROOT-CAUSE EMPIRICALLY before
editing: boot, reset+seed CLEAN data, hit the repair SSE and GET /integrity/customer, and determine which is
true: (a) safe{} swallowed an error so report is nil and the code falls to the phases.all?{empty?} fallback;
(b) report.healthy? genuinely returns false on clean data; (c) a phase :result is non-empty on clean data so the
fallback computes false. FIX the actual divergence so done.healthy tracks the SAME signal health_check uses on
identical data. FORBIDDEN: hardcoding healthy:true or otherwise decoupling it from the real report. Record what
you found in bug3RootCause.

BUG 4 — run_command must be READ-ONLY (closes audit-log erasure/forgery + data corruption via the raw path).
Remove the elevated write path. New rule in #run_command: allowed = READ_ONLY_COMMANDS.include?(cmd) (after
cmd.upcase). ANYTHING not in the read allowlist → return 403 {error:'command_blocked',
required_tier:'permission:raw_command'} REGARDLESS of force or permission. (force may only ever widen to more
reads; the read allowlist already enumerates them, so drop the elevated_ok branch entirely.) This must hard-deny
DEL/SET/EXPIRE/RENAME/ZADD/ZREM*/HSET/HDEL/LPUSH/RPUSH/RESTORE plus the existing HARD_DENY set, against ALL keys
incl. audit_log:entries. Keep auditing the executed (read) commands.

BUG 7 — boot fail-closed. In boot.rb add a guard: env = ENV['RACK_ENV'] || ENV['APP_ENV'] || 'development'. If
env != 'development' AND the resolved PASETO key material equals Familia::Admin::Auth::DEV_PASETO_KEY OR the
resolved encryption key equals ENCRYPTION_DEV_KEY, RAISE a clear error refusing to boot (name the offending key
+ how to override via FAMILIA_ADMIN_PASETO_KEY / FAMILIA_ADMIN_ENCRYPTION_KEY). Development (no env / 'development')
must boot unchanged so the existing rake/rackup flow keeps working. Mind load order: auth.rb is required in
load_admin!; ensure the guard can read the dev-default constants (require auth before comparing, or compare the
resolved material against the literal defaults).

Run \`cd ${REPO} && bundle exec try --agent try/\` iteratively until bugs 1,2,3,4,7 are green and nothing
regressed. ESCAPE HATCH: if a test asserts WRONG behavior (over-asserts / wrong shape / contradicts the confirmed
Familia API), do NOT contort source and do NOT edit the test — mark that bug 'test-looks-wrong' with file/line +
why; the orchestrator adjudicates. Report perBug, bug3RootCause, suiteGreen, regressions, filesChanged.`

const FRONTEND_FIX_PROMPT = `You own resources/01-designs/prototype/backend-client.js ONLY. You may NOT edit any
try/ file, the node test (resources/01-designs/prototype/backend-client.test.mjs), or lib/. A node behavioral
test for the adapter already exists; make it pass. You run only node (no Redis).
${COMMON}

BUG 5 — command_blocked passthrough. Currently any 401/403 returns {error:'forbidden'}, masking the real body.
run_command returns command_blocked as a 403. FIX: on 401/403, parse the JSON body first; if it is an object with
an 'error' code (command_blocked, scan_required, or any {error:...}), RESOLVE that body verbatim; only synthesize
{error:'forbidden', required_tier: requiredTier(env.action)} for generic/empty/unparseable auth failures.

BUG 6 — stream auth-failure. Stream routes return 302 -> /signin on denial (no response=json). The current fetch
follows redirects and swallows the signin page as a non-event body. FIX: pass redirect:'manual' on the stream
fetch; treat a 3xx status, an opaque redirect (res.type === 'opaqueredirect', status 0), a non-2xx, or a
non-event-stream content-type as {error:'forbidden', required_tier: requiredTier('integrity.repair')} (i.e.
'permission:repair'). Keep the 2xx text/event-stream parsing → events array intact (regression).

Verify: \`node resources/01-designs/prototype/backend-client.test.mjs\` must pass, and \`node --check
resources/01-designs/prototype/backend-client.js\`. ESCAPE HATCH: if the node test asserts wrong behavior, mark
the bug 'test-looks-wrong' with detail rather than contorting the adapter. Report perBug {bug5,bug6},
nodeTestPasses, filesChanged, notes.`

// ---- run -------------------------------------------------------------------
phase('Author')
const author = await agent(AUTHOR_PROMPT, { schema: AUTHOR_SCHEMA, label: 'author-tests', phase: 'Author' })

if (!author) {
  return { aborted: 'author agent returned null (died/skipped)', author: null }
}
if (!author.helperWorks) {
  return { aborted: 'test harness could not round-trip; not launching fixers', author }
}
log(`Author done. helperWorks=${author.helperWorks} nonBugSuiteGreen=${author.nonBugSuiteGreen} baseline=${JSON.stringify(author.baseline)} node=${author.nodeAdapterBaseline}`)

phase('Fix')
const [backend, frontend] = await parallel([
  () => agent(BACKEND_FIX_PROMPT, { schema: FIX_SCHEMA, label: 'fix-backend', phase: 'Fix' }),
  () => agent(FRONTEND_FIX_PROMPT, { schema: FIX_SCHEMA, label: 'fix-frontend', phase: 'Fix' }),
])
log(`Fix done. backend=${JSON.stringify(backend && backend.perBug)} frontend=${JSON.stringify(frontend && frontend.perBug)}`)

phase('Verify')
const VERIFY_PROMPT = `You are an INDEPENDENT, ADVERSARIAL verifier for Phase 2 of familia-admin. The fixers claim
the 7 bugs are fixed and the suite is green. Do not trust suite-green alone — independently confirm each bug is
genuinely fixed. You are the only Redis user now.
${COMMON}

Fixer self-reports (for context, not ground truth):
  backend.perBug = ${JSON.stringify(backend && backend.perBug)} ; bug3RootCause = ${JSON.stringify(backend && backend.bug3RootCause)} ; regressions = ${JSON.stringify(backend && backend.regressions)}
  frontend.perBug = ${JSON.stringify(frontend && frontend.perBug)}
  author baseline = ${JSON.stringify(author.baseline)} ; nodeAdapterBaseline = ${author.nodeAdapterBaseline}

1) Run the full suite: \`cd ${REPO} && bundle exec try --agent try/\` → report passed/failed counts. Run
   \`node resources/01-designs/prototype/backend-client.test.mjs\` → pass/fail.
2) Independently confirm each bug (prefer in-process Rack::Test mirroring try/test_helper.rb; if you launch a
   server use a NON-default port and kill it after):
   - bug1: reset+seed; email_lookup?value=<seeded alice> returns exactly 1 (alice); a bogus value returns 0;
     status_index?value=active returns only active customers.
   - bug2: POST a customer → created_at & updated_at set; PUT → updated_at bumped, created_at stable.
   - bug3: on clean seeded data the repair SSE done.healthy AND GET /integrity/customer healthy are BOTH true and
     agree. Also sanity-check the fix is not a hardcode (it should track the real report).
   - bug4 (SECURITY): with an admin+raw_command token, POST /raw/command {cmd:'DEL',args:['audit_log:entries'],
     force:true} → 403 command_blocked AND audit_log:entries STILL EXISTS afterward. Repeat for ZADD, HSET,
     ZREMRANGEBYRANK. Confirm a read (TYPE/DBSIZE) still returns 200. Put the finding in securityBug4.
   - bug5/bug6: via the node adapter test (command_blocked passthrough; 302/opaqueredirect → forbidden).
   - bug7: subprocess \`RACK_ENV=production bundle exec ruby -e "...Boot.setup!('${REPO}')"\` refuses (non-zero);
     development boots (zero).
3) overall = 'pass' only if the suite + node test are green AND every bug is 'confirmed'. List any blockers.
Report suite {passed,failed}, nodeTest, perBug (bug1..bug7), securityBug4, overall, blockers.`

const verify = await agent(VERIFY_PROMPT, { schema: VERIFY_SCHEMA, label: 'verify', phase: 'Verify' })

return { author, backend, frontend, verify }
