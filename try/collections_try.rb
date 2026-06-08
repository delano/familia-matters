# frozen_string_literal: true
#
# Collection (DataType) read + mutate vs the fixture shapes.

require_relative 'helper'
TryHelper.boot_and_seed!

## sorted_set collection matches the collection_sorted_set fixture shape
fx = TryHelper.fixture('records.sample.json')['collection_sorted_set']
live = TryHelper.get_json('/admin/api/models/customer/records/cust_8f2a91/domains')
TryHelper.shape_match?(fx, live)
#==> true

## hashkey collection matches the collection_hashkey fixture shape
fx = TryHelper.fixture('records.sample.json')['collection_hashkey']
live = TryHelper.get_json('/admin/api/models/customer/records/cust_8f2a91/metadata')
TryHelper.shape_match?(fx, live)
#==> true

## counter collection matches the collection_counter fixture shape
fx = TryHelper.fixture('records.sample.json')['collection_counter']
live = TryHelper.get_json('/admin/api/models/customer/records/cust_8f2a91/login_count')
TryHelper.shape_match?(fx, live)
#==> true

## mutate_collection SADD adds a unique set member
TryHelper.post('/admin/api/models/customer/records/cust_8f2a91/feature_flags', { op: 'add', args: ['contract_flag'] })
TryHelper.get_json('/admin/api/models/customer/records/cust_8f2a91/feature_flags')['members'].include?('contract_flag')
#==> true

## mutate_collection ZADD adds a scored sorted-set member
TryHelper.post('/admin/api/models/customer/records/cust_8f2a91/domains', { op: 'add', args: ['contract.dev', 1_750_000_000] })
TryHelper.get_json('/admin/api/models/customer/records/cust_8f2a91/domains')['members'].any? { |m| m['member'] == 'contract.dev' }
#==> true

## mutate_collection increments a counter by N
before = TryHelper.get_json('/admin/api/models/customer/records/cust_8f2a91/login_count')['value']
TryHelper.post('/admin/api/models/customer/records/cust_8f2a91/login_count', { op: 'increment', args: [5] })
after = TryHelper.get_json('/admin/api/models/customer/records/cust_8f2a91/login_count')['value']
after - before
#=> 5

## read_collection 404s for an unknown collection
TryHelper.get('/admin/api/models/customer/records/cust_8f2a91/nope').status
#=> 404
