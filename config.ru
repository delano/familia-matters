# config.ru
#
# frozen_string_literal: true
#
# Runnable Otto (Rack 3) application for familia-admin. Composes:
#   * a real Familia backend (Valkey at 127.0.0.1:6379) with encrypted fields,
#   * the Otto API + PASETO auth strategies mounted under /admin/api and /_mcp,
#   * the CSRF OriginGuard in front of state-changing routes,
#   * the Vite SPA (vite build -> dist/) served at /login and, behind a valid
#     session cookie, at the web root (unauthenticated browsers redirect to
#     /login).
#
# The HTTP stack is assembled by Familia::Admin::RackApp.build so this server and
# the contract suite (try/test_helper.rb) share an identical app.
#
# Boot:   bundle exec rackup           (dev only; binds localhost by default)
#         bundle exec puma             (loads config/puma.rb: bind pinned to
#                                       127.0.0.1, port via FAMILIA_ADMIN_PORT)
#         Production must boot via puma, never rackup — rackup overrides the
#         config-file bind with its own 0.0.0.0 production default;
#         config/puma.rb aborts a production rackup boot for that reason.
#         See README "Deploying to production".
# Seed:   bundle exec rake db:seed
# Login:  set FAMILIA_ADMIN_PASSPHRASE, pnpm build, then open /  (-> /login)
# Token:  bundle exec rake auth:token  (Bearer for curl/CI/MCP; browsers use /login)

require 'rubygems'
require 'bundler/setup'

APP_ROOT = File.expand_path(__dir__)
$LOAD_PATH.unshift(File.join(APP_ROOT, 'lib'))

# ---------------------------------------------------------------------------
# Familia connection + encryption + models + admin code (shared with rake).
#
# Three boot modes, selected by FAMILIA_ADMIN_APP (see "Admin your own
# application" in the README):
#   * FAMILIA_ADMIN_APP set    -> setup_host_app!: require your app (it owns the
#                                 Familia config + registers its models), then run
#                                 the embedded path. The way to admin OneTimeSecret.
#   * FAMILIA_ADMIN_MODELS set -> setup! reflects your model files under the
#                                 admin-owned standalone config.
#   * neither set              -> the bundled demo fixtures (Customer/Session/ApiKey).
# ---------------------------------------------------------------------------
require 'familia/admin/boot'
host_app = ENV['FAMILIA_ADMIN_APP'].to_s.strip
if host_app.empty?
  Familia::Admin::Boot.setup!(APP_ROOT)
else
  Familia::Admin::Boot.setup_host_app!(host_app)
end

# ---------------------------------------------------------------------------
# HTTP stack: OriginGuard -> (/admin/api + /_mcp -> Otto) | static designs.
# ---------------------------------------------------------------------------
require 'familia/admin/rack_app'

run Familia::Admin::RackApp.build(APP_ROOT)
