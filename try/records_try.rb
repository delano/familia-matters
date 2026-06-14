# try/records_try.rb
#
# RECORDS domain: list / read / create / update / destroy / reveal.
# Locks the bare-Hash CRUD wire shapes against the live serializer, and SPECIFIES
# bug #2 (created_at/updated_at): a created record must carry both timestamps as
# numbers ~= now, and an update must bump updated_at while holding created_at.
# Bug #2 assertions are RED against current source (it sets neither) until fixed.

require_relative 'test_helper'
reset_and_seed!

## list_records returns the bare list shape: model + paging + has_more + records[]
status, body = adm_get('/admin/api/models/customer/records')
[status, body.keys.sort, body['records'].map { |r| r['custid'] }.sort]
#=> [200, ["count_fast", "has_more", "limit", "model", "offset", "records"], ["cust_alice", "cust_bob", "cust_pending"]]

## has_more keys off the TIMELINE CURSOR, not records.length: a phantom (a
## timeline id with no live object) is dropped by load_multi, so a page can
## materialize FEWER live records than ids — pagination must still advance off the
## cursor. With 4 timeline ids (3 real + a phantom) and limit 3, a 4th id exists
## beyond the page, so has_more is true; the short, phantom-thinned records[] never
## includes the phantom. Regression guard for the silent-truncation bug.
reset_and_seed!
Customer.instances.add('cust_phantom', Familia.now.to_i)
status, body = adm_get('/admin/api/models/customer/records?limit=3')
[status, body['has_more'],
 body['records'].map { |r| r['custid'] }.include?('cust_phantom'),
 body['records'].length <= 3]
#=> [200, true, false, true]

## has_more is EXACT, never an empty trailing page: a page that exactly fills
## `limit` with the LAST ids reports has_more false (no (limit+1)th id exists), so
## "Next" is not offered into a guaranteed-empty page. 3 real records, limit 3.
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/records?limit=3')
[status, body['has_more'], body['records'].length]
#=> [200, false, 3]

## ...and true when a further id genuinely remains beyond the page (3 ids, limit 2)
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/records?limit=2')
[status, body['has_more'], body['records'].length]
#=> [200, true, 2]

## list serialization masks encrypted fields and omits the transient password
reset_and_seed!
_s, body = adm_get('/admin/api/models/customer/records')
rec = body['records'].find { |r| r['custid'] == 'cust_alice' }
[rec['api_secret'], rec.key?('password')]
#=> ["[CONCEALED]", false]

## read_record returns the full record (includes _key) with masked secret
reset_and_seed!
status, rec = adm_get('/admin/api/models/customer/records/cust_alice')
[status, rec['custid'], rec['api_secret'], rec['_key']]
#=> [200, "cust_alice", "[CONCEALED]", "customer:cust_alice:object"]

## reading a missing record is 404 not_found
status, body = adm_get('/admin/api/models/customer/records/nobody')
[status, body['error'], body['resource']]
#=> [404, "not_found", "record"]

# ---------------------------------------------------------------------------
# BUG #2 -- created_at / updated_at on create. Body deliberately OMITS the
# timestamps so the assertion proves the SERVER stamps them, not the client.
# RED now: current create_record stores only the given fields -> both nil.
# ---------------------------------------------------------------------------

## create stamps created_at AND updated_at as numbers ~= now (bug #2)
reset_and_seed!
@before = Time.now.to_i
status, rec = adm_post('/admin/api/models/customer/records',
                       { fields: { custid: 'cust_new', email: 'new@example.com',
                                   name: 'New Person', status: 'active' } })
[status, rec['custid'], rec['created_at'].is_a?(Numeric), rec['updated_at'].is_a?(Numeric)]
#=> [200, "cust_new", true, true]

## the stamped created_at is within a few seconds of now (bug #2)
reset_and_seed!
@now_ref = Time.now.to_i
_s, rec2 = adm_post('/admin/api/models/customer/records',
                    { fields: { custid: 'cust_new2', email: 'new2@example.com', name: 'N2', status: 'active' } })
rec2['created_at'].is_a?(Numeric) && (rec2['created_at'].to_i - @now_ref).abs <= 5
#=> true

## create echoes the post-insert count_fast bump
reset_and_seed!
status, rec = adm_post('/admin/api/models/customer/records',
                       { fields: { custid: 'cust_x', email: 'x@example.com', name: 'X', status: 'active' } })
[status, rec['count_fast']]
#=> [200, 4]

## creating a duplicate identifier is a 409 record_exists
reset_and_seed!
status, body = adm_post('/admin/api/models/customer/records',
                        { fields: { custid: 'cust_alice', email: 'dup@example.com', name: 'Dup', status: 'active' } })
[status, body['error']]
#=> [409, "record_exists"]

## an empty fields envelope is a 400 bad_request
status, body = adm_post('/admin/api/models/customer/records', { fields: {} })
[status, body['error']]
#=> [400, "bad_request"]

# ---------------------------------------------------------------------------
# BUG #2 -- updated_at bump on update. Body OMITS updated_at so the assertion
# proves the SERVER re-stamps it; created_at must be unchanged.
# RED now: update_record assigns only the given fields -> updated_at unchanged.
# ---------------------------------------------------------------------------

## update bumps updated_at past the original and leaves created_at unchanged (bug #2)
reset_and_seed!
_s, before = adm_get('/admin/api/models/customer/records/cust_alice')
@orig_created = before['created_at'].to_i
@orig_updated = before['updated_at'].to_i
sleep 1
status, after = adm_put('/admin/api/models/customer/records/cust_alice', { fields: { name: 'Alice Renamed' } })
[status, after['name'], after['created_at'].to_i == @orig_created, after['updated_at'].to_i > @orig_updated]
#=> [200, "Alice Renamed", true, true]

## updating a missing record is 404 not_found
status, body = adm_put('/admin/api/models/customer/records/nobody', { fields: { name: 'x' } })
[status, body['error'], body['resource']]
#=> [404, "not_found", "record"]

## destroy returns destroyed:true and the decremented count_fast
reset_and_seed!
status, body = adm_delete('/admin/api/models/customer/records/cust_bob')
[status, body['destroyed'], body['count_fast']]
#=> [200, true, 2]

## the destroyed record is then a 404 on read
reset_and_seed!
adm_delete('/admin/api/models/customer/records/cust_bob')
status, = adm_get('/admin/api/models/customer/records/cust_bob')
status
#=> 404

# ---------------------------------------------------------------------------
# reveal: elevated (permission:reveal_secrets), audited, plaintext once.
# The strategy is the only gate. A missing/invalid token denies 401; a VALID token
# lacking the permission is an authorization denial -> 403.
# ---------------------------------------------------------------------------

## reveal returns the decrypted plaintext plus an audit stub (admin token)
reset_and_seed!
status, body = adm_post('/admin/api/models/customer/records/cust_alice/reveal/api_secret')
[status, body['api_secret'], body['_audit']['action']]
#=> [200, "secret-cust_alice", "reveal"]

## reveal on a non-encrypted field is a 400 bad_request
status, body = adm_post('/admin/api/models/customer/records/cust_alice/reveal/email')
[status, body['error']]
#=> [400, "bad_request"]

## a reduced token (no reveal_secrets permission) is denied 403 (valid token, lacks permission)
reset_and_seed!
status, = adm_post('/admin/api/models/customer/records/cust_alice/reveal/api_secret', {}, reduced_token)
status
#=> 403
