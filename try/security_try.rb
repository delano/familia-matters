# try/security_try.rb
#
# PHASE 3 SECURITY GATE. Adversarial assertions that pin the fixes for the
# defects the Phase-2 7-bug list never covered. Each case encodes the POST-FIX
# expected behavior and is RED against the pre-fix source (the regression proof).
# Uses only the shared harness helpers; does not weaken any other try/ file.
#
# Coverage:
#   - collection dispatch  : :collection segment is allowlisted, not sent raw
#   - record field integrity: identifier + created_at unwritable; unique-index hijack
#   - reveal / raw exposure : raw/key honors the [CONCEALED] mask; reveal stays gated
#   - raw allowlist         : oversized reads are bounded (memory DoS guard)
#   - authz / transport     : token tamper / downgrade / garbage / expired / no-exp
#   - audit trail           : rejected dispatch leaves no trace; real mutation audits

require_relative 'test_helper'
reset_and_seed!

# ===========================================================================
# COLLECTION DISPATCH (critical): rec.send(param(:collection)) was unguarded.
# A method-named path segment must be rejected as an unknown collection, never
# invoked. Asserted by the record SURVIVING (no side effect fired).
# ===========================================================================

## GET naming a destructive instance method (destroy!) is rejected, not executed
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/records/cust_alice/destroy!')
survived, = adm_get('/admin/api/models/customer/records/cust_alice')
[status, body['resource'], survived]
#=> [404, "collection", 200]

## GET naming delete! / clear is likewise rejected and the record survives
reset_and_seed!
adm_get('/admin/api/models/customer/records/cust_alice/clear')
survived, = adm_get('/admin/api/models/customer/records/cust_alice')
survived
#=> 200

## a generated relationship bang-method cannot stealth-remove the record from its timeline
reset_and_seed!
adm_get('/admin/api/models/customer/records/cust_alice/remove_from_instances!')
_s, list = adm_get('/admin/api/models/customer/records')
list['records'].map { |r| r['custid'] }.include?('cust_alice')
#=> true

## POST (mutate path) naming destroy! is rejected before any side effect
reset_and_seed!
status, body = adm_post('/admin/api/models/customer/records/cust_alice/destroy!', { op: 'add', args: ['x'] })
survived, = adm_get('/admin/api/models/customer/records/cust_alice')
[status, body['resource'], survived]
#=> [404, "collection", 200]

## a real instance collection (feature_flags) still reads (allowlist regression guard)
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/records/cust_alice/feature_flags')
[status, body['members'].sort]
#=> [200, ["beta_ui", "streaming"]]

## a participation-target collection (api_keys) is in the allowlist and reads
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/records/cust_alice/api_keys')
[status, body['members'].include?('key_alice_1')]
#=> [200, true]

# ===========================================================================
# RECORD FIELD INTEGRITY: update must not rewrite identity, hijack a unique
# index, or forge created_at.
# ===========================================================================

## PUT cannot rewrite the identifier field onto another record's key (no clobber)
reset_and_seed!
adm_put('/admin/api/models/customer/records/cust_bob', { fields: { custid: 'cust_alice', name: 'PWNED' } })
_s, alice = adm_get('/admin/api/models/customer/records/cust_alice')
[alice['name'], alice['custid']]
#=> ["Alice Adams", "cust_alice"]

## a PUT whose only field is the identifier is empty after stripping it -> 400
reset_and_seed!
status, body = adm_put('/admin/api/models/customer/records/cust_alice', { fields: { custid: 'evil' } })
[status, body['error']]
#=> [400, "bad_request"]

## PUT changing email onto another record's unique-index value is rejected (409)
reset_and_seed!
status, body = adm_put('/admin/api/models/customer/records/cust_bob', { fields: { email: 'alice@example.com' } })
[status, body['error']]
#=> [409, "record_exists"]

## a non-colliding email change is still allowed
reset_and_seed!
status, after = adm_put('/admin/api/models/customer/records/cust_bob', { fields: { email: 'fresh@example.com' } })
[status, after['email']]
#=> [200, "fresh@example.com"]

