# frozen_string_literal: true
#
# Rackup entry point for the Familia Admin API (and, when built, the SPA).
#
#   bundle exec rackup            # http://localhost:9292
#   bundle exec puma              # streaming-capable server
#
# Boots Familia (connection + encryption keys + models + migrations), seeds the
# admin auth tokens, and builds the Otto app with CSRF protection + input
# validation. If web/dist exists (the built frontend), it is served with an
# SPA fallback; otherwise this is the JSON API alone.

require 'bundler/setup'
$LOAD_PATH.unshift File.expand_path('lib', __dir__)

require 'familia/admin'
require 'rack'

Familia::Admin::Boot.boot!
Familia::Admin::Auth.load_from_env!

otto = Familia::Admin::App.build

frontend = File.expand_path('web/dist', __dir__)

if File.directory?(frontend)
  require 'rack/static'
  use Rack::Static, urls: ['/assets', '/vendor', '/fonts', '/favicon.ico'], root: frontend

  run lambda { |env|
    status, headers, body = otto.call(env)
    # SPA fallback: serve index.html for client-side routes (non-API GETs).
    if status == 404 && env['REQUEST_METHOD'] == 'GET' && !env['PATH_INFO'].start_with?('/admin/')
      index = File.join(frontend, 'index.html')
      return [200, { 'content-type' => 'text/html' }, [File.read(index)]] if File.exist?(index)
    end
    [status, headers, body]
  }
else
  run otto
end
