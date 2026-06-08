# frozen_string_literal: true

require 'json'

module Familia
  module Admin
    module Security
      # OriginGuard — CSRF defense appropriate to a bearer-token API.
      #
      # This API authenticates with the Authorization: Bearer header (never an
      # ambient cookie), so it is already immune to classic CSRF: a browser will
      # not attach the token to a cross-site request, and any non-simple
      # cross-origin call triggers a CORS preflight. Otto's built-in CSRF
      # middleware is cookie/session-oriented and therefore the wrong tool here
      # (it would reject every token-authenticated mutation regardless of the
      # csrf=exempt route flag).
      #
      # As defense-in-depth, when an Origin allowlist is configured
      # (ENV['ADMIN_ALLOWED_ORIGINS'], comma-separated), this guard rejects any
      # state-changing request whose Origin is present and not allowlisted.
      # Requests with no Origin header (server-to-server, curl, same-origin
      # navigations) are allowed; with no allowlist configured it is a no-op so
      # development stays frictionless.
      class OriginGuard
        UNSAFE = %w[POST PUT PATCH DELETE].freeze

        def initialize(app, allowed: nil)
          @app = app
          @allowed = (allowed || ENV['ADMIN_ALLOWED_ORIGINS'].to_s.split(',')).map(&:strip).reject(&:empty?)
        end

        def call(env)
          return @app.call(env) if @allowed.empty?
          return @app.call(env) unless UNSAFE.include?(env['REQUEST_METHOD'])

          origin = env['HTTP_ORIGIN']
          return @app.call(env) if origin.nil? || origin.empty?
          return @app.call(env) if @allowed.include?(origin)

          body = { error: 'forbidden_origin', origin: origin }.to_json
          [403, { 'content-type' => 'application/json', 'content-length' => body.bytesize.to_s }, [body]]
        end
      end
    end
  end
end
