# frozen_string_literal: true
#
# Migrations are driven by the REAL Familia::Migration::Runner / Registry; the
# adapter serializes their output to the fixtures/migrations.sample.json shapes.

require_relative 'helper'
TryHelper.boot_and_seed!

## migration status matches the status fixture shape
fx = TryHelper.fixture('migrations.sample.json')['status']
live = TryHelper.get_json('/admin/api/migrations')
TryHelper.shape_match?(fx, live)
#==> true

## status reports the applied + pending demo migrations
live = TryHelper.get_json('/admin/api/migrations')
[live['applied'].map { |m| m['id'] }.sort, live['pending'].map { |m| m['id'] }.sort]
#=> [["20260101_add_status_field", "20260318_backfill_login_count"], ["20260520_rename_fullname_to_name", "20260603_reencrypt_api_secret_v2"]]

## schema drift matches the drift fixture shape
fx = TryHelper.fixture('migrations.sample.json')['drift']
live = TryHelper.get_json('/admin/api/migrations/drift')
TryHelper.shape_match?(fx, live)
#==> true

## Customer shows real schema drift with a suggested migration
live = TryHelper.get_json('/admin/api/migrations/drift')['models'].find { |m| m['model'] == 'Customer' }
[live['changed'], live['differences'].map { |d| d['field'] }.sort, live['suggested_migration']]
#=> [true, ["fullname", "name", "updated_at"], "20260520_rename_fullname_to_name"]

## a dry-run does not change applied/pending state
TryHelper.post('/admin/api/migrations/run?dry_run=true', { id: '20260520_rename_fullname_to_name' })
TryHelper.get_json('/admin/api/migrations')['pending'].map { |m| m['id'] }.include?('20260520_rename_fullname_to_name')
#==> true

## rollback moves an applied migration back to pending
TryHelper.post('/admin/api/migrations/rollback', { id: '20260101_add_status_field' })
TryHelper.get_json('/admin/api/migrations')['pending'].map { |m| m['id'] }.include?('20260101_add_status_field')
#==> true
