# frozen_string_literal: true

require 'otto'
require 'digest'
require 'json'

module Familia
  module Admin
    # Authentication + authorization for the admin API.
    #
    # Two layers, by design:
    #   * Layer 1 (edge): {AdminStrategy} authenticates the bearer token and
    #     requires the `admin` role for EVERY admin route. A missing/invalid
    #     token fails closed with 401 before the controller runs.
    #   * Layer 2 (handler): elevated actions call `require_permission!` in the
    #     controller, which returns 403 `{error:'forbidden', required_tier, held}`
    #     when the authenticated admin lacks the specific permission tier. This
    #     keeps the fine-grained check next to the side effect (defense in depth)
    #     and lets the API return the exact forbidden shape the UI consumes.
    #
    # Tokens are never stored in the clear: the registry is keyed by the
    # SHA-256 digest of the token, and lookups digest the presented token first.
    module Auth
      module_function

      # An authenticated admin principal.
      Principal = Data.define(:actor, :role, :permissions) do
        def id = actor
        def user_id = actor
        def name = actor
        def has_role?(r) = role.to_s == r.to_s
        def has_permission?(p) = Array(permissions).map(&:to_s).include?(p.to_s)
        def permissions_list = Array(permissions).map(&:to_s)
      end

      ELEVATED_PERMISSIONS = %w[reveal_secrets repair run_migrations raw_command].freeze

      @registry = {}     # sha256(token) => Principal
      @mutex = Mutex.new

      # Register a token for a principal. Stores only the token digest.
      def register(token, actor:, role: 'admin', permissions: [])
        digest = digest_for(token)
        @mutex.synchronize do
          @registry[digest] = Principal.new(actor: actor.to_s, role: role.to_s,
                                            permissions: Array(permissions).map(&:to_s))
        end
      end

      def reset!
        @mutex.synchronize { @registry = {} }
      end

      def resolve_token(token)
        return nil if token.nil? || token.to_s.empty?

        @registry[digest_for(token)]
      end

      def digest_for(token)
        Digest::SHA256.hexdigest(token.to_s)
      end

      # Seed tokens from ENV['ADMIN_TOKENS'] (JSON: {"<token>": {"actor":…,
      # "role":…, "permissions":[…]}}). In non-production, if nothing is
      # configured, seed a loud dev token so the app is usable out of the box.
      def load_from_env!
        json = ENV['ADMIN_TOKENS']
        if json && !json.empty?
          JSON.parse(json).each do |token, spec|
            register(token,
                     actor: spec['actor'] || 'admin',
                     role: spec['role'] || 'admin',
                     permissions: spec['permissions'] || ELEVATED_PERMISSIONS)
          end
          return
        end

        return if Boot.production?

        warn '[familia-admin] WARNING: no ADMIN_TOKENS configured; seeding dev tokens. ' \
             'Do NOT use these in production.'
        register('dev-admin-token', actor: 'dev_admin', role: 'admin',
                                    permissions: ELEVATED_PERMISSIONS)
        register('dev-readonly-token', actor: 'dev_readonly', role: 'admin', permissions: [])
      end

      # The principal attached to a request by the strategy, or nil.
      def principal(env)
        sr = env['otto.strategy_result']
        sr && sr.respond_to?(:user) ? sr.user : nil
      end

      # Pull a bearer token from the request: Authorization: Bearer <t> or the
      # X-Admin-Token header. Headers only — never the query string or a
      # cookie, so tokens stay out of logs and referrers.
      def token_from_env(env)
        if (auth = env['HTTP_AUTHORIZATION']) && auth =~ /\ABearer\s+(.+)\z/i
          return Regexp.last_match(1).strip
        end

        env['HTTP_X_ADMIN_TOKEN']
      end

      # Otto authentication strategy. Registered under every requirement name
      # used in `routes` (role:admin and each permission:*). It authenticates
      # the token and enforces the admin-role baseline; the specific permission
      # tier is enforced in the controller.
      class AdminStrategy < Otto::Security::Authentication::AuthStrategy
        def authenticate(env, requirement)
          token = Auth.token_from_env(env)
          principal = Auth.resolve_token(token)

          return failure('authentication required') if principal.nil?
          return failure('admin role required') unless principal.has_role?('admin')

          success(user: principal, auth_method: 'admin_token', actor: principal.actor)
        end
      end

      # Strategy hash for Otto#configure_auth_strategies. One shared instance is
      # registered under each requirement name the routes reference.
      def strategies
        strat = AdminStrategy.new
        names = ['role:admin'] + ELEVATED_PERMISSIONS.map { |p| "permission:#{p}" }
        names.each_with_object('noauth' => noauth_strategy) do |name, acc|
          acc[name] = strat
        end
      end

      # A permissive strategy for unauthenticated/diagnostic routes (none here
      # require it, but Otto wants a default).
      def noauth_strategy
        Otto::Security::Authentication::Strategies::NoAuthStrategy.new
      rescue StandardError, NameError
        AdminStrategy.new
      end
    end
  end
end
