# frozen_string_literal: true
#
# Records CRUD + reveal vs fixtures/records.sample.json shapes.

require_relative 'helper'
TryHelper.boot_and_seed!

## list_records matches the customer_list fixture shape
fx = TryHelper.fixture('records.sample.json')['customer_list']
live = TryHelper.get_json('/admin/api/models/customer/records')
TryHelper.shape_match?(fx, live)
#==> true

## list masks encrypted fields and omits transient fields
live = TryHelper.get_json('/admin/api/models/customer/records')
live['records'].all? { |r| r['api_secret'] == '[CONCEALED]' && !r.key?('password') }
#==> true

## read_record matches the customer_detail fixture shape (incl. _key)
fx = TryHelper.fixture('records.sample.json')['customer_detail']
live = TryHelper.get_json('/admin/api/models/customer/records/cust_8f2a91')
TryHelper.shape_match?(fx, live) && live['_key'] == 'customer:cust_8f2a91:object'
#==> true

## create_record is a create-only atomic write (201, server-assigned id)
r = TryHelper.post('/admin/api/models/customer/records',
                   { fields: { email: 'zoe@example.com', name: 'Zoe Q', status: 'pending' } })
[r.status, TryHelper.json(r)['custid'].start_with?('cust_'), TryHelper.json(r)['created']]
#=> [201, true, true]

## create rejects unknown fields (mass-assignment protection)
r = TryHelper.post('/admin/api/models/customer/records',
                   { fields: { email: 'x@example.com', name: 'X', role: 'superuser', is_admin: true } })
rec = TryHelper.json(r)
!rec.key?('role') && !rec.key?('is_admin')
#==> true

## update_record applies permitted changes and bumps updated_at
TryHelper.post('/admin/api/models/customer/records', { fields: { custid: 'cust_upd1', email: 'u@example.com', name: 'U', status: 'active' } })
r = TryHelper.put('/admin/api/models/customer/records/cust_upd1', { fields: { name: 'Updated Name' } })
body = TryHelper.json(r)
[body['updated'], body['name']]
#=> [true, 'Updated Name']

## reveal returns the plaintext once and matches the reveal fixture shape
fx = TryHelper.fixture('records.sample.json')['reveal_response']
live = TryHelper.json(TryHelper.post('/admin/api/models/customer/records/cust_8f2a91/reveal/api_secret'))
live['api_secret'].start_with?('sk_live_') && TryHelper.shape_match?(fx['_audit'], live['_audit'])
#==> true

## reveal on a non-encrypted field is a 400
TryHelper.post('/admin/api/models/customer/records/cust_8f2a91/reveal/email').status
#=> 400

## indexed query matches the indexed_query fixture shape
fx = TryHelper.fixture('records.sample.json')['indexed_query']
live = TryHelper.get_json('/admin/api/models/customer/index/status_index?value=active')
TryHelper.shape_match?(fx, live)
#==> true

## destroy removes the record from the timeline
TryHelper.post('/admin/api/models/customer/records', { fields: { custid: 'cust_del1', email: 'd@example.com', name: 'D', status: 'active' } })
before = TryHelper.get_json('/admin/api/models/customer/records')['count_fast']
TryHelper.delete('/admin/api/models/customer/records/cust_del1')
after = TryHelper.get_json('/admin/api/models/customer/records')['count_fast']
before - after
#=> 1
