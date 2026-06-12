# try/query_try.rb
#
# QUERY domain: GET /models/:model/index/:index?value= (indexed lookups only).
# SPECIFIES bug #1 -- the unique-index value filter. A value query must return
# ONLY the matching record(s); the current source ignores the value on a UNIQUE
# index and returns ALL records, so the bug-#1 assertions are RED until fixed.
# The multi-index bucket already filters correctly (asserted as the contrast).

require_relative 'test_helper'
reset_and_seed!

# ---------------------------------------------------------------------------
# BUG #1 -- unique index value filter (email_lookup is 1:1).
# RED now: each_record on a unique index ignores value: -> returns all 3 seeded.
# ---------------------------------------------------------------------------

## a unique-index value query returns ONLY the matching record (bug #1)
status, body = adm_get('/admin/api/models/customer/index/email_lookup',
                       params: { value: 'alice@example.com' })
[status, body['records'].map { |r| r['custid'] }]
#=> [200, ["cust_alice"]]

## a unique-index query for a non-existent value returns ZERO records (bug #1)
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/index/email_lookup',
                       params: { value: 'nobody@example.com' })
[status, body['records']]
#=> [200, []]

# ---------------------------------------------------------------------------
# Multi index (status_index is 1:many) already filters by bucket -- this is the
# correct-behavior contrast and should be GREEN at baseline.
# ---------------------------------------------------------------------------

## a multi-index query returns ONLY the records in that bucket
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/index/status_index',
                       params: { value: 'active' })
[status, body['records'].map { |r| r['custid'] }.sort]
#=> [200, ["cust_alice"]]

## the multi-index bucket for 'pending' returns only the pending customer
reset_and_seed!
_s, body = adm_get('/admin/api/models/customer/index/status_index', params: { value: 'pending' })
body['records'].map { |r| r['custid'] }
#=> ["cust_pending"]

## the query response carries the index name and the queried value
reset_and_seed!
_s, body = adm_get('/admin/api/models/customer/index/status_index', params: { value: 'active' })
[body['index'], body['value']]
#=> ["status_index", "active"]

## querying an un-indexed field returns the scan_required gate (not a blocking scan)
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/index/name')
[status, body['error']]
#=> [200, "scan_required"]

## forcing a query on an un-indexed field is an explicit 4xx error -- never the
## fabricated {forced: true, records: []} empty success an operator would read
## as "no matching records" (T5)
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/index/name',
                       params: { value: 'x', force: 'true' })
[status, body['error'], body.key?('records'), body.key?('forced')]
#=> [400, "scan_unavailable", false, false]
