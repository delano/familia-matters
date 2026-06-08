export const meta = {
  name: 'familia-admin-phase1',
  description: 'Phase 1: implement api.rb TODO actions + fix response layer (Agent A) and rewrite the frontend transport to real HTTP/SSE (Agent B), then integration-verify the full surface',
  phases: [
    { title: 'Implement' },
    { title: 'Integration verify' },
  ],
}

const ROOT = '/Users/d/Projects/dev/delano/familia-admin'

const API_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['file', 'response_layer_fixed', 'actions_implemented', 'audit_wired', 'self_verify', 'blockers'],
  properties: {
    file: { type: 'string' },
    response_layer_fixed: { type: 'string', description: 'what you changed in the json helper + how many call sites braced; confirm reads now return bare shapes' },
    actions_implemented: { type: 'array', items: { type: 'string' }, description: 'each TODO action you implemented' },
    familia_apis_used: { type: 'string', description: 'exact Familia method names used for build/update/collection-ops/scan, verified from source' },
    security_notes: { type: 'string', description: 'run_command allowlist policy, reveal gating, what gets audited' },
    audit_wired: { type: 'boolean', description: 'audit! now writes to Familia::Admin::AuditLog' },
    self_verify: { type: 'string', description: 'per-endpoint curl results you observed (status + brief body) for the new/changed actions' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}

const FE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['file', 'action_map', 'auth_injection', 'denial_mapping', 'streaming_handling', 'syntax_ok', 'covers_all_store_actions', 'blockers'],
  properties: {
    file: { type: 'string', description: 'the file(s) you wrote' },
    action_map: { type: 'string', description: 'the action->{method,path,body} mapping you implemented' },
    auth_injection: { type: 'string', description: 'where the PASETO bearer token comes from and how it is sent' },
    denial_mapping: { type: 'string', description: 'how HTTP 401/403 maps to {error:forbidden, required_tier}' },
    streaming_handling: { type: 'string', description: 'how stream actions consume SSE and resolve Promise<array>' },
    syntax_ok: { type: 'boolean', description: 'node --check passed' },
    covers_all_store_actions: { type: 'boolean', description: 'every action string the stores emit has a mapping' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}

const IVERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['boots', 'reads_bare_shape', 'mutations_ok', 'reveal_ok_and_audited', 'raw_ok', 'integrity_ok', 'streaming_ok', 'gating_ok', 'adapter_ok', 'failures'],
  properties: {
    boots: { type: 'boolean' },
    reads_bare_shape: { type: 'boolean', description: 'GET _meta / models / records return BARE fixture shapes (no {success,data} wrapper)' },
    mutations_ok: { type: 'boolean', description: 'create bumps list, update changes a field, destroy drops it' },
    reveal_ok_and_audited: { type: 'boolean', description: 'admin reveal returns plaintext once AND an AuditLog entry was written' },
    collection_mutation_ok: { type: 'boolean' },
    raw_ok: { type: 'boolean', description: 'scan_keys/inspect_key/server_info work; run_command allows PING, denies FLUSHALL without elevated+force' },
    integrity_ok: { type: 'boolean', description: 'health_check + repair dry_run return correct shapes' },
    streaming_ok: { type: 'boolean', description: 'GET /admin/api/stream/repair/:model streams SSE events ending in a done event' },
    query_ok: { type: 'boolean', description: 'query_index on email_lookup returns records; non-indexed field returns scan_required' },
    gating_ok: { type: 'boolean', description: 'reduced token denied on reveal/repair/run_command' },
    adapter_ok: { type: 'boolean', description: 'backend-client.js passes node --check and maps every store action' },
    failures: { type: 'array', items: { type: 'string' }, description: 'every failing check with status+body; empty if all pass' },
    notes: { type: 'string' },
  },
}

phase('Implement')
const [apiResult, feResult] = await parallel([
  () => agent(
`You OWN lib/familia/admin/api.rb in ${ROOT}. Edit ONLY that file. Do NOT touch backend-client.js, routes.txt, boot.rb, auth.rb, audit_log.rb, models, config.ru. This is Phase 1 of bringing a Familia admin prototype onto a real Otto backend; the app already boots (Phase 0). Be correct and verify against running code.

## FIRST: fix the response layer (foundational — every action is currently broken on Ruby 3.4)
Two confirmed bugs (verified by booting the app):
1) Ruby 3.4 kwargs: \`def json(payload, status: 200)\` + call sites like \`json(models: [...])\` make Ruby bind the braceless hash as keyword args -> ArgumentError 'given 0, expected 1'. 500s every action that passes an inline hash.
2) Double-encode: Otto's JSONHandler (verified in /Users/d/Projects/dev/delano/otto/lib/otto/response_handlers/json.rb) serializes a RETURNED Hash BARE (data = result when result.is_a?(Hash)); only non-Hash/nil returns get wrapped as {success:true, data:...}. api.rb currently does \`@res.body = payload.to_json\` and returns the String, so Otto wraps it -> {"success":true,"data":"...escaped..."}. The frontend reads bare fields (res.records, res.count_fast), so the body MUST be the bare shape.
FIX: rewrite the json helper to set status and RETURN the Hash, e.g.:
  def json(payload, status: 200); @res.status = status; payload; end
(Otto base.rb ensure_status_set only sets a default when status is unset/zero, so a pre-set 404/400 is preserved.) Then brace EVERY inline-hash call site: \`json({ model:..., records:... })\`, \`json({ models: ... })\`, \`json({ field => value })\`, etc. not_found/bad_request already pass braced hashes — keep them, they now return the hash with status set. After this, GET /admin/api/_meta, /models, /models/customer/records must return BARE JSON (HTTP 200), no success/data wrapper. Verify with curl before moving on.

## THEN implement the TODO actions (read Familia 2.10.1 source for exact APIs; do not guess)
Source: /Users/d/Projects/dev/delano/familia/lib/familia/ . DataType op names live in lib/familia/data_type/types/{listkey,unsorted_set,sorted_set,hashkey,counter}.rb. Verified class/instance methods exist: klass.build(*, **) (management.rb:169), instance atomic_write(update_expiration:, watch_keys:, pre_check:) (horreum/atomic_write.rb:101), transaction, load_multi, find_by_identifier, count, field_types, persistent_fields. Encryption: ConcealedString#reveal REQUIRES a block (reveal { |v| ... }).

- create_record (POST .../records, body {fields:{...}}): atomic create-only via klass.build(**permitted_fields). Set/echo identifier. Return the created record serialized (same shape as read) so the frontend's res.created||res.record||res works; include count_fast (klass.count) so the list count bumps. Audit :create.
- update_record (PUT .../records/:id, body {fields:{...}}): load via find_by_identifier; assign permitted fields; persist field+index changes via the instance's atomic_write (read horreum/atomic_write.rb for the exact block form). Return the updated record serialized. Audit :update.
- mutate_collection (POST .../:collection, body {op:, args:}): resolve rec.send(collection) -> a DataType; dispatch an ALLOWLISTED op (add, push, unshift, remove/remove_element, increment, and hash set) to the native method, inside a transaction/atomic_write. Reject unknown ops with bad_request. Return the post-mutation members (or the new size). Audit :mutate_collection.
- query_index: keep the indexed path. ADD: when the requested field has no queryable index and force is not truthy, return { error: 'scan_required', hint: 'add an index or pass force=true', estimated_rows: <best-effort, e.g. klass.count> } so the frontend's scan_required UI fires. (The frontend sends params.index, params.field, params.value, params.force.)
- reveal_field: fix the missing block — capture plaintext via rec.send(field).reveal { |v| v }. Keep the encrypted-only guard. Return { field_name => plaintext } and include "_audit" from the audit entry. Audit :reveal.
- scan_keys (GET /raw/keys?pattern&type&cursor): SCAN cursor (NEVER KEYS) via Familia.dbclient; per key return {key, type (TYPE), ttl (TTL)}; map key->{model,id} when it matches a known key_pattern. Return {keys:[...], cursor, scanned, matched}.
- inspect_key (GET /raw/key?key=): TYPE/TTL + a typed value preview (and MEMORY USAGE if available). Return {key, type, ttl, db, memory, value, model?, id?}.
- server_info (GET /raw/info): Familia.dbclient.info parsed into sections -> {server:{...}, memory:{...}, clients:{...}, stats:{...}, keyspace:{...}}.
- run_command (POST /raw/command, body {cmd, args, force}): THE DANGEROUS PATH. Allowlist read-only commands (e.g. GET, TYPE, TTL, SCAN, HGETALL, LRANGE, ZRANGE, SMEMBERS, INFO, DBSIZE, MEMORY, EXISTS, OBJECT...). DENY KEYS, FLUSHALL, FLUSHDB, CONFIG, SHUTDOWN, DEBUG, SAVE, BGSAVE, MIGRATE, SCRIPT, EVAL and anything not on the allowlist unless the route already granted permission:raw_command AND the request passes force=true; even then keep KEYS/FLUSH*/CONFIG/SHUTDOWN/DEBUG hard-denied (return {error:'command_blocked', required_tier:'permission:raw_command'}). Execute allowed commands via Familia.dbclient. Return {cmd, args, result, simulated:false, forced:!!force}. Audit every executed command.
- stream_commands (GET /admin/api/stream/commands — NOT response=json; DefaultHandler lets you own the body): a Rack 3 streaming body. Build a body object responding to #each that yields Server-Sent Events ("data: <json>\\n\\n"). Subscribe to live Redis commands via Familia::Instrumentation.on_command if present (read familia source to confirm the hook name/signature); emit each as an SSE event; flush a heartbeat/comment periodically; stop cleanly. If no instrumentation hook exists, emit a single SSE event saying so and end — record that in blockers. Set Content-Type: text/event-stream, Cache-Control: no-cache via @res.
- stream_repair (GET /admin/api/stream/repair/:model — NOT response=json): Rack 3 streaming body emitting the repair progress as SSE. Match the event shape in resources/00-assets/fixtures/stream_repair.sample.jsonl: a start event, then {phase, current, total, index|collection?, result?} per phase, then {event:'done', healthy, at, summary:{...}}. Drive it from klass.repair_all!/health_check progress if it yields progress; otherwise compute phases from the health_check report and emit them. Audit :repair.

## Wire the audit sink
Replace audit!'s \`warn(...)\` with Familia::Admin::AuditLog.record(actor: actor, action: action, **details) (keep returning the entry; a debug warn is fine too). AuditLog.record/recent already exist (Phase 0).

## Authorization
Otto already enforces role:admin / permission:* from routes.txt BEFORE your action runs. Read the actor from env['otto.strategy_result'] (the existing actor helper). NEVER consult the client envelope 'tier'. Do not re-check permissions you weren't given.

## Self-verify (REQUIRED) before returning
Boot the app and curl the changed/new endpoints with a real admin token. Defaults are baked in (no env needed): seed with \`bundle exec rake db:seed\`; mint admin token with \`bundle exec rake auth:token\` (capture the printed token); boot in background within one shell command (\`bundle exec rackup -o 127.0.0.1 -p 9301 config.ru >/tmp/p1a.log 2>&1 & SRV=$!; sleep 4; <curls -H "Authorization: Bearer $TOKEN">; kill $SRV\`); print /tmp/p1a.log on any failure. Confirm: reads are bare-shaped; create/update/destroy; reveal returns plaintext + audit; a raw scan; run_command PING allowed and FLUSHALL denied; the stream/repair route emits SSE. Report what you actually observed in self_verify. Use a port unlikely to collide (9301).`,
    { label: 'api.rb', phase: 'Implement', schema: API_SCHEMA }
  ),
  () => agent(
`You OWN the frontend transport in ${ROOT}/resources/01-designs/prototype/. Edit backend-client.js (you MAY add one small sibling helper file, e.g. backend-http.js, but window.familiaBackend.request(envelope) must keep its signature and Promise<json> contract). Edit ONLY files under resources/01-designs/prototype/. This swaps the in-browser LLM simulator for real HTTP calls to the Otto backend — the single integration point.

## Read the real call sites FIRST (extract exact action strings + param shapes)
- resources/01-designs/records/store.jsx (records.list/read/create/update/destroy/reveal, query.index)
- resources/01-designs/migrations/store.jsx (migrations.status/drift/run/rollback)
- resources/01-designs/explorer/store.jsx (raw.* actions — exact names + params)
- resources/01-designs/integrity-console/IntegrityConsole.jsx (integrity.check/repair, incl. {stream:true})
- resources/01-designs/models/App.jsx (meta, records.list count)
The stores are shape-forgiving (res.record||res, res.created||res.record||res, res.plaintext||res.value||res[field], res.count_fast). Responses from the server are now BARE fixture shapes (NOT wrapped in {success,data}).

## Replace the transport: action -> REST fetch
Keep the current standalone/embedded plumbing only if harmless; the cross-screen guarantee now holds via the shared Redis, so the postMessage bridge is unnecessary — make request() do real HTTP directly (same-origin; base path '' so /admin/api/* hits the serving app; allow override via window.FAMILIA_ADMIN_API_BASE). Map each action to method+path+query/body (verify paths against resources/00-assets/routes.txt):
- meta -> GET /admin/api/_meta
- records.list {model,params{offset,limit}} -> GET /admin/api/models/{model}/records?offset&limit
- records.read {model,id} -> GET /admin/api/models/{model}/records/{id}
- records.create {model,record} -> POST /admin/api/models/{model}/records  body {fields: record}
- records.update {model,id,changes} -> PUT /admin/api/models/{model}/records/{id}  body {fields: changes}
- records.destroy {model,id} -> DELETE /admin/api/models/{model}/records/{id}
- records.reveal {model,id,field} -> POST /admin/api/models/{model}/records/{id}/reveal/{field}
- query.index {model,params{index,field,value,force}} -> GET /admin/api/models/{model}/index/{index||field}?value&force
- integrity.check {model} -> GET /admin/api/integrity/{model}
- integrity.repair {model,params{dry_run,stream}} -> dry_run truthy: POST /admin/api/integrity/{model}/repair?dry_run=true ; stream truthy: GET /admin/api/stream/repair/{model} (SSE, see below) ; else POST /admin/api/integrity/{model}/repair
- migrations.status -> GET /admin/api/migrations
- migrations.drift -> GET /admin/api/migrations/drift
- migrations.run {params{id,dry_run,stream,limit}} -> POST /admin/api/migrations/run?dry_run&limit  body {id}
- migrations.rollback {params{id}} -> POST /admin/api/migrations/rollback  body {id}
- raw.scan_keys {params{pattern,type,cursor}} -> GET /admin/api/raw/keys?pattern&type&cursor
- raw.inspect_key {params{key}} -> GET /admin/api/raw/key?key
- raw.info -> GET /admin/api/raw/info
- raw.command {params{cmd,args,force}} -> POST /admin/api/raw/command  body {cmd,args,force}
(If a store uses a slightly different action string, honor what the store actually sends.)

## Auth, denial, streaming, errors
- Auth: read a PASETO bearer token from window.FAMILIA_ADMIN_TOKEN (fallback localStorage 'familia_admin_token'); send header Authorization: Bearer <token> on every request. Provide window.familiaBackend.setToken(t). DROP the envelope 'tier' from anything sent to the server (it is client-only).
- Denials: HTTP 401/403 -> resolve (do NOT reject) with { error: 'forbidden', required_tier: <the permission for that action, e.g. 'permission:reveal_secrets'> } so the gated UI states (migrations dryRun/apply check isError(res,'forbidden') + required_tier; integrity noperm) render. Maintain an action->required_tier map for this.
- Other non-2xx with a JSON body containing error -> resolve with the parsed JSON (stores check res.error, e.g. 'scan_required', 'command_blocked'). Network failure / fetch throw -> rethrow (stores catch and fall back to their offline mirror).
- Streaming (integrity.repair {stream:true} -> the SSE route): fetch the text/event-stream, read the body to completion (ReadableStream reader or response.text() then split on blank lines), parse each \`data: {json}\` line into an event, and RESOLVE with the ARRAY of events (the stores/console animate the array with timers — minimal divergence). Optionally accept an onEvent callback for live progress but the Promise<array> is the contract.
- 2xx -> parse JSON and resolve with the bare object/array.

## Verify before returning
Run \`node --check\` on every JS file you wrote (and confirm it parses). Cross-check that EVERY action string the five files above emit has a mapping (list any gaps in blockers). You cannot run the full browser flow here; the integration-verify step will. Return strictly per schema.`,
    { label: 'backend-client.js', phase: 'Implement', schema: FE_SCHEMA }
  ),
])

phase('Integration verify')
const verify = await agent(
`Integration-verify Phase 1 of familia-admin in ${ROOT} against live Valkey. Two agents just finished: Agent A implemented lib/familia/admin/api.rb, Agent B rewrote resources/01-designs/prototype/backend-client.js.

Agent A self-verify said: ${apiResult ? apiResult.self_verify : '(api agent failed)'}
Agent A blockers: ${apiResult ? JSON.stringify(apiResult.blockers) : '(failed)'}
Agent B action_map: ${feResult ? feResult.action_map : '(fe agent failed)'}
Agent B blockers: ${feResult ? JSON.stringify(feResult.blockers) : '(failed)'}

Do NOT edit api.rb or backend-client.js. You may only read + run. Steps (capture REAL output; print /tmp/p1v.log on any boot/probe failure):
1. \`bundle exec rake db:seed\` (defaults baked in). Mint tokens: ADMIN=\`bundle exec rake auth:token\` (capture printed token), REDUCED=\`bundle exec rake auth:token:reveal_only\`.
2. Boot the server in the background on 127.0.0.1:9302 within single shell commands and probe (\`bundle exec rackup -o 127.0.0.1 -p 9302 config.ru >/tmp/p1v.log 2>&1 & SRV=$!; sleep 4; <curls>; kill $SRV\`). All curls use -H "Authorization: Bearer $ADMIN" unless testing gating.
3. Probes — record status + a body excerpt for each:
   a. READS BARE: GET /admin/api/_meta and /admin/api/models/customer/records must be HTTP 200 and TOP-LEVEL bare shapes (e.g. {"models":[...]}, {"model":"customer","records":[...]}) with NO {"success":...,"data":...} wrapper. (reads_bare_shape)
   b. MUTATIONS: POST /admin/api/models/customer/records {fields:{email,name,status}} -> created; GET records shows count_fast bumped / the new row present; PUT that record {fields:{status:'inactive'}} -> changed; DELETE it -> gone. (mutations_ok)
   c. REVEAL+AUDIT: POST /admin/api/models/customer/records/cust_alice/reveal/api_secret with ADMIN -> 200 with a plaintext value for api_secret. Then confirm an audit entry exists (boot a tiny ruby check: \`bundle exec ruby -r./config -e ...\` is awkward; instead require the app's boot + Familia::Admin::AuditLog.recent, or redis-cli ZCARD on the audit zset key). (reveal_ok_and_audited)
   d. COLLECTION: POST /admin/api/models/customer/records/cust_alice/feature_flags {op:'add',args:['vip']} -> ok; GET that collection shows 'vip'. (collection_mutation_ok)
   e. RAW: GET /admin/api/raw/keys -> keys with type+ttl; GET /admin/api/raw/info -> sections; POST /admin/api/raw/command {cmd:'PING'} -> allowed; POST {cmd:'FLUSHALL'} (even with force:true) -> command_blocked. (raw_ok)
   f. INTEGRITY: GET /admin/api/integrity/customer -> health report; POST /admin/api/integrity/customer/repair?dry_run=true -> dry-run report. (integrity_ok)
   g. STREAM: GET /admin/api/stream/repair/customer with ADMIN (use \`curl -N --max-time 10\`) -> a text/event-stream with one or more \`data: {...}\` events ending in a done event. (streaming_ok)
   h. QUERY: GET /admin/api/models/customer/index/email_lookup?value=<a seeded email> -> records; a non-indexed field query -> {"error":"scan_required"}. (query_ok)
   i. GATING: with REDUCED token, the reveal route, the repair route, and the raw/command route each return 401/403 (denied); with ADMIN they are NOT auth-denied. (gating_ok)
4. ADAPTER: \`node --check resources/01-designs/prototype/backend-client.js\` (and any sibling helper). Grep the stores to confirm every action string is mapped. (adapter_ok)
5. Report strictly per schema. Put EVERY failing check (with status + body excerpt) into failures[]. Do not mark a field true unless you observed it pass.`,
  { label: 'integration-verify', phase: 'Integration verify', schema: IVERIFY_SCHEMA }
)

return { apiResult, feResult, verify }