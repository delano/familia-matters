# frozen_string_literal: true
#
# The raw explorer: SCAN listing, key inspection (with secret masking), server
# info, and the hardened command allowlist.

require_relative 'helper'
TryHelper.boot_and_seed!

## scan_keys returns SCAN page entries carrying type + ttl
live = TryHelper.get_json('/admin/api/raw/keys?pattern=customer:*')
live['keys'].is_a?(Array) && live['keys'].all? { |k| k.key?('key') && k.key?('type') && k.key?('ttl') }
#==> true

## an object key links back to its model + id
live = TryHelper.get_json('/admin/api/raw/keys?pattern=customer:*:object')
entry = live['keys'].find { |k| k['key'] == 'customer:cust_8f2a91:object' }
[entry['type'], entry['model'], entry['id']]
#=> ["hash", "customer", "cust_8f2a91"]

## inspect_key masks encrypted fields so no ciphertext leaks
TryHelper.get_json('/admin/api/raw/key?key=customer:cust_8f2a91:object')['value']['entries']['api_secret']
#=> "[CONCEALED]"

## server_info parses INFO into sections
live = TryHelper.get_json('/admin/api/raw/info')
%w[server memory clients stats keyspace].all? { |s| live.key?(s) }
#==> true

## an allowlisted read command executes for real
r = TryHelper.json(TryHelper.post('/admin/api/raw/command', { cmd: 'HGETALL', args: ['customer:cust_8f2a91:metadata'] }))
[r['_executed'], r['_simulated']]
#=> [true, false]

## KEYS is hard-denied — directed to SCAN
r = TryHelper.json(TryHelper.post('/admin/api/raw/command', { cmd: 'KEYS', args: ['*'] }))
[r['error'], r['_executed'], r['required_tier']]
#=> ["command_blocked", false, "permission:raw_command"]

## FLUSHALL is denied even when forced
TryHelper.json(TryHelper.post('/admin/api/raw/command', { cmd: 'FLUSHALL', args: [], force: true }))['error']
#=> "command_blocked"

## a write command outside the allowlist is rejected (not executed)
TryHelper.json(TryHelper.post('/admin/api/raw/command', { cmd: 'SET', args: %w[k v] }))['error']
#=> "unknown_command"
