# frozen_string_literal: true
#
# The security pass: authentication, reveal gating, the raw-command allowlist,
# CSRF exemption for token-authenticated mutations, and the audit trail.

require_relative 'helper'
TryHelper.boot_and_seed!

## unauthenticated requests fail closed with 401 (before the controller runs)
TryHelper.get('/admin/api/_meta', token: nil).status
#=> 401

## an invalid bearer token is rejected
TryHelper.get('/admin/api/_meta', token: 'bogus-token').status
#=> 401

## reveal requires permission:reveal_secrets (403 + forbidden body for read-only)
r = TryHelper.post('/admin/api/models/customer/records/cust_8f2a91/reveal/api_secret', {}, token: 'rotok')
[r.status, TryHelper.json(r)['error'], TryHelper.json(r)['required_tier']]
#=> [403, "forbidden", "permission:reveal_secrets"]

## repair requires permission:repair
TryHelper.post('/admin/api/integrity/customer/repair?dry_run=true', {}, token: 'rotok').status
#=> 403

## raw command requires permission:raw_command
TryHelper.post('/admin/api/raw/command', { cmd: 'TYPE', args: ['x'] }, token: 'rotok').status
#=> 403

## migrations run requires permission:run_migrations
TryHelper.post('/admin/api/migrations/run?dry_run=true', { id: 'x' }, token: 'rotok').status
#=> 403

## token-authenticated mutations are CSRF-exempt and succeed with CSRF on
TryHelper.post('/admin/api/models/customer/records',
               { fields: { email: 'csrf@example.com', name: 'CSRF Test', status: 'active' } }).status
#=> 201

## the audit trail records the reveal by field name — never the plaintext
TryHelper.post('/admin/api/models/customer/records/cust_8f2a91/reveal/api_secret')
entries = TryHelper.get_json('/admin/api/audit')['entries']
rev = entries.find { |e| e['action'] == 'reveal' }
!rev.nil? && rev['field'] == 'api_secret' && entries.none? { |e| e.values.any? { |v| v.to_s.include?('sk_live_') } }
#==> true

## destructive/elevated actions are all attributed to the acting principal
TryHelper.get_json('/admin/api/audit')['entries'].all? { |e| !e['actor'].to_s.empty? }
#==> true
