# lib/familia/admin/auth.rb
#
# frozen_string_literal: true

require 'json'
require 'paseto'
require 'rack/request'

require 'otto/security/authentication/auth_strategy'

# Familia::Admin::Auth
#
# Token minting/verification plus the Otto auth strategy for the dev harness.
#
# SCHEME NOTE (read before extending): this uses PASETO **v2.local** because the
# only PASETO gem on rubygems (`paseto` 0.4.1) implements v2 exclusively
# (`Paseto::V2::Local`). The task targeted v4.local; v4 is unavailable in this
# gem. v2.local is the same symmetric, self-contained, libsodium/rbnacl-backed
# XChaCha20-Poly1305 AEAD primitive, so the security intent (authenticated
# encryption + tamper detection on a self-contained token) holds. The version
# gap is recorded as a blocker, not silently swapped for a different scheme.
#
# The token is an opaque encrypted message carrying a JSON claims blob; the gem
# does NOT interpret claims, so expiry (`exp`) is enforced here in #verify.
#
# Authorization model (matches what Otto's RouteAuthWrapper actually does for
# this routes file):
#   * routes.txt uses `auth=role:admin` / `auth=permission:NAME`. Otto resolves
#     `role:admin` to a strategy registered as `role` (prefix match before ':')
#     and `permission:NAME` to one registered as `permission`. The full
#     requirement string is handed to the strategy, which parses the suffix.
#   * Otto's Layer-1 role check keys off a separate `role=` token (absent here),
#     so it is a no-op. THIS STRATEGY IS THE ONLY GATE. Every denial therefore
#     returns a failure result; returning a StrategyResult of any kind would pass
#     straight through to the controller. The failure TYPE encodes the HTTP status:
#       - AuthFailure (via #failure)            -> 401: no/invalid/expired token
#       - AuthorizationFailure (#authorization_failure) -> 403: valid token, but
#         wrong role / missing permission
#     This 401-vs-403 split lets the UI distinguish "authenticate again" from "you
#     lack this permission" (auth-ui-spec Open Q#4). It relies on Otto's
#     strategy-level AuthorizationFailure support (otto >= the authz-failure-403
#     change); older Otto collapses both to 401.
#   * The client-supplied envelope `tier` plays NO part in authorization.
#
# Credential transport: the token is read from the `Authorization: Bearer` header
# (programmatic clients) OR the session cookie (browser), with HEADER PRECEDENCE.
# The cookie is minted at login (Admin::Sessions#login) and is HttpOnly+Secure+
# SameSite=Strict; cross-site CSRF on the cookie is defended by SameSite plus the
# OriginGuard middleware (see lib/familia/admin/origin_guard.rb).
#
module Familia
  module Admin
    module Auth
      # 32 raw bytes, base64url-encoded, used as the symmetric v2.local key.
      # DEV DEFAULT ONLY. Server and rake tasks read FAMILIA_ADMIN_PASETO_KEY so
      # tokens minted by rake verify against the running server. Override in any
      # shared/real environment.
      # base64url(no padding) of the 32 bytes "familia-admin-dev-paseto-key-v2!".
      DEV_PASETO_KEY = 'ZmFtaWxpYS1hZG1pbi1kZXYtcGFzZXRvLWtleS12MiE'

      DEFAULT_ROLE = 'admin'
      DEFAULT_TTL  = 3_600

      # Name of the browser session cookie carrying the minted PASETO. Kept plain
      # (no `__Host-` prefix) because that prefix mandates Secure, which is dropped
      # for local development over loopback; promoting to `__Host-` is a prod
      # hardening option once Secure is unconditionally on.
      SESSION_COOKIE = 'familia_admin_session'

      # The identity and grant a successful passphrase login receives. A single
      # shared passphrase grants THE admin session (auth-ui-spec: "possession of
      # the passphrase grants an admin session"; non-goal: per-login permission
      # selection), so the default grant is full admin — every elevated permission
      # routes.txt gates on. Both are overridable from the environment for an
      # operator who wants to narrow the browser session's reach.
      SESSION_SUBJECT_DEFAULT     = 'admin'
      SESSION_PERMISSIONS_DEFAULT = %w[reveal_secrets repair run_migrations raw_command].freeze

      module_function

      # The base64url-encoded symmetric key string (NOT the Key object).
      # @return [String]
      def key_material
        ENV.fetch('FAMILIA_ADMIN_PASETO_KEY', DEV_PASETO_KEY)
      end

      # The Paseto v2.local key built from the configured material.
      # @return [Paseto::V2::Local::Key]
      def key
        Paseto::V2::Local::Key.decode64(key_material)
      end

      # Mint a token.
      #
      # @param sub [String] subject (the admin identity; surfaces as actor)
      # @param permissions [Array<String>] elevated permissions granted
      # @param role [String] role claim (default 'admin')
      # @param ttl [Integer] seconds until expiry
      # @return [String] a `v2.local.…` token
      def mint(sub:, permissions: [], role: DEFAULT_ROLE, ttl: DEFAULT_TTL)
        claims = {
          sub: sub.to_s,
          role: role.to_s,
          permissions: Array(permissions).map(&:to_s),
          exp: Time.now.to_i + ttl.to_i,
          iat: Time.now.to_i,
        }
        key.encrypt(JSON.generate(claims))
      end

      # The subject a browser login is minted under (env override or default).
      # @return [String]
      def session_subject
        v = ENV['FAMILIA_ADMIN_SESSION_SUBJECT']
        v.nil? || v.strip.empty? ? SESSION_SUBJECT_DEFAULT : v.strip
      end

      # The permission grant a browser login receives (env override or default).
      # @return [Array<String>]
      def session_permissions
        raw = ENV['FAMILIA_ADMIN_SESSION_PERMISSIONS']
        return SESSION_PERMISSIONS_DEFAULT.dup if raw.nil? || raw.strip.empty?

        raw.split(',').map(&:strip).reject(&:empty?)
      end

      # Mint the token a successful passphrase login establishes as the session.
      # @param ttl [Integer] seconds until expiry
      # @return [String] a `v2.local.…` token
      def mint_session(ttl: DEFAULT_TTL)
        mint(sub: session_subject, role: DEFAULT_ROLE, permissions: session_permissions, ttl: ttl)
      end

      # Verified claims, or nil for any missing/invalid/expired/tampered token.
      #
      # @param token [String] the bearer token
      # @return [Claims, nil]
      def verify(token)
        return nil if token.nil? || token.to_s.empty?

        message = key.decrypt(token.to_s)
        data = JSON.parse(message)

        exp = data['exp']
        # Require an expiry: a token carrying no exp claim must never validate
        # (defense-in-depth; Auth.mint always sets one).
        return nil unless exp
        return nil if Time.now.to_i >= exp.to_i

        Claims.new(
          sub: data['sub'],
          role: data['role'],
          permissions: Array(data['permissions']).map(&:to_s),
          exp: exp,
        )
      rescue StandardError
        # Paseto::AuthenticationError, Paseto::TokenError, ArgumentError (bad
        # base64), JSON::ParserError — all collapse to "not authenticated".
        nil
      end

      # Immutable verified-claims value object.
      Claims = Data.define(:sub, :role, :permissions, :exp)

      # Otto auth strategy backed by PASETO. Registered under BOTH 'role' and
      # 'permission' so the resolver's prefix match routes either requirement
      # here; the requirement string ('role:admin' / 'permission:repair') tells
      # the strategy which gate to enforce.
      class PasetoStrategy < Otto::Security::Authentication::AuthStrategy
        # @param env [Hash] Rack environment
        # @param requirement [String] e.g. 'role:admin' or 'permission:repair'
        # @return [StrategyResult] on success;
        #   [AuthFailure] (401) for a missing/invalid/expired token;
        #   [AuthorizationFailure] (403) for a valid token lacking the role/permission
        def authenticate(env, requirement)
          # Header precedence: a Bearer header wins over the session cookie, so a
          # programmatic client can always override an incidental browser cookie.
          token = bearer_token(env) || cookie_token(env)
          return failure('Missing credential') unless token

          claims = Familia::Admin::Auth.verify(token)
          return failure('Invalid or expired token') unless claims

          kind, value = requirement.to_s.split(':', 2)

          case kind
          when 'role'
            return authorization_failure("Requires role: #{value}") unless claims.role.to_s == value.to_s
          when 'permission'
            unless claims.permissions.include?(value.to_s)
              return authorization_failure("Requires permission: #{value}")
            end
          else
            # A malformed requirement is a route-config error, not an authz denial.
            return failure("Unsupported auth requirement: #{requirement}")
          end

          # user is a Hash so StrategyResult#user_id resolves to :id (the sub),
          # and has_role?/has_permission? resolve via the hash branch. The
          # 'tier' from any client envelope is deliberately not consulted.
          success(
            user: {
              id: claims.sub,
              role: claims.role,
              permissions: claims.permissions,
              exp: claims.exp,
            },
            auth_method: 'paseto',
            sub: claims.sub,
          )
        end

        private

        def bearer_token(env)
          header = env['HTTP_AUTHORIZATION'].to_s
          return nil unless header =~ /\ABearer\s+(.+)\z/i

          Regexp.last_match(1).strip
        end

        # Read the PASETO from the session cookie, or nil when absent/blank.
        def cookie_token(env)
          value = Rack::Request.new(env).cookies[Familia::Admin::Auth::SESSION_COOKIE]
          value && !value.empty? ? value : nil
        end
      end

      # Register the strategy under both requirement prefixes on an Otto instance.
      # @param otto [Otto]
      # @return [Otto]
      def self.register!(otto)
        strategy = PasetoStrategy.new
        otto.add_auth_strategy('role', strategy)
        otto.add_auth_strategy('permission', strategy)
        otto
      end
    end
  end
end
