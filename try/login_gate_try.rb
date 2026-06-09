# try/login_gate_try.rb
#
# LOGIN-GATEWAY domain -- the browser entry flow that puts the prototype UI
# behind the session cookie (rack_app.rb dispatch/login_app):
#
#   * unauthenticated browser hits on the static designs 302 to
#     /login?return_to=<original path+query>;
#   * a valid session cookie passes the gate; garbage/expired cookies do not;
#   * /login itself is NEVER gated (no redirect loop) and serves the built SPA
#     (or the operator build hint when dist/ is absent);
#   * the API surface is untouched -- Bearer clients keep seeing 401/403
#     statuses from Otto's route auth, never a redirect.
#
# Drives the SAME full app config.ru runs (RackApp.build) via Rack::MockRequest;
# the SPA-serving cases use login_app against a temp dist so they are
# deterministic whether or not `npm run build` has run in this checkout.

require_relative 'test_helper'

require 'rack/mock'
require 'tmpdir'

FULL_APP = Familia::Admin::RackApp.build(APP_ROOT) unless defined?(FULL_APP)
BROWSER  = Rack::MockRequest.new(FULL_APP) unless defined?(BROWSER)

unless defined?(FAKE_DIST)
  FAKE_DIST = Dir.mktmpdir('login-dist')
  File.write(File.join(FAKE_DIST, 'index.html'), '<!doctype html><div id="root">LOGIN-SPA</div>')
  Dir.mkdir(File.join(FAKE_DIST, 'assets'))
  File.write(File.join(FAKE_DIST, 'assets', 'app.js'), 'console.log("built")')
end
LOGIN_SPA = Rack::MockRequest.new(Familia::Admin::RackApp.login_app(FAKE_DIST)) unless defined?(LOGIN_SPA)

def gate_cookie(token)
  { 'HTTP_COOKIE' => "#{Familia::Admin::Auth::SESSION_COOKIE}=#{token}" }
end

# ===========================================================================
# THE GATE: static designs require a verifiable session cookie.
# ===========================================================================

## an unauthenticated browser hit on the prototype root redirects to the login gateway
res = BROWSER.get('/')
[res.status, res.headers['location']]
#=> [302, "/login?return_to=%2F"]

## the original path AND query round-trip through return_to. PATH_INFO arrives
## still percent-encoded, so one URLSearchParams decode in the SPA yields the
## exact original request target ('/Familia%20Admin.html?screen=records').
res = BROWSER.get('/Familia%20Admin.html?screen=records')
res.headers['location']
#=> "/login?return_to=%2FFamilia%2520Admin.html%3Fscreen%3Drecords"

## a valid session cookie passes the gate to the design assets
tok = Familia::Admin::Auth.mint_session(ttl: 60)
res = BROWSER.get('/', gate_cookie(tok))
[res.status, res.body.include?('<')]
#=> [200, true]

## a garbage cookie is redirected, not served
res = BROWSER.get('/', gate_cookie('not-a-paseto'))
res.status
#=> 302

## an expired session is redirected back to login
expired = Familia::Admin::Auth.mint_session(ttl: -10)
res = BROWSER.get('/', gate_cookie(expired))
res.status
#=> 302

# ===========================================================================
# NO LOOPS, NO API INTERCEPTION.
# ===========================================================================

## /login itself is never gated -- a redirect here would loop forever
res = BROWSER.get('/login')
[res.status == 301, res.status == 302]
#=> [false, false]

## the API stays Otto's: an unauthenticated API request is a 401 status, not a redirect
res = BROWSER.get('/admin/api/_meta')
res.status
#=> 401

## a Bearer client works through the full app unchanged (no cookie, no redirect)
bearer = Familia::Admin::Auth.mint(sub: 'curl@test', role: 'admin', ttl: 60)
res = BROWSER.get('/admin/api/_meta', 'HTTP_AUTHORIZATION' => "Bearer #{bearer}")
res.status
#=> 200

# ===========================================================================
# THE LOGIN SPA APP: index, hashed assets, SPA fallback, missing-build hint.
# ===========================================================================

## /login serves the built SPA index
res = LOGIN_SPA.get('/login')
[res.status, res.body.include?('LOGIN-SPA')]
#=> [200, true]

## hashed assets resolve under /login/assets/
res = LOGIN_SPA.get('/login/assets/app.js')
[res.status, res.body.include?('built')]
#=> [200, true]

## any other /login path falls back to the SPA index (client routing)
res = LOGIN_SPA.get('/login/deep/link')
[res.status, res.body.include?('LOGIN-SPA')]
#=> [200, true]

## a missing build yields the operator hint, not a crash
empty = Rack::MockRequest.new(Familia::Admin::RackApp.login_app(Dir.mktmpdir('no-dist')))
res = empty.get('/login')
[res.status, res.body.include?('npm run build')]
#=> [503, true]
