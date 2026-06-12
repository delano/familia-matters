# try/ops_try.rb
#
# OPS BASELINE domain (T6): read-only mode, destroy snapshots, the audit
# endpoint + retention trim, and the env-tunable session TTL.
#
# Read-only mode is a middleware switch read PER REQUEST, so these cases set
# FAMILIA_ADMIN_READ_ONLY / RACK_ENV around individual requests (saving and
# restoring the prior values) instead of needing separate processes per mode.
# test_helper pins RACK_ENV=development at boot; cases that exercise the
# production default flip the var after boot, which is exactly the path the
# guard reads.

require_relative 'test_helper'
reset_and_seed!

# ---------------------------------------------------------------------------
# READ-ONLY MODE -- 403 {error: read_only} on mutating methods under
# /admin/api; GETs never affected; auth endpoints exempt; production default ON.
# ---------------------------------------------------------------------------

## read-only on: POST .../records is refused 403 read_only (AC1a)
reset_and_seed!
@saved_ro = ENV['FAMILIA_ADMIN_READ_ONLY']
ENV['FAMILIA_ADMIN_READ_ONLY'] = 'on'
status, body = adm_post('/admin/api/models/customer/records',
                        { fields: { custid: 'cust_blocked', email: 'blocked@example.com',
                                    name: 'Blocked', status: 'active' } })
ENV['FAMILIA_ADMIN_READ_ONLY'] = @saved_ro
[status, body['error']]
#=> [403, "read_only"]

## read-only on: the refused create wrote nothing (record absent)
status, body = adm_get('/admin/api/models/customer/records/cust_blocked')
[status, body['error']]
#=> [404, "not_found"]

## read-only on: GET .../records is unaffected (AC1b)
@saved_ro = ENV['FAMILIA_ADMIN_READ_ONLY']
ENV['FAMILIA_ADMIN_READ_ONLY'] = 'on'
status, body = adm_get('/admin/api/models/customer/records')
ENV['FAMILIA_ADMIN_READ_ONLY'] = @saved_ro
[status, body['records'].size]
#=> [200, 3]

## read-only on: PUT and DELETE are refused 403 read_only too
@saved_ro = ENV['FAMILIA_ADMIN_READ_ONLY']
ENV['FAMILIA_ADMIN_READ_ONLY'] = 'on'
put_status, put_body = adm_put('/admin/api/models/customer/records/cust_alice',
                               { fields: { name: 'Should Not Apply' } })
del_status, del_body = adm_delete('/admin/api/models/customer/records/cust_alice')
ENV['FAMILIA_ADMIN_READ_ONLY'] = @saved_ro
[put_status, put_body['error'], del_status, del_body['error']]
#=> [403, "read_only", 403, "read_only"]

## read-only on: login (POST /admin/api/auth/) is exempt -- browsing stays possible
reset_and_seed!
clear_cookies
@saved_ro = ENV['FAMILIA_ADMIN_READ_ONLY']
ENV['FAMILIA_ADMIN_READ_ONLY'] = 'on'
status, claims = login(TEST_PASSPHRASE, ip: '127.0.0.1')
ENV['FAMILIA_ADMIN_READ_ONLY'] = @saved_ro
clear_cookies
[status, claims['sub']]
#=> [200, "admin"]

## production default: RACK_ENV=production with the var unset means read-only ON
reset_and_seed!
@saved_ro  = ENV['FAMILIA_ADMIN_READ_ONLY']
@saved_env = ENV['RACK_ENV']
ENV.delete('FAMILIA_ADMIN_READ_ONLY')
ENV['RACK_ENV'] = 'production'
status, body = adm_post('/admin/api/models/customer/records',
                        { fields: { custid: 'cust_prod', email: 'prod@example.com',
                                    name: 'Prod', status: 'active' } })
ENV['RACK_ENV'] = @saved_env
ENV['FAMILIA_ADMIN_READ_ONLY'] = @saved_ro
[status, body['error']]
#=> [403, "read_only"]

## production + FAMILIA_ADMIN_READ_ONLY=off: the operator's deliberate flip wins (AC1c)
reset_and_seed!
@saved_ro  = ENV['FAMILIA_ADMIN_READ_ONLY']
@saved_env = ENV['RACK_ENV']
ENV['FAMILIA_ADMIN_READ_ONLY'] = 'off'
ENV['RACK_ENV'] = 'production'
status, rec = adm_post('/admin/api/models/customer/records',
                       { fields: { custid: 'cust_maint', email: 'maint@example.com',
                                   name: 'Maintenance', status: 'active' } })
