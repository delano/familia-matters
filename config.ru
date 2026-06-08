# frozen_string_literal: true

# config.ru - boots the real familia-admin Otto backend.
#
# This is the production seam the design handoff describes: the same UI that the
# prototype pointed at a Claude-API simulator now points here, at Otto endpoints
# that emit the identical JSON shapes (fixtures/*.json). Run with:
#
#   bundle exec rackup            # http://localhost:9292
#
# Configuration (all via environment, safe defaults for local dev):
#   FAMILIA_URI            redis/valkey URI            (default redis://127.0.0.1:6379/0)
#   FAMILIA_ENCRYPTION_KEY base64 32-byte key for encrypted fields
#   ADMIN_MODELS           path to your models file    (default fixtures/models.rb)
#   ADMIN_TOKENS           "token=role:perm,perm; ..."  bearer-token ACL
#   ADMIN_RAW_COMMANDS     "true" to enable the raw-command runner (off by default)

require 'securerandom'
require 'base64'
require 'rack'
require 'otto'

$LOAD_PATH.unshift(File.expand_path('lib', __dir__))

require 'familia'

# ----- Familia runtime -----------------------------------------------------

Familia.uri = ENV.fetch('FAMILIA_URI', 'redis://127.0.0.1:6379/0') if Familia.respond_to?(:uri=)

Familia.configure do |config|
  key = ENV['FAMILIA_ENCRYPTION_KEY']
  if key.nil? || key.empty?
    warn '[familia-admin] FAMILIA_ENCRYPTION_KEY not set; generating an EPHEMERAL dev key ' \
         '(encrypted fields will not survive a restart). Set a stable key in production.'
    key = Base64.strict_encode64(SecureRandom.bytes(32))
  end
  config.encryption_keys = { v1: key }
  config.current_key_version = :v1
end

# ----- application models --------------------------------------------------

require 'familia/admin'
require File.expand_path(ENV.fetch('ADMIN_MODELS', 'fixtures/models.rb'), __dir__)

# ----- admin policy --------------------------------------------------------

Familia::Admin.configure do |c|
  c.raw_command_enabled = ENV['ADMIN_RAW_COMMANDS'].to_s.downcase == 'true'
  c.command_stream_enabled = ENV['ADMIN_COMMAND_STREAM'].to_s.downcase == 'true'
end
# Enabling the command feed turns on process-wide command instrumentation.
Familia::Admin.enable_command_capture! if Familia::Admin.config.command_stream_enabled

# ----- bearer-token auth ---------------------------------------------------
#
# Header-token auth (Authorization: Bearer <token>, or X-Admin-Token). Because
# the credential is a header (not an ambient cookie), so these endpoints are immune
# to CSRF, which is what makes the routes' `csrf=exempt` on mutations correct.
# Swap this resolver for your real identity provider; the contract is
# token -> { id:, role:, permissions: [..] } (or nil to reject).

ADMIN_TOKEN_ACL = begin
  spec = ENV['ADMIN_TOKENS']
  if spec.nil? || spec.empty?
    warn '[familia-admin] ADMIN_TOKENS not set; using a dev token "dev-admin" with all permissions. ' \
         'Do NOT use this in production.'
    {
      'dev-admin' => {
        id: 'dev-admin', role: 'admin',
        permissions: %w[reveal_secrets repair run_migrations raw_command],
      },
    }
  else
    spec.split(';').each_with_object({}) do |entry, acc|
      token, rest = entry.strip.split('=', 2)
      role, perms = rest.to_s.split(':', 2)
      acc[token] = { id: token, role: (role || 'admin').strip,
                     permissions: perms.to_s.split(',').map(&:strip).reject(&:empty?) }
    end
  end
end

# A single strategy serves both the `role:` and `permission:` tiers (see
# lib/familia/admin/token_strategy.rb). It returns a StrategyResult whose user
# exposes role/permissions so the controller's defense-in-depth checks see the
# same grants Otto enforced.
require 'familia/admin/token_strategy'
admin_strategy = Familia::Admin::TokenStrategy.new(ADMIN_TOKEN_ACL)

# ----- Otto app ------------------------------------------------------------

otto = Otto.new(
  File.expand_path('routes', __dir__),
  auth_strategies: {
    'role' => admin_strategy,
    'permission' => admin_strategy,
  },
  # CSRF is intentionally NOT enabled here. This API authenticates with a header
  # bearer token, which is immune to CSRF by construction: a cross-site page
  # cannot attach the Authorization header without a CORS grant the server never
  # makes. Otto 2.1's CSRF is a global, session/synchronizer-token middleware
  # that protects ALL non-safe methods and does not honor per-route
  # `csrf=exempt` — so enabling it would break the token API while adding no
  # protection a header credential doesn't already provide.
  #
  # If you switch to COOKIE/SESSION auth, you MUST enable CSRF and reckon with
  # this: add the `rack-session` gem + `use Rack::Session::Cookie`, pass
  # `csrf_protection: true`, and provide tokens for every mutation (the
  # `csrf=exempt` markers no longer apply). See SECURITY.md, "CSRF".
  csrf_protection: false,
)

run otto
