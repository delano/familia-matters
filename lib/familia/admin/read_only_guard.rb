# lib/familia/admin/read_only_guard.rb
#
# frozen_string_literal: true

require 'json'

module Familia
  module Admin
    # Production-default read-only mode for the admin API (T6).
    #
    # WHY THIS EXISTS: with the network perimeter at SSH, the dominant daily
    # risk is OPERATOR ERROR against production data (plan §1). Day-to-day
    # browsing must not carry destroy/repair/update live-wires; an operator
    # flips read-only off deliberately for a maintenance window.
    #
    # SHAPE: an OriginGuard-style Rack middleware. When read-only is active it
    # refuses state-changing methods (POST/PUT/DELETE/PATCH) under /admin/api
    # with 403 {error: 'read_only'}. GET (and HEAD/OPTIONS) requests are NEVER
    # affected, regardless of mode.
    #
    # EXEMPTION: the auth endpoints (/admin/api/auth/*) stay reachable. Login
    # (POST) and logout (DELETE) mutate only the operator's own session, not
    # application data — blocking them would make read-only production
    # browsing impossible, defeating the mode's entire purpose ("day-to-day
    # browsing of production data", plan §6 T6). Data routes carry no /auth/
    # prefix, so the exemption cannot leak onto a model route.
    #
    # DEFAULT: ON when RACK_ENV=production, OFF otherwise. The env var
    # FAMILIA_ADMIN_READ_ONLY overrides in either direction (on/true/1/yes vs
    # off/false/0/no); unset or unrecognized falls through to the RACK_ENV
    # default. The flag is read PER REQUEST: the check is two string compares,
    # and reading at request time means the contract suite can exercise both
    # modes in-process. Operationally the value still comes from the
    # service's EnvironmentFile and changes via restart.
    class ReadOnlyGuard
      MUTATING_METHODS = %w[POST PUT DELETE PATCH].freeze
      GUARDED_PREFIX   = '/admin/api'
      EXEMPT_PREFIXES  = ['/admin/api/auth'].freeze

      ENV_VAR = 'FAMILIA_ADMIN_READ_ONLY'
      # Same recognized token sets as Sessions' COOKIE_SECURE override, so the
      # two FAMILIA_ADMIN_* switches parse identically.
      TRUE_VALUES  = %w[1 true yes on].freeze
      FALSE_VALUES = %w[0 false no off].freeze

      def initialize(app)
        @app = app
      end

      def call(env)
        return @app.call(env) unless enforce?(env)

        refused
      end

      # Whether read-only mode is currently active (env override, else the
      # RACK_ENV-keyed default: production ⇒ on).
      def self.active?
        v = ENV[ENV_VAR].to_s.strip.downcase
        return true  if TRUE_VALUES.include?(v)
        return false if FALSE_VALUES.include?(v)

        ENV['RACK_ENV'] == 'production'
      end

      private

      def enforce?(env)
        MUTATING_METHODS.include?(env['REQUEST_METHOD']) &&
          guarded_path?(env['PATH_INFO']) &&
          self.class.active?
      end

      def guarded_path?(path)
        p = path.to_s
        return false unless p == GUARDED_PREFIX || p.start_with?("#{GUARDED_PREFIX}/")

        EXEMPT_PREFIXES.none? { |ex| p == ex || p.start_with?("#{ex}/") }
      end

      def refused
        body = { error: 'read_only' }.to_json
        [403, { 'content-type' => 'application/json', 'content-length' => body.bytesize.to_s }, [body]]
      end
    end
  end
end
