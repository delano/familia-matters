# try/raw_try.rb
#
# RAW EXPLORER domain: scan_keys / inspect_key / server_info / run_command.
# SPECIFIES bug #4 -- run_command must be READ-ONLY. With an admin+raw_command
# token, a write command (DEL/ZADD/HSET/ZREMRANGEBYRANK) must be hard-denied
# (403 command_blocked), and the target must NOT be mutated. Reads (TYPE/DBSIZE)
# still return 200.
#
# There is NO escalation parameter: the former `force` body key never widened
# the allowlist, so it was removed end-to-end in T5 (request, audit entry,
# response). A stray legacy `force` key must be ignored -- never echoed back as
# a `forced` field implying an override that does not exist.
#
# "not mutated" is load-bearing: a probe key is seeded with a KNOWN value first,
# so a successful (buggy) write is observable as a change.

require_relative 'test_helper'
reset_and_seed!

@raw_token = custom_token(perms: %w[raw_command])

## scan_keys returns a SCAN page: keys[] + cursor + counts (bare shape)
status, body = adm_get('/admin/api/raw/keys', params: { pattern: 'customer:*' })
[status, body.keys.sort, body['keys'].is_a?(Array)]
#=> [200, ["cursor", "keys", "matched", "scanned"], true]

## inspect_key returns TYPE/TTL + a typed value preview for a real key
reset_and_seed!
status, body = adm_get('/admin/api/raw/key', params: { key: 'customer:cust_alice:object' })
[status, body['type'], body['value'].is_a?(Hash)]
#=> [200, "hash", true]

## inspecting a non-existent key is 404
status, body = adm_get('/admin/api/raw/key', params: { key: 'customer:ghost:object' })
[status, body['resource']]
#=> [404, "key"]

## server_info returns parsed INFO sections
reset_and_seed!
status, body = adm_get('/admin/api/raw/info')
[status, body.key?('server'), body.key?('memory'), body.key?('keyspace')]
#=> [200, true, true, true]

# ---------------------------------------------------------------------------
# run_command reads are always allowed.
# ---------------------------------------------------------------------------

## a read command (TYPE) returns 200 with the result
reset_and_seed!
status, body = adm_post('/admin/api/raw/command', { cmd: 'TYPE', args: ['customer:cust_alice:object'] }, @raw_token)
[status, body['cmd'], body['result']]
#=> [200, "TYPE", "hash"]

## a read command (DBSIZE) returns 200
reset_and_seed!
status, body = adm_post('/admin/api/raw/command', { cmd: 'DBSIZE', args: [] }, @raw_token)
[status, body['result'].is_a?(Numeric)]
#=> [200, true]

## a stray legacy force key in the body is IGNORED: the read still runs, and
## neither the response nor the audit entry carries a forced field (T5)
reset_and_seed!
status, body = adm_post('/admin/api/raw/command',
                        { cmd: 'TYPE', args: ['customer:cust_alice:object'], force: true }, @raw_token)
@entry = Familia::Admin::AuditLog.recent(1).first
[status, body.key?('forced'), @entry['action'], @entry.key?('forced')]
#=> [200, false, "run_command", false]

# ---------------------------------------------------------------------------
# Bug #4 -- writes are hard-denied and the target is NOT mutated. A stray
# legacy force key on a write must not change the outcome either.
# ---------------------------------------------------------------------------

## DEL is 403 command_blocked and the probe key SURVIVES (bug #4)
reset_and_seed!
Familia.dbclient.set('probe:bug4:del', 'present')
status, body = adm_post('/admin/api/raw/command',
                        { cmd: 'DEL', args: ['probe:bug4:del'] }, @raw_token)
[status, body['error'], body['required_tier'], Familia.dbclient.get('probe:bug4:del')]
#=> [403, "command_blocked", "permission:raw_command", "present"]

## a blocked write (DEL audit_log:entries) leaves the audit sink intact AND adds
## no run_command audit entry -- the deny path returns before auditing (bug #4)
reset_and_seed!
Familia::Admin::AuditLog.record(actor: 'seed', action: 'probe')
@audit_before = Familia::Admin::AuditLog.entries.size
status, body = adm_post('/admin/api/raw/command', { cmd: 'DEL', args: ['audit_log:entries'] }, @raw_token)
[status, body['error'], Familia::Admin::AuditLog.entries.size == @audit_before]
#=> [403, "command_blocked", true]

## ZADD with a stray force:true is STILL 403 command_blocked and the probe zset
## is UNCHANGED -- the legacy key escalates nothing (bug #4 / T5)
reset_and_seed!
Familia.dbclient.del('probe:bug4:zset')
Familia.dbclient.zadd('probe:bug4:zset', 1, 'orig')
status, body = adm_post('/admin/api/raw/command',
                        { cmd: 'ZADD', args: ['probe:bug4:zset', '2', 'intruder'], force: true }, @raw_token)
[status, body['error'], Familia.dbclient.zcard('probe:bug4:zset')]
#=> [403, "command_blocked", 1]

## HSET is 403 command_blocked and the probe hash is UNCHANGED (bug #4)
reset_and_seed!
Familia.dbclient.del('probe:bug4:hash')
Familia.dbclient.hset('probe:bug4:hash', 'keep', 'yes')
status, body = adm_post('/admin/api/raw/command',
                        { cmd: 'HSET', args: ['probe:bug4:hash', 'sneak', 'no'] }, @raw_token)
[status, body['error'], Familia.dbclient.hexists('probe:bug4:hash', 'sneak')]
#=> [403, "command_blocked", false]

## ZREMRANGEBYRANK is 403 command_blocked and the probe zset is UNCHANGED (bug #4)
reset_and_seed!
Familia.dbclient.del('probe:bug4:zrem')
Familia.dbclient.zadd('probe:bug4:zrem', 1, 'a')
Familia.dbclient.zadd('probe:bug4:zrem', 2, 'b')
status, body = adm_post('/admin/api/raw/command',
                        { cmd: 'ZREMRANGEBYRANK', args: ['probe:bug4:zrem', '0', '-1'] }, @raw_token)
[status, body['error'], Familia.dbclient.zcard('probe:bug4:zrem')]
#=> [403, "command_blocked", 2]

# ---------------------------------------------------------------------------
# HARD_DENY commands stay blocked (independent of bug #4 fix).
# ---------------------------------------------------------------------------

## FLUSHDB is hard-denied (403)
reset_and_seed!
status, body = adm_post('/admin/api/raw/command', { cmd: 'FLUSHDB', args: [] }, @raw_token)
[status, body['error']]
#=> [403, "command_blocked"]

## an empty cmd is a 400 bad_request
status, body = adm_post('/admin/api/raw/command', { cmd: '', args: [] }, @raw_token)
[status, body['error']]
#=> [400, "bad_request"]
