# lib/familia/admin/origin_guard.rb
#
# frozen_string_literal: true

require 'rack/request'
require 'uri'

module Familia
  module Admin
    # CSRF defense for cookie-authenticated, state-changing admin requests.
    #
    # WHY THIS EXISTS (auth-ui-spec Open Q#3 / gap-analysis headline): introducing
    # an ambient session cookie makes every `csrf=exempt` mutating route reachable
    # cross-site. SameSite=Strict on the cookie is the first line of defense; this
    # middleware is the server-side second line — an Origin/Referer allowlist on
    # state-changing requests — so the protection does not rest on SameSite alone
    # (older browsers, proxy quirks, future relaxations).
    #
    # SCOPE — only enforced when ALL hold; otherwise pass through untouched:
    #   * path under /admin/api (and /_mcp),
    #   * a state-changing method (POST/PUT/DELETE/PATCH),
    #   * the request carries the session cookie AND no `Authorization: Bearer`
    #     header. Bearer-authenticated clients (curl/CI/MCP) are NOT CSRF-vulnerable
    #     — CSRF rides ambient cookie credentials a browser attaches automatically,
    #     which a Bearer client never has — so they bypass the check and keep
    #     working unchanged.
    #
    # ALLOWLIST: explicit via FAMILIA_ADMIN_ALLOWED_ORIGINS (comma-separated
    # scheme://host[:port]); when unset, defaults to same-origin (the request's own
    # scheme://host). A guarded request whose Origin (or, if absent, Referer origin)
    # is not allowed — including one with neither header — is refused 403.
    class OriginGuard
      MUTATING_METHODS = %w[POST PUT DELETE PATCH].freeze
      GUARDED_PREFIXES = ['/admin/api', '/_mcp'].freeze

      def initialize(app, cookie_name:, allowed_origins: nil)
        @app = app
        @cookie_name = cookie_name
        # nil => derive same-origin per request; [] or list => explicit allowlist.
        @allowed_origins = allowed_origins
      end

      def call(env)
        return @app.call(env) unless enforce?(env)
        return @app.call(env) if origin_allowed?(env)

        forbidden
      end

      private

      def enforce?(env)
        guarded_path?(env['PATH_INFO']) &&
          MUTATING_METHODS.include?(env['REQUEST_METHOD']) &&
          cookie_authenticated?(env)
      end

      def guarded_path?(path)
        p = path.to_s
        GUARDED_PREFIXES.any? { |prefix| p == prefix || p.start_with?("#{prefix}/") }
      end

      # Cookie present AND no Bearer header: the only CSRF-vulnerable shape.
      def cookie_authenticated?(env)
        return false if env['HTTP_AUTHORIZATION'].to_s =~ /\ABearer\s+/i

        cookie = Rack::Request.new(env).cookies[@cookie_name]
        !cookie.to_s.empty?
      end

      def origin_allowed?(env)
        origin = request_origin(env)
        return false if origin.nil? # a cookie-auth mutation with no Origin/Referer is refused

        allowed = @allowed_origins || [same_origin(env)]
        allowed.include?(origin)
      end

      # The Origin header, or the origin component of the Referer as a fallback.
      def request_origin(env)
        o = env['HTTP_ORIGIN']
        return o unless o.nil? || o.empty?

        referer = env['HTTP_REFERER']
        return nil if referer.nil? || referer.empty?

        begin
          uri = URI.parse(referer)
          return nil unless uri.scheme && uri.host

          port = uri.port && ![80, 443].include?(uri.port) ? ":#{uri.port}" : ''
          "#{uri.scheme}://#{uri.host}#{port}"
        rescue URI::InvalidURIError
          nil
        end
      end

      # scheme://host[:port] reconstructed from the request, for the same-origin
      # default. Default ports (80/443) are omitted to match the browser's Origin
      # header formatting.
      def same_origin(env)
        req = Rack::Request.new(env)
        default = req.scheme == 'https' ? 443 : 80
        suffix = req.port && req.port != default ? ":#{req.port}" : ''
        "#{req.scheme}://#{req.host}#{suffix}"
      end

      def forbidden
        body = { error: 'forbidden_origin' }.to_json
        [403, { 'content-type' => 'application/json', 'content-length' => body.bytesize.to_s }, [body]]
      end
    end
  end
end
