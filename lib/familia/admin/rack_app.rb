# lib/familia/admin/rack_app.rb
#
# frozen_string_literal: true

require 'otto'
require 'rack'
require 'rack/static'
require 'rack/files'
require 'rack/mime'
require 'rack/utils'

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
    # Browser entry flow: the built login SPA (Vite dist/) is served under /login,
    # and the prototype design assets at the web root are gated behind a valid
    # session cookie — an unauthenticated browser is redirected to
    # /login?return_to=<original path>, and after login the SPA hands back to it.
    # The API surface is NOT gated here (Otto's route auth owns it), so Bearer
    # clients see 401/403 statuses, never a redirect.
    #
    # Boot.setup! (Familia connection/encryption/models/admin code) is the caller's
    # responsibility and must run first; this module only wires HTTP.
    module RackApp
      ALLOWED_ORIGINS_ENV = 'FAMILIA_ADMIN_ALLOWED_ORIGINS'
      API_PREFIXES = ['/admin/api', '/_mcp'].freeze
      LOGIN_PREFIX = '/login'

      module_function

      def routes_path(app_root)
        File.join(app_root, 'resources', '00-assets', 'routes.txt')
      end

      def designs_dir(app_root)
        File.join(app_root, 'resources', '01-designs')
      end

      def dist_dir(app_root)
        File.join(app_root, 'dist')
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
      # dispatch that routes /admin/api and /_mcp to Otto, /login to the built
      # login SPA, and everything else to the session-gated design assets.
      def build(app_root)
        dispatch(
          api: api_app(otto(app_root)),
          login: login_app(dist_dir(app_root)),
          static: static_app(designs_dir(app_root)),
        )
      end

      # Path-prefix dispatch WITHOUT rewriting PATH_INFO (Otto's routes are defined
      # against the full '/admin/api/...' and '/_mcp' paths). Order matters: the
      # API and /login are reachable without a session (Otto's route auth gates the
      # API; /login must never redirect to itself); only the static designs sit
      # behind the cookie gate.
      def dispatch(api:, login:, static:)
        lambda do |env|
          path = env['PATH_INFO'].to_s
          if prefixed?(path, API_PREFIXES)
            api.call(env)
          elsif prefixed?(path, [LOGIN_PREFIX])
            login.call(env)
          elsif session_authenticated?(env)
            static.call(env)
          else
            redirect_to_login(env)
          end
        end
      end

      def prefixed?(path, prefixes)
        prefixes.any? { |p| path == p || path.start_with?("#{p}/") }
      end

      # Whether the request carries a session cookie holding a verifiable PASETO.
      # Cookie-only by design: browsers never attach Authorization headers to
      # page navigations, and Bearer clients only talk to the (ungated) API.
      def session_authenticated?(env)
        cookie = Rack::Request.new(env).cookies[Familia::Admin::Auth::SESSION_COOKIE]
        !Familia::Admin::Auth.verify(cookie).nil?
      end

      # 302 to the login SPA, carrying the original path+query so the SPA can
      # hand the operator straight back after authentication (the SPA sanitizes
      # return_to to a same-origin path before navigating).
      def redirect_to_login(env)
        original = env['PATH_INFO'].to_s
        query = env['QUERY_STRING'].to_s
        original = "#{original}?#{query}" unless query.empty?
        location = "#{LOGIN_PREFIX}?return_to=#{Rack::Utils.escape(original)}"
        [302, { 'location' => location, 'content-length' => '0' }, []]
      end

      # The built login SPA (vite build -> dist/, base '/login/'): hashed assets
      # under /login/assets, and the SPA's index.html for every other /login path.
      # A missing build is an operator hint, not a crash — the API and (for an
      # already-cookied browser) the designs still work without it.
      def login_app(dist_dir)
        index_path = File.join(dist_dir, 'index.html')
        assets = Rack::Files.new(dist_dir)

        lambda do |env|
          unless File.file?(index_path)
            body = "Login UI not built. Run: npm install && npm run build\n"
            return [503, { 'content-type' => 'text/plain', 'content-length' => body.bytesize.to_s }, [body]]
          end

          sub_path = env['PATH_INFO'].to_s.delete_prefix(LOGIN_PREFIX)
          if sub_path.start_with?('/assets/')
            assets.call(env.merge('PATH_INFO' => sub_path))
          else
            html = File.read(index_path)
            [200, { 'content-type' => 'text/html', 'content-length' => html.bytesize.to_s }, [html]]
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
