# try/smoke_try.rb
#
# Harness smoke test: prove the in-process Rack::Test helper boots the real Otto
# app, the PASETO token verifies, reset_and_seed! populates known ids, and the
# bare-descriptor + records shapes round-trip. If this file is green the rest of
# the suite can run; if it is red the whole phase is blocked.

require_relative 'test_helper'

@status, @meta = adm_get('/admin/api/_meta')

## _meta returns 200 with an admin token
@status
#=> 200

## _meta is a bare descriptor (no success/data envelope) carrying models
@meta.keys.sort
#=> ["familia_version", "generated_at", "models"]

## the seeded models all describe (customer/session/api_key present; audit_log
## is also a registered Horreum member so it appears too -- live truth)
reset_and_seed!
_status, meta = adm_get('/admin/api/_meta')
names = meta['models'].map { |m| m['model'] }
%w[customer session api_key].all? { |n| names.include?(n) }
#=> true

## records.list returns the bare list shape with the seeded customers
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/records')
[status, body['model'], body['records'].map { |r| r['custid'] }.sort]
#=> [200, "customer", ["cust_alice", "cust_bob", "cust_pending"]]

## a missing/empty bearer token is denied (the strategy is the only gate)
get '/admin/api/_meta', {}, {}
last_response.status
#=> 401