ENV['RACK_ENV'] = @saved_env
ENV['FAMILIA_ADMIN_READ_ONLY'] = @saved_ro
[status, rec['custid']]
#=> [200, "cust_maint"]

## development default: with both vars at the harness baseline, mutations succeed
reset_and_seed!
status, rec = adm_post('/admin/api/models/customer/records',
                       { fields: { custid: 'cust_dev', email: 'dev@example.com',
                                   name: 'Dev', status: 'active' } })
[status, rec['custid']]
#=> [200, "cust_dev"]

## active? tri-state: unrecognized values fall through to the RACK_ENV default
@saved_ro  = ENV['FAMILIA_ADMIN_READ_ONLY']
@saved_env = ENV['RACK_ENV']
ENV['FAMILIA_ADMIN_READ_ONLY'] = 'banana'
ENV['RACK_ENV'] = 'development'
dev_default = Familia::Admin::ReadOnlyGuard.active?
ENV['RACK_ENV'] = 'production'
prod_default = Familia::Admin::ReadOnlyGuard.active?
ENV['RACK_ENV'] = @saved_env
ENV['FAMILIA_ADMIN_READ_ONLY'] = @saved_ro
[dev_default, prod_default]
#=> [false, true]

# ---------------------------------------------------------------------------
# DESTROY SNAPSHOTS -- the audit entry for a destroy carries the full
# serialized record taken before deletion; encrypted fields stay [CONCEALED].
# ---------------------------------------------------------------------------

## destroy audit entry round-trips a snapshot field value through AuditLog.recent (AC2)
reset_and_seed!
adm_delete('/admin/api/models/customer/records/cust_bob')
@entry = Familia::Admin::AuditLog.recent(10).find { |e| e['action'] == 'destroy' }
[@entry['model'], @entry['id'], @entry['snapshot']['email'], @entry['snapshot']['name']]
#=> ["customer", "cust_bob", "bob@example.com", "Bob Brooks"]

## the snapshot masks encrypted fields -- no plaintext secret in the audit sink
[@entry['snapshot']['api_secret'], @entry['snapshot'].key?('password')]
#=> ["[CONCEALED]", false]

## destroying a missing record records a nil snapshot (nothing to preserve)
reset_and_seed!
status, _body = adm_delete('/admin/api/models/customer/records/nobody')
entry = Familia::Admin::AuditLog.recent(10).find { |e| e['action'] == 'destroy' }
[status, entry.key?('snapshot'), entry['snapshot']]
#=> [200, true, nil]

# ---------------------------------------------------------------------------
# AUDIT SURFACE -- GET /admin/api/audit: newest-first, auth-gated, GET-shaped
# (so it stays readable in read-only mode).
# ---------------------------------------------------------------------------

## unauthenticated GET /admin/api/audit is 401 (AC3)
get '/admin/api/audit', {}, { 'HTTP_ACCEPT' => 'application/json' }
last_response.status
#=> 401

## audit returns newest-first entries with the wire shape {entries, count, limit} (AC3)
reset_and_seed!
Familia::Admin::AuditLog.record(actor: 'op@test', action: 'older_marker')
sleep 1.1
Familia::Admin::AuditLog.record(actor: 'op@test', action: 'newer_marker')
status, body = adm_get('/admin/api/audit')
[status, body.keys.sort, body['entries'][0]['action'], body['entries'][1]['action']]
#=> [200, ["count", "entries", "limit"], "newer_marker", "older_marker"]

## audit honors ?limit= (clamped to at least 1)
status, body = adm_get('/admin/api/audit', params: { limit: 1 })
[status, body['entries'].size, body['limit'], body['entries'][0]['action']]
#=> [200, 1, 1, "newer_marker"]

## the audit view is a GET, so read-only mode does not lock operators out of it
@saved_ro = ENV['FAMILIA_ADMIN_READ_ONLY']
ENV['FAMILIA_ADMIN_READ_ONLY'] = 'on'
status, body = adm_get('/admin/api/audit')
ENV['FAMILIA_ADMIN_READ_ONLY'] = @saved_ro
[status, body['entries'].empty?]
#=> [200, false]

