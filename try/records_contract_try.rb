# frozen_string_literal: true

# Contract: typed CRUD over Horreum models. Pins list/read/create/update/destroy
# and the reveal flow to fixtures/records.sample.json.

require_relative 'helper'

AT.seed!

## records.list has the customer_list contract shape
live = AT.body(:list_records, params: { model: 'customer', offset: 0, limit: 50 })
AT.covers_shape?(live, AT.fixture('records.sample.json')[:customer_list])
#=> true

## records.list returns the seeded customers, encrypted masked, transient absent
r = AT.body(:list_records, params: { model: 'customer' })
first = r[:records].find { |x| x[:custid] == 'cust_8f2a91' }
[r[:model], r[:records].size, first[:api_secret], first.key?(:password), first[:email]]
#=> ["customer", 3, "[CONCEALED]", false, "alice@example.com"]

## count_fast is the O(1) timeline count
AT.body(:list_records, params: { model: 'customer' })[:count_fast]
#=> 3

## records.read returns one record with _key, masked secret, no transient
live = AT.body(:read_record, params: { model: 'customer', id: 'cust_8f2a91' })
[live[:_key], live[:api_secret], live.key?(:password), live[:name]]
#=> ["customer:cust_8f2a91:object", "[CONCEALED]", false, "Alice Ng"]

## records.read matches the customer_detail contract shape
AT.covers_shape?(
  AT.body(:read_record, params: { model: 'customer', id: 'cust_8f2a91' }),
  AT.fixture('records.sample.json')[:customer_detail],
)
#=> true

## records.read of a missing id is a 404
AT.api(:read_record, params: { model: 'customer', id: 'nope' })[0]
#=> 404

## records.create builds a new record (201) and echoes it masked
st, b = AT.api(:create_record, params: { model: 'customer' },
                               body: { fields: { custid: 'cust_zz01', email: 'zoe@example.com',
                                                 name: 'Zoe', status: 'pending', created_at: 1_730_000_000 } })
[st, b[:created], b[:id], b[:record][:email]]
#=> [201, true, "cust_zz01", "zoe@example.com"]

## a created record appears in the next list (stateful, like the prototype)
AT.body(:list_records, params: { model: 'customer' })[:records].map { |x| x[:custid] }.include?('cust_zz01')
#=> true

## records.create with a duplicate identifier is a 409 conflict
AT.api(:create_record, params: { model: 'customer' },
                       body: { fields: { custid: 'cust_8f2a91', email: 'dup@example.com' } })[0]
#=> 409

## records.create ignores unknown + transient fields (mass-assignment guard)
b = AT.body(:create_record, params: { model: 'customer' },
                            body: { fields: { custid: 'cust_zz02', email: 'q@example.com',
                                              password: 'sekret', bogus: 'x' } })
[b[:record].key?(:password), b[:record].key?(:bogus)]
#=> [false, false]

## records.update changes permitted fields and echoes the record
b = AT.body(:update_record, params: { model: 'customer', id: 'cust_4410bd' },
                            body: { fields: { name: 'Bobby Tran', status: 'active' } })
[b[:updated], b[:record][:name], b[:record][:status]]
#=> [true, "Bobby Tran", "active"]

## records.update cannot change the identifier (dropped from permitted fields)
b = AT.body(:update_record, params: { model: 'customer', id: 'cust_2200ee' },
                            body: { fields: { custid: 'hacked', name: 'Erin D' } })
[b[:record][:custid], b[:record][:name]]
#=> ["cust_2200ee", "Erin D"]

## records.update of an indexed field moves the index (no stale entry left)
AT.api(:update_record, params: { model: 'customer', id: 'cust_2200ee' }, body: { fields: { email: 'erin.d@example.com' } })
hit_new = AT.body(:query_index, params: { model: 'customer', index: 'email_lookup', value: 'erin.d@example.com' })[:records].map { |x| x[:custid] }
hit_old = AT.body(:query_index, params: { model: 'customer', index: 'email_lookup', value: 'erin@example.com' })[:records].map { |x| x[:custid] }
[hit_new, hit_old]
#=> [["cust_2200ee"], []]

## records.destroy removes the record
st, b = AT.api(:destroy_record, params: { model: 'customer', id: 'cust_zz02' })
[st, b[:destroyed], AT.body(:read_record, params: { model: 'customer', id: 'cust_zz02' }).key?(:error)]
#=> [200, true, true]

## reveal returns the plaintext once, with an _audit record (block-form reveal)
b = AT.body(:reveal_field, params: { model: 'customer', id: 'cust_8f2a91', field: 'api_secret' }, perms: %w[reveal_secrets])
[b[:api_secret], b[:_audit][:action], b[:_audit][:field].to_s]
#=> ["sk_live_9f8c2a7b1e4d6093", :reveal, "api_secret"]

## reveal matches the reveal_response contract shape
AT.covers_shape?(
  AT.body(:reveal_field, params: { model: 'customer', id: 'cust_8f2a91', field: 'api_secret' }, perms: %w[reveal_secrets]),
  AT.fixture('records.sample.json')[:reveal_response],
)
#=> true

## reveal of a non-encrypted field is a 400 (only encrypted fields are revealable)
AT.api(:reveal_field, params: { model: 'customer', id: 'cust_8f2a91', field: 'email' }, perms: %w[reveal_secrets])[0]
#=> 400