## update ignores a client-supplied created_at; updated_at still bumps
reset_and_seed!
_s, before = adm_get('/admin/api/models/customer/records/cust_alice')
@oc = before['created_at'].to_i
@ou = before['updated_at'].to_i
sleep 1
adm_put('/admin/api/models/customer/records/cust_alice', { fields: { created_at: 1, name: 'Renamed' } })
_s2, after = adm_get('/admin/api/models/customer/records/cust_alice')
[after['created_at'].to_i == @oc, after['created_at'].to_i != 1, after['updated_at'].to_i > @ou]
#=> [true, true, true]

# ===========================================================================
# REVEAL / RAW EXPOSURE: raw/key must mask encrypted fields exactly like the
# structured serializer, and must not be a back door around reveal gating.
# ===========================================================================

## raw/key masks encrypted fields for a model-mapped hash (matches serialize)
reset_and_seed!
status, body = adm_get('/admin/api/raw/key', reduced_token, params: { key: 'customer:cust_alice:object' })
[status, body['type'], body['value']['api_secret']]
#=> [200, "hash", "[CONCEALED]"]

## the reveal route stays gated for a token without reveal_secrets (mask is not a bypass)
reset_and_seed!
status, = adm_post('/admin/api/models/customer/records/cust_alice/reveal/api_secret', {}, reduced_token)
status
#=> 401

# ===========================================================================
# RAW ALLOWLIST: an allowlisted read must be bounded so it is not a memory-DoS
# primitive.
# ===========================================================================

## an oversized read is capped with a truncated flag
reset_and_seed!
Familia.dbclient.del('probe:dos:list')
1500.times { |i| Familia.dbclient.rpush('probe:dos:list', "v#{i}") }
status, body = adm_post('/admin/api/raw/command',
                        { cmd: 'LRANGE', args: ['probe:dos:list', '0', '-1'] },
                        custom_token(perms: %w[raw_command]))
[status, body['result'].size <= 1000, body['truncated']]
#=> [200, true, true]

# ===========================================================================
# AUTHZ / TRANSPORT: PASETO verification rejects every malformed/expired token,
# and there is no ambient credential to bypass with.
# ===========================================================================

## a tampered token is rejected
reset_and_seed!
t = admin_token.dup
mid = t.length / 2
t[mid] = (t[mid] == 'A' ? 'B' : 'A')
s, = adm_get('/admin/api/_meta', t)
s
#=> 401

## a version-downgraded token (v2.local -> v2.public) is rejected
reset_and_seed!
s, = adm_get('/admin/api/_meta', admin_token.sub('v2.local.', 'v2.public.'))
s
#=> 401

## a garbage token is rejected
s, = adm_get('/admin/api/_meta', 'not-a-token')
s
#=> 401

## an expired token is rejected
reset_and_seed!
s, = adm_get('/admin/api/_meta', Familia::Admin::Auth.mint(sub: 'x', role: 'admin', ttl: -10))
s
#=> 401

## a token carrying no exp claim never validates (defense-in-depth)
reset_and_seed!
noexp = Familia::Admin::Auth.key.encrypt(JSON.generate(sub: 'x', role: 'admin', permissions: [], iat: Time.now.to_i))
s, = adm_get('/admin/api/_meta', noexp)
s
#=> 401

## a valid admin token still passes
reset_and_seed!
s, = adm_get('/admin/api/_meta', admin_token)
s
#=> 200

## a mutating route rejects a tokenless request (no cookie/CSRF ambient auth)
reset_and_seed!
s, = adm_post('/admin/api/models/customer/records', { fields: { custid: 'x', email: 'x@y.z' } }, nil)
s
#=> 401

# ===========================================================================
# AUDIT TRAIL: a rejected dispatch must leave no audit trace; a real mutation
# must be audited.
# ===========================================================================

## a rejected collection-send writes NO audit entry (deny precedes audit)
reset_and_seed!
@n0 = Familia::Admin::AuditLog.entries.size
adm_post('/admin/api/models/customer/records/cust_alice/destroy!', { op: 'add', args: ['x'] })
Familia::Admin::AuditLog.entries.size - @n0
#=> 0

## a legitimate collection mutation IS audited
reset_and_seed!
@n1 = Familia::Admin::AuditLog.entries.size
adm_post('/admin/api/models/customer/records/cust_alice/feature_flags', { op: 'add', args: ['audit_me'] })
Familia::Admin::AuditLog.entries.size - @n1
#=> 1
