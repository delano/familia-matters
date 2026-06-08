# frozen_string_literal: true

require 'rack'
require 'otto'
require_relative 'auth'
require_relative 'api'
require_relative 'mcp'
require_relative 'security'

module Familia
  module Admin
    # Builds the Otto application from the routes file with the admin auth
    # strategies. Shared by config.ru and the test harness so both exercise the
    # same wiring.
    #
    # Security note: we enable Otto's request validation (input sanitization +
    # security headers) but NOT its CSRF middleware. Otto's CSRF protection is
    # cookie/session-based and unsuitable for this stateless, bearer-token API
    # (it would reject every token-authenticated mutation regardless of the
    # csrf=exempt route flag). CSRF defense here is the Authorization header
    # itself plus the OriginGuard allowlist. See SECURITY.md.
    module App
      module_function

      def default_routes
        File.expand_path('../../../routes', __dir__)
      end

      # @param security [Boolean] enable request validation + the Origin guard
      def build(routes_path: default_routes, security: true)
        options = security ? { request_validation: true } : {}
        otto = Otto.new(routes_path, options)
        otto.configure_auth_strategies(Auth.strategies, default_strategy: 'noauth')
        return otto unless security

        Rack::Builder.new do
          use Familia::Admin::Security::OriginGuard
          run otto
        end.to_app
      end
    end
  end
end
