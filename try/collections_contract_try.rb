# frozen_string_literal: true

# Contract: DataType collections (list/set/sorted_set/hashkey/counter) and the
# indexed query. Pins the per-type shapes in fixtures/records.sample.json and the
# rule that only developer-declared collections are reachable.

require_relative 'helper'

AT.seed!

## sorted_set collection returns {member, score} pairs (caveat #2)
live = AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'domains' })
AT.covers_shape?(live, AT.fixture('records.sample.json')[:collection_sorted_set])
#=> true

## sorted_set members carry the real scores (timestamps), ordered
m = AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'domains' })[:members]
[m.map { |e| e[:member] }, m.first[:score]]
#=> [["example.com", "alice.dev", "ng.consulting"], 1730419200.0]

## hashkey collection returns entries (dynamic field names are string keys)
live = AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'metadata' })
[live[:type], live[:entries]['plan'], live[:entries]['region']]
#=> ["hashkey", "team", "eu-west"]

## hashkey matches the collection_hashkey contract shape
AT.covers_shape?(
  AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'metadata' }),
  AT.fixture('records.sample.json')[:collection_hashkey],
)
#=> true

## counter collection returns the integer value
live = AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'login_count' })
[live[:type], live[:value]]
#=> ["counter", 318]

## counter matches the collection_counter contract shape
AT.covers_shape?(
  AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'login_count' }),
  AT.fixture('records.sample.json')[:collection_counter],
)
#=> true

## set collection returns members
AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'feature_flags' })[:members]
#=> ["beta"]

## reading an INTERNAL structure (the unique-index hashkey) is refused (404)
AT.api(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'email_lookup' })[0]
#=> 404

## reading the instances timeline as a collection is refused (404)
AT.api(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'instances' })[0]
#=> 404

## mutate sorted_set: add a member with a score
b = AT.body(:mutate_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'domains' },
                                body: { op: 'add', args: ['new.example', 1_750_000_000] })
[b[:op], b[:type]]
#=> ["add", "sorted_set"]

## the sorted_set mutation is visible on the next read
AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'domains' })[:members].map { |e| e[:member] }.include?('new.example')
#=> true

## mutate counter: increment by an amount
AT.body(:mutate_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'login_count' }, body: { op: 'increment', args: [2] })
AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'login_count' })[:value]
#=> 320

## mutate hashkey: set a field
AT.body(:mutate_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'metadata' }, body: { op: 'set', args: ['tier', 'gold'] })
AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'metadata' })[:entries]['tier']
#=> "gold"

## mutate set: add and remove
AT.body(:mutate_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'feature_flags' }, body: { op: 'add', args: ['gamma'] })
AT.body(:mutate_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'feature_flags' }, body: { op: 'remove', args: ['beta'] })
AT.body(:read_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'feature_flags' })[:members].sort
#=> ["gamma"]

## an unknown op is refused (400) — op allowlist per type
AT.api(:mutate_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'login_count' }, body: { op: 'evil', args: [] })[0]
#=> 400

## mutating an internal structure is refused (404), even with a valid op
AT.api(:mutate_collection, params: { model: 'customer', id: 'cust_8f2a91', collection: 'email_lookup' }, body: { op: 'set', args: ['a', 'b'] })[0]
#=> 404

## indexed query matches the indexed_query contract shape
AT.covers_shape?(
  AT.body(:query_index, params: { model: 'customer', index: 'status_index', value: 'active' }),
  AT.fixture('records.sample.json')[:indexed_query],
)
#=> true

## indexed query on email_lookup resolves the unique owner
AT.body(:query_index, params: { model: 'customer', index: 'email_lookup', value: 'alice@example.com' })[:records].map { |r| r[:custid] }
#=> ["cust_8f2a91"]

## querying a non-existent index is a 404
AT.api(:query_index, params: { model: 'customer', index: 'nope', value: 'x' })[0]
#=> 404
