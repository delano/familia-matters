# config.ru
#
# frozen_string_literal: true
#
# Runnable Otto (Rack 3) application for familia-admin. Composes:
#   * a real Familia backend (Valkey at 127.0.0.1:6379) with encrypted fields,
#   * the Otto API + PASETO auth strategies mounted under /admin/api and /_mcp,
#   * static serving of the design assets (resources/01-designs) at the web root.
#
# Boot:  bundle exec rackup            (or: bundle exec puma)
# Seed:  bundle exec rake db:seed
# Token: bundle exec rake auth:token   (admin)  /  auth:token:reveal_only

require 'rubygems'
require 'bundler/setup'

APP_ROOT = File.expand_path(__dir__)
$LOAD_PATH.unshift(File.join(APP_ROOT, 'lib'))

require 'rack'
require 'rack/static'
require 'otto'

# ---------------------------------------------------------------------------
# Familia connection + encryption + models + admin code (shared with rake).
# ---------------------------------------------------------------------------
require 'familia/admin/boot'
Familia::Admin::Boot.setup!(APP_ROOT)

# ---------------------------------------------------------------------------
# Otto app (API + auth)
# ---------------------------------------------------------------------------
ROUTES_PATH = File.join(APP_ROOT, 'resources', '00-assets', 'routes.txt')

otto = Otto.new(ROUTES_PATH, {
  # API errors should always come back as JSON; the routes already declare
  # response=json per-route, and the auth wrapper honors it for 401/403 too.
})

# Register the PASETO-backed strategy under both 'role' and 'permission' so that
# `auth=role:admin` and `auth=permission:NAME` requirements resolve to it.
Familia::Admin::Auth.register!(otto)

# ---------------------------------------------------------------------------
# Static design assets
# ---------------------------------------------------------------------------
# Babel fetches *.jsx over HTTP; without a JS content-type the browser refuses
# to execute them. Register the MIME types before Rack::Static is built.
require 'rack/mime'
Rack::Mime::MIME_TYPES['.jsx'] = 'application/javascript'
Rack::Mime::MIME_TYPES['.mjs'] = 'application/javascript'
Rack::Mime::MIME_TYPES['.js']  = 'application/javascript'

DESIGNS_DIR = File.join(APP_ROOT, 'resources', '01-designs')

# ---------------------------------------------------------------------------
# Compose: /admin/api/* and /_mcp -> Otto; everything else -> static designs.
# Rack::Static serves files under DESIGNS_DIR (filenames may contain spaces;
# Rack unescapes PATH_INFO before lookup). index.html falls back to the shell.
# ---------------------------------------------------------------------------
static_app = Rack::Builder.new do
  use Rack::Static,
      urls: [''],
      root: DESIGNS_DIR,
      index: 'Familia Admin.html',
      cascade: true
  run ->(_env) { [404, { 'content-type' => 'text/plain' }, ['Not found']] }
end.to_app

# Path-prefix dispatch WITHOUT rewriting PATH_INFO: Otto's routes are defined
# against the full '/admin/api/...' and '/_mcp' paths, so (unlike Rack::Builder
# #map) we must hand the unmodified env to Otto. Anything else is a static asset.
API_PREFIXES = ['/admin/api', '/_mcp'].freeze

app = lambda do |env|
  path = env['PATH_INFO'].to_s
  if API_PREFIXES.any? { |p| path == p || path.start_with?("#{p}/") }
    otto.call(env)
  else
    static_app.call(env)
  end
end

run app
