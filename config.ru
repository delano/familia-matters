# config.ru
#
# frozen_string_literal: true
#
# Runnable Otto (Rack 3) application for familia-admin. Composes:
#   * a real Familia backend (Valkey at 127.0.0.1:6379) with encrypted fields,
#   * the Otto API + PASETO auth strategies mounted under /admin/api and /_mcp,
#   * the CSRF OriginGuard in front of state-changing routes,
#   * the login SPA (vite build -> dist/) served under /login,
#   * the design assets (resources/01-designs) at the web root, gated behind a
#     valid session cookie (unauthenticated browsers redirect to /login).
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
# ---------------------------------------------------------------------------
require 'familia/admin/boot'
Familia::Admin::Boot.setup!(APP_ROOT)

# ---------------------------------------------------------------------------
# HTTP stack: OriginGuard -> (/admin/api + /_mcp -> Otto) | static designs.
# ---------------------------------------------------------------------------
require 'familia/admin/rack_app'

run Familia::Admin::RackApp.build(APP_ROOT)
