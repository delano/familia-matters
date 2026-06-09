# lib/familia/admin/rack_app.rb
#
# frozen_string_literal: true

require 'otto'
require 'rack'
require 'rack/static'
require 'rack/mime'

require 'familia/admin/auth'
require 'familia/admin/origin_guard'

module Familia
  module Admin
    # Single source of truth for assembling the runnable Rack app, so config.ru
    # (the server) and try/test_helper.rb (the contract suite) build the IDENTICAL
    # stack: Otto + PASETO auth strategies + the CSRF OriginGuard. Before this, the
    # test harness wired Otto by hand and never exercised the middleware; routing
    # the suite through #api_app closes that gap.
    #
    # Boot.setup! (Familia connection/encryption/models/admin code) is the caller's
    # responsibility and must run first; this module only wires HTTP.
    module RackApp
      ALLOWED_ORIGINS_ENV = 'FAMILIA_ADMIN_ALLOWED_ORIGINS'
      API_PREFIXES = ['/admin/api', '/_mcp'].freeze

      module_function

      def routes_path(app_root)
        File.join(app_root, 'resources', '00-assets', 'routes.txt')
      end

      def designs_dir(app_root)
        File.join(app_root, 'resources', '01-designs')
      end

      # A configured Otto instance: routes + PASETO strategies. Otto logs MCP
      # route-load errors to stderr (Admin::MCP is unimplemented); silence that
      # expected noise so server/test output stays clean.
      def otto(app_root)
        silence_stderr do
          instance = Otto.new(routes_path(app_root))
          Familia::Admin::Auth.register!(instance)
          instance
        end
      end

      # Explicit Origin allowlist from the environment, or nil to default to
      # same-origin (see OriginGuard).
      def allowed_origins
        raw = ENV[ALLOWED_ORIGINS_ENV]
        return nil if raw.nil? || raw.strip.empty?

        raw.split(',').map(&:strip).reject(&:empty?)
      end

      # The API app: OriginGuard wrapping Otto, no static serving. This is what the
      # contract suite drives, so the CSRF layer is under test.
      def api_app(otto_instance)
        Familia::Admin::OriginGuard.new(
          otto_instance,
          cookie_name: Familia::Admin::Auth::SESSION_COOKIE,
          allowed_origins: allowed_origins,
        )
      end

      # The full runnable app: state-changing CSRF guard in front of a path
      # dispatch that routes /admin/api and /_mcp to Otto and everything else to
      # the static design assets.
      def build(app_root)
        guard = api_app(otto(app_root))
        dispatch(guard, static_app(designs_dir(app_root)))
      end

      # Path-prefix dispatch WITHOUT rewriting PATH_INFO (Otto's routes are defined
      # against the full '/admin/api/...' and '/_mcp' paths).
      def dispatch(api, static)
        lambda do |env|
          path = env['PATH_INFO'].to_s
          if API_PREFIXES.any? { |p| path == p || path.start_with?("#{p}/") }
            api.call(env)
          else
            static.call(env)
          end
        end
      end

      def static_app(designs_dir)
        # Babel fetches *.jsx over HTTP; without a JS content-type the browser
        # refuses to execute them. Register before Rack::Static is built.
        Rack::Mime::MIME_TYPES['.jsx'] = 'application/javascript'
        Rack::Mime::MIME_TYPES['.mjs'] = 'application/javascript'
        Rack::Mime::MIME_TYPES['.js']  = 'application/javascript'

        Rack::Builder.new do
          use Rack::Static, urls: [''], root: designs_dir, index: 'Familia Admin.html', cascade: true
          run ->(_env) { [404, { 'content-type' => 'text/plain' }, ['Not found']] }
        end.to_app
      end

      def silence_stderr
        prev = $stderr
        $stderr = File.open(File::NULL, 'w')
        begin
          yield
        ensure
          $stderr.close
          $stderr = prev
        end
      end
    end
  end
end
