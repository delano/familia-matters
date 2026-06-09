# config.ru
#
# frozen_string_literal: true
#
# Runnable Otto (Rack 3) application for familia-admin. Composes:
#   * a real Familia backend (Valkey at 127.0.0.1:6379) with encrypted fields,
#   * the Otto API + PASETO auth strategies mounted under /admin/api and /_mcp,
#   * the CSRF OriginGuard in front of state-changing routes,
#   * static serving of the design assets (resources/01-designs) at the web root.
#
# The HTTP stack is assembled by Familia::Admin::RackApp.build so this server and
# the contract suite (try/test_helper.rb) share an identical app.
#
# Boot:  bundle exec rackup            (or: bundle exec puma)
# Seed:  bundle exec rake db:seed
# Token: bundle exec rake auth:token   (admin)  /  auth:token:reveal_only
# Login: set FAMILIA_ADMIN_PASSPHRASE, then POST /admin/api/auth/login

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
