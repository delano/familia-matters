# frozen_string_literal: true

# Familia::Admin::TokenStrategy
#
# A header-bearer-token Otto auth strategy that serves both the `role:` and
# `permission:` route tiers. It parses each route's requirement and checks the
# token holder's role / permission set, then returns a StrategyResult whose user
# exposes `role` and `permissions` so the controller's defense-in-depth checks
# see the same grants Otto enforced.
#
# Header-token auth (Authorization: Bearer <token>, or X-Admin-Token) is what
# makes the routes' `csrf=exempt` correct: the credential is a header, not an
# ambient cookie, so cross-site requests cannot forge it.
#
# This is the reference resolver — an in-memory ACL of
# `token => { id:, role:, permissions: [..] }`. Swap `acl` for your identity
# provider (a lambda/object responding to #[](token) works too).
#
# Requires Otto to be loaded (the app/config.ru loads it); kept out of the core
# `familia/admin` require graph so the controller doesn't depend on Otto.

require 'otto'

module Familia
  module Admin
    class TokenStrategy < Otto::Security::Authentication::AuthStrategy
      # @param acl [#[]] token -> { id:, role:, permissions: [..] } (or nil)
      def initialize(acl)
        @acl = acl
      end

      def authenticate(env, requirement)
        user = @acl[bearer_token(env)]
        return failure('invalid or missing admin token') unless user

        kind, value = requirement.to_s.split(':', 2)
        case kind
        when 'role'
          return failure("requires role #{value}") unless user[:role].to_s == value.to_s
        when 'permission'
          return failure("requires permission #{value}") unless Array(user[:permissions]).map(&:to_s).include?(value.to_s)
        end

        success(user: user, auth_method: 'token')
      end

      private

      def bearer_token(env)
        auth = env['HTTP_AUTHORIZATION'].to_s
        auth[/\ABearer\s+(.+)\z/i, 1] || env['HTTP_X_ADMIN_TOKEN']
      end
    end
  end
end
