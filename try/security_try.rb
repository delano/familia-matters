# frozen_string_literal: true

# The security pass, made executable. Covers the four surfaces called out in the
# task — reveal gating, the raw-command allowlist, CSRF, the audit trail — plus
# the model-resolution and mass-assignment hardening that backs them.

require_relative 'helper'

AT.seed!
Familia::Admin.config.raw_command_enabled = true

ROUTES = File.read(File.expand_path('../routes', __dir__))
PLAINTEXT = 'sk_live_9f8c2a7b1e4d6093' # alice's seeded api_secret
# Constants persist across Tryouts cases (locals do not).
MUTATIONS = ROUTES.lines.select { |l| l =~ /\A(POST|PUT|DELETE)\s/ && l.include?('Admin::API#') }

# ============================================================
# Reveal gating
# ============================================================

## reveal requires permission:reveal_secrets — denied without it (403)
st, b = AT.api(:reveal_field, params: { model: 'customer', id: 'cust_8f2a91', field: 'api_secret' }, perms: [])
[st, b[:error], b[:required_tier]]
#=> [403, "forbidden", "permission:reveal_secrets"]

## reveal denied when there is no authenticated principal at all
AT.api(:reveal_field, params: { model: 'customer', id: 'cust_8f2a91', field: 'api_secret' }, perms: :none)[0]
#=> 403

## a non-encrypted field can never be revealed, even with the permission (400)
AT.api(:reveal_field, params: { model: 'customer', id: 'cust_8f2a91', field: 'name' }, perms: %w[reveal_secrets])[0]
#=> 400

## with the permission, reveal returns the real plaintext exactly once
AT.body(:reveal_field, params: { model: 'customer', id: 'cust_8f2a91', field: 'api_secret' }, perms: %w[reveal_secrets])[:api_secret]
#=> PLAINTEXT

## the reveal route in the routes file is gated by permission:reveal_secrets
ROUTES.lines.find { |l| l.include?('reveal_field') }.include?('auth=permission:reveal_secrets')
#=> true

# ============================================================
# Audit trail — append-only, secrets-free, ordered
# ============================================================

## a reveal writes an audit entry recording WHICH field, never the plaintext
before = Familia::Admin::AuditLog.default.count
AT.body(:reveal_field, params: { model: 'customer', id: 'cust_8f2a91', field: 'api_secret' }, perms: %w[reveal_secrets])
entry = Familia::Admin::AuditLog.default.recent(limit: 1).first
[Familia::Admin::AuditLog.default.count > before, entry[:action].to_s, entry[:field].to_s, entry.key?(:value)]
#=> [true, "reveal", "api_secret", false]

## NO audit entry anywhere contains the revealed plaintext
Familia::Admin::AuditLog.default.recent(limit: 200).none? { |e| JSON.generate(e).include?(PLAINTEXT) }
#=> true

## destroy / repair / raw_command are all audited
b1 = Familia::Admin::AuditLog.default.count
AT.api(:destroy_record, params: { model: 'customer', id: 'cust_4410bd' })
AT.api(:repair, params: { model: 'customer' }, perms: %w[repair])
AT.api(:run_command, body: { cmd: 'TYPE', args: ['customer:cust_8f2a91:object'] }, perms: %w[raw_command])
actions = Familia::Admin::AuditLog.default.recent(limit: 10).map { |e| e[:action].to_s }
%w[destroy repair raw_command].all? { |a| actions.include?(a) }
#=> true

## the trail is append-only and ordered: sequence numbers strictly increase
seqs = Familia::Admin::AuditLog.default.recent(limit: 10).map { |e| e[:seq] }
seqs == seqs.sort.reverse && seqs.uniq.size == seqs.size
#=> true

## the sink scrubs a sensitive value if a caller ever passes one by mistake
e = Familia::Admin::AuditLog.new(key: 'familia:admin:audit_log:scrub_probe').record(action: :probe, value: 'leak-me')
e[:value]
#=> "[REDACTED]"

# ============================================================
# Raw-command allowlist — default deny
# ============================================================

## every destructive/admin command is categorically refused (403), no force unlock
%w[FLUSHALL FLUSHDB KEYS CONFIG SHUTDOWN DEBUG EVAL SCRIPT SET DEL RENAME EXPIRE MIGRATE].map do |c|
  AT.api(:run_command, body: { cmd: c, args: ['x'] }, perms: %w[raw_command])[0]
end.uniq
#=> [403]

## only read-only allowlisted commands run
%w[GET TYPE TTL HGETALL SMEMBERS ZRANGE LRANGE EXISTS SCAN INFO].all? { |c| Familia::Admin::RawCommand.allowed?(c) }
#=> true

## SCAN COUNT is capped so a single call cannot ask for an unbounded slice
out = Familia::Admin::RawCommand.run(Familia.dbclient, 'SCAN', ['0', 'COUNT', '99999'])
out[:args][out[:args].index('COUNT') + 1] <= Familia::Admin::RawCommand::SCAN_MAX_COUNT
#=> true

# ============================================================
# CSRF posture
#
# The real defense for this API is header-bearer-token auth (CSRF-immune): a
# cross-site request cannot attach the Authorization header. Every mutation is
# gated by a header-token auth tier, and marks csrf=exempt to declare it does
# not participate in the (session-based) CSRF token flow.
# ============================================================

## every mutating route is gated by a header-token auth tier (the CSRF defense)
MUTATIONS.all? { |l| l =~ /auth=(role|permission):/ }
#=> true

## every mutation also declares csrf=exempt (intentional, documented)
MUTATIONS.all? { |l| l.include?('csrf=exempt') }
#=> true

## NO mutation relies on a cookie/session for authentication
MUTATIONS.none? { |l| l.include?('auth=session') }
#=> true

## Otto CAN enforce CSRF if a deployment switches to cookie auth (capability check)
Otto.new(File.expand_path('../routes', __dir__), csrf_protection: true).security_config.csrf_enabled?
#=> true

# ============================================================
# Model resolution + mass assignment hardening
# ============================================================

## the :model param resolves ONLY registered models, never arbitrary constants
%w[Object Kernel File ../etc Familia::Horreum nonexistent].map { |m| AT.api(:read_record, params: { model: m, id: 'x' })[0] }.uniq
#=> [404]

## create/update silently drop unknown + identifier + transient fields
b = AT.body(:create_record, params: { model: 'customer' },
                            body: { fields: { custid: 'cust_sec1', email: 'sec@example.com',
                                              password: 'p', role: 'superadmin', _key: 'x' } })
[b[:record].key?(:password), b[:record].key?(:role), b[:record][:custid]]
#=> [false, false, "cust_sec1"]
