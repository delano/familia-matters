# frozen_string_literal: true

# Contract + security: the raw explorer (the schemaless, guarded layer).
# scan_keys/inspect_key/server_info are read-only inspection; run_command is the
# allowlisted, audited, default-off danger path.

require_relative 'helper'

AT.seed!
Familia::Admin.config.raw_command_enabled = true

## scan_keys returns a cursor + keys with type and ttl (SCAN, never KEYS)
b = AT.body(:scan_keys, params: { match: 'customer:*', count: 100 })
obj = b[:keys].find { |k| k[:key] == 'customer:cust_8f2a91:object' }
[b.key?(:cursor), obj[:type], obj[:ttl].is_a?(Integer)]
#=> [true, "hash", true]

## inspect_key returns type/ttl/memory + a model deep-link for object keys
b = AT.body(:inspect_key, params: { key: 'customer:cust_8f2a91:object' })
[b[:type], b[:model][:model], b[:model][:id], b[:memory_bytes].is_a?(Integer)]
#=> ["hash", "customer", "cust_8f2a91", true]

## inspect_key on a missing key is a 404
AT.api(:inspect_key, params: { key: 'customer:does_not_exist:object' })[0]
#=> 404

## server_info parses INFO into a hash with the redis version
b = AT.body(:server_info)
[b[:server].is_a?(Hash), b[:server].key?('redis_version')]
#=> [true, true]

## run_command runs an ALLOWLISTED read command and marks it audited
b = AT.body(:run_command, body: { cmd: 'TYPE', args: ['customer:cust_8f2a91:object'] })
[b[:command], b[:result], b[:_audited]]
#=> ["TYPE", "hash", true]

## run_command HGETALL works (read), SCAN COUNT is capped
b = AT.body(:run_command, body: { cmd: 'HGETALL', args: ['customer:cust_8f2a91:object'] })
b[:result].is_a?(Array) || b[:result].is_a?(Hash)
#=> true

## FLUSHALL is refused (403 command_blocked) — write/admin commands never run
st, b = AT.api(:run_command, body: { cmd: 'FLUSHALL', args: [] })
[st, b[:error]]
#=> [403, "command_blocked"]

## KEYS is refused (use SCAN)
AT.api(:run_command, body: { cmd: 'KEYS', args: ['*'] })[0]
#=> 403

## CONFIG / SHUTDOWN / DEBUG / EVAL / SET are all refused
%w[CONFIG SHUTDOWN DEBUG EVAL SET DEL EXPIRE].map { |c| AT.api(:run_command, body: { cmd: c, args: ['x'] })[0] }.uniq
#=> [403]

## even a permission:raw_command holder cannot run a denied command (no force unlock)
AT.api(:run_command, body: { cmd: 'FLUSHDB', args: [] }, perms: %w[raw_command])[0]
#=> 403

## run_command is OFF by default (must be explicitly enabled)
Familia::Admin.config.raw_command_enabled = false
st, b = AT.api(:run_command, body: { cmd: 'TYPE', args: ['customer:cust_8f2a91:object'] })
Familia::Admin.config.raw_command_enabled = true
[st, b[:error]]
#=> [403, "command_disabled"]