# ---------------------------------------------------------------------------
# RETENTION TRIM -- applied on write; keeps the newest FAMILIA_ADMIN_AUDIT_LIMIT.
# ---------------------------------------------------------------------------

## writing limit+10 entries leaves exactly limit in the sink (AC4)
reset_and_seed!
@saved_limit = ENV['FAMILIA_ADMIN_AUDIT_LIMIT']
ENV['FAMILIA_ADMIN_AUDIT_LIMIT'] = '20'
30.times { |i| Familia::Admin::AuditLog.record(actor: 'trim@test', action: "fill_#{i}") }
count = Familia::Admin::AuditLog.recent(100).size
ENV['FAMILIA_ADMIN_AUDIT_LIMIT'] = @saved_limit
count
#=> 20

## the trim drops the OLDEST entries (time-separated writes, limit 2)
reset_and_seed!
@saved_limit = ENV['FAMILIA_ADMIN_AUDIT_LIMIT']
ENV['FAMILIA_ADMIN_AUDIT_LIMIT'] = '2'
Familia::Admin::AuditLog.record(actor: 't', action: 'first')
sleep 1.1
Familia::Admin::AuditLog.record(actor: 't', action: 'second')
sleep 1.1
Familia::Admin::AuditLog.record(actor: 't', action: 'third')
actions = Familia::Admin::AuditLog.recent(10).map { |e| e['action'] }
ENV['FAMILIA_ADMIN_AUDIT_LIMIT'] = @saved_limit
actions
#=> ["third", "second"]

## an unset/garbage/zero limit falls back to the 10_000 default (never trims to nothing)
@saved_limit = ENV['FAMILIA_ADMIN_AUDIT_LIMIT']
ENV.delete('FAMILIA_ADMIN_AUDIT_LIMIT')
unset_v = Familia::Admin::AuditLog.retention_limit
ENV['FAMILIA_ADMIN_AUDIT_LIMIT'] = 'banana'
garbage_v = Familia::Admin::AuditLog.retention_limit
ENV['FAMILIA_ADMIN_AUDIT_LIMIT'] = '0'
zero_v = Familia::Admin::AuditLog.retention_limit
ENV['FAMILIA_ADMIN_AUDIT_LIMIT'] = @saved_limit
[unset_v, garbage_v, zero_v]
#=> [10000, 10000, 10000]

# ---------------------------------------------------------------------------
# SESSION TTL -- FAMILIA_ADMIN_SESSION_TTL drives the minted session's expiry
# AND the cookie max-age; default (3600) unchanged when unset.
# ---------------------------------------------------------------------------

## FAMILIA_ADMIN_SESSION_TTL drives login exp and the cookie max-age together
reset_and_seed!
clear_cookies
@saved_ttl = ENV['FAMILIA_ADMIN_SESSION_TTL']
ENV['FAMILIA_ADMIN_SESSION_TTL'] = '120'
status, claims = login(TEST_PASSPHRASE, ip: '127.0.0.1')
delta = claims['exp'].to_i - Time.now.to_i
attrs = set_cookie_attrs
ENV['FAMILIA_ADMIN_SESSION_TTL'] = @saved_ttl
clear_cookies
[status, delta.between?(110, 121), attrs.include?('max-age=120')]
#=> [200, true, true]

## unset: the default TTL is unchanged at DEFAULT_TTL (3600)
@saved_ttl = ENV['FAMILIA_ADMIN_SESSION_TTL']
ENV.delete('FAMILIA_ADMIN_SESSION_TTL')
v = Familia::Admin::Auth.session_ttl
ENV['FAMILIA_ADMIN_SESSION_TTL'] = @saved_ttl
[v, Familia::Admin::Auth::DEFAULT_TTL]
#=> [3600, 3600]

## garbage or zero TTL values fall back to the default (no instant-expiry sessions)
@saved_ttl = ENV['FAMILIA_ADMIN_SESSION_TTL']
ENV['FAMILIA_ADMIN_SESSION_TTL'] = 'banana'
garbage_v = Familia::Admin::Auth.session_ttl
ENV['FAMILIA_ADMIN_SESSION_TTL'] = '0'
zero_v = Familia::Admin::Auth.session_ttl
ENV['FAMILIA_ADMIN_SESSION_TTL'] = @saved_ttl
[garbage_v, zero_v]
#=> [3600, 3600]
