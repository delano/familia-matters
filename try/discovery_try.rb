# frozen_string_literal: true
#
# Discovery endpoints vs fixtures/descriptor.sample.json — the descriptor is the
# frontend's source of truth, so its shape is contract-critical.

require_relative 'helper'
TryHelper.boot_and_seed!

## GET /_meta responds 200 for an authenticated admin
TryHelper.get('/admin/api/_meta').status
#=> 200

## the live Customer descriptor matches the fixture's core shape
fx = TryHelper.fixture('descriptor.sample.json')['models'].find { |m| m['model'] == 'customer' }
live = TryHelper.get_json('/admin/api/_meta')['models'].find { |m| m['model'] == 'customer' }
%w[model class key_pattern identifier_field fields datatypes indexes actions].all? { |k| live.key?(k) } &&
  live['key_pattern'] == fx['key_pattern'] &&
  live['identifier_field'] == fx['identifier_field']
#==> true

## field categories (encrypted / transient) are reflected
live = TryHelper.get_json('/admin/api/models/customer')
cats = live['fields'].to_h { |f| [f['name'], f['category']] }
[cats['api_secret'], cats['password']]
#=> ['encrypted', 'transient']

## encrypted/transient fields carry their display placeholders
live = TryHelper.get_json('/admin/api/models/customer')
disp = live['fields'].to_h { |f| [f['name'], f['display']] }
[disp['api_secret'], disp['password']]
#=> ['[CONCEALED]', '[REDACTED]']

## indexes are reflected with their cardinality
TryHelper.get_json('/admin/api/models/customer')['indexes'].map { |i| [i['index_name'], i['cardinality']] }.sort
#=> [['email_lookup', 'unique'], ['status_index', 'multi']]

## list_models returns the three registered Horreum classes
TryHelper.get_json('/admin/api/models')['models'].sort
#=> ['ApiKey', 'Customer', 'Session']

## describe_model 404s for an unknown model
TryHelper.get('/admin/api/models/nope').status
#=> 404
