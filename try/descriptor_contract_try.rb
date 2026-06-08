# frozen_string_literal: true

# Contract: the descriptor IS the frontend's source of truth. These pin the
# live reflection (GET /_meta, /models, /models/:model) to the shapes in
# fixtures/descriptor.sample.json that the prototype consumed.

require_relative 'helper'

AT.seed!

## GET /_meta returns the application descriptor shape
m = AT.body(:meta)
[m.key?(:familia_version), m.key?(:models), m[:models].is_a?(Array)]
#=> [true, true, true]

## /_meta familia_version is the real running version
AT.body(:meta)[:familia_version]
#=> Familia::VERSION

## /models lists the three worked models by config_name
AT.body(:list_models)[:models].sort
#=> ["api_key", "customer", "session"]

## describe_model(customer) covers the descriptor.sample.json customer contract
live = AT.body(:describe_model, params: { model: 'customer' })
fixture = AT.fixture('descriptor.sample.json')[:models].find { |x| x[:model] == 'customer' }
AT.covers_shape?(live, fixture)
#=> true

## customer datatypes are exactly the five developer-declared collections
AT.body(:describe_model, params: { model: 'customer' })[:datatypes].map { |d| d[:name].to_s }.sort
#=> ["domains", "feature_flags", "login_count", "metadata", "recent_logins"]

## index-backing structures and the timeline are filtered OUT of datatypes...
dt = AT.body(:describe_model, params: { model: 'customer' })[:datatypes].map { |d| d[:name].to_s }
[dt.include?('instances'), dt.include?('email_lookup'), dt.include?('status_index'), dt.include?('api_keys')]
#=> [false, false, false, false]

## ...and reported under internals instead (caveat #1 made explicit)
AT.body(:describe_model, params: { model: 'customer' })[:internals].map { |d| d[:name].to_s }.sort
#=> ["email_lookup", "instances"]

## customer fields carry category + identifier + display masking
fields = AT.body(:describe_model, params: { model: 'customer' })[:fields]
api = fields.find { |f| f[:name] == :api_secret }
pw  = fields.find { |f| f[:name] == :password }
[fields.find { |f| f[:name] == :custid }[:identifier], api[:category], api[:display], pw[:category], pw[:client_visible]]
#=> [true, :encrypted, "[CONCEALED]", :transient, false]

## customer indexes describe the unique + multi index (queryable, class-level)
idx = AT.body(:describe_model, params: { model: 'customer' })[:indexes]
[idx.map { |i| i[:index_name].to_s }.sort, idx.all? { |i| i[:class_level] }, idx.all? { |i| i[:queryable] }]
#=> [["email_lookup", "status_index"], true, true]

## api_key reports its participation in Customer's api_keys collection
AT.body(:describe_model, params: { model: 'api_key' })[:participations].map { |p| p[:collection].to_s }
#=> ["api_keys"]

## api_key has no editable datatypes (membership reverse-index filtered out)
AT.body(:describe_model, params: { model: 'api_key' })[:datatypes]
#=> []

## actions include reveal (encrypted field) + rebuild_index (has indexes)
acts = AT.body(:describe_model, params: { model: 'customer' })[:actions]
[acts.include?('reveal'), acts.include?('rebuild_index'), acts.include?('create')]
#=> [true, true, true]

## session has no datatypes/indexes and lives on logical_database 1
s = AT.body(:describe_model, params: { model: 'session' })
[s[:datatypes], s[:indexes], s[:logical_database]]
#=> [[], [], 1]

## unknown model is a 404, not a class-resolution leak
AT.api(:describe_model, params: { model: 'Object' })[0]
#=> 404

## OpenAPI document is a valid 3.1 shape derived from the descriptor
doc = AT.body(:openapi)
[doc[:openapi], doc[:components][:schemas].key?('Customer'), doc[:paths].key?('/models/customer/records')]
#=> ["3.1.0", true, true]
