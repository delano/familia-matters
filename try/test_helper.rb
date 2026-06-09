# try/test_helper.rb
#
# frozen_string_literal: true
#
# In-process Rack::Test harness for the Phase 2 contract suite. It boots the
# SAME Otto app config.ru builds (boot.setup! + Otto.new(routes) + Auth.register!)
# and drives it with Rack::Test, so every assertion runs against the real
# controller, real PASETO auth, and live Valkey -- no HTTP server, no stubs.
#
# Usage in a *_try.rb file:
#   require_relative 'test_helper'
#   reset_and_seed!
#   status, json = adm_get('/admin/api/_meta')
#
# All request helpers return [status, parsed_json]. The Authorization header and
# JSON content-type are attached automatically; pass a token from admin_token /
# reduced_token / custom_token(perms:).

require 'rubygems'
require 'bundler/setup'

APP_ROOT = File.expand_path('..', __dir__) unless defined?(APP_ROOT)
$LOAD_PATH.unshift(File.join(APP_ROOT, 'lib'))

require 'json'
require 'stringio'
require 'securerandom'

# Pin the dev environment BEFORE booting. This is the dev harness running with
# the dev-default PASETO/encryption keys, and bug #7's fixer adds a guard that
# refuses to boot when RACK_ENV != development with those defaults. Without this
# pin, that guard would raise inside Boot.setup! post-fix and break every domain
# file via this require. boot_try.rb tests the guard itself in isolated
# subprocesses (RACK_ENV passed through `system`), so pinning here is safe.
ENV['RACK_ENV'] = 'development'

# A known shared passphrase so auth_try can exercise a successful login. Set
# before boot; Passphrase reads ENV at call time. ||= so a real env value wins.
ENV['FAMILIA_ADMIN_PASSPHRASE'] ||= 'test-passphrase-correct-horse-battery'

require 'familia/admin/boot'
Familia::Admin::Boot.setup!(APP_ROOT)

require 'otto'
require 'rack/test'
require 'familia/admin/rack_app'

# ---------------------------------------------------------------------------
# The Otto app: identical wiring to config.ru. Otto logs MCP route-load errors
# to stderr (Admin::MCP is not implemented); that is expected noise and does not
# affect the HTTP routes under test. Silence it so the test output stays clean.
# ---------------------------------------------------------------------------
ROUTES_PATH = File.join(APP_ROOT, 'resources', '00-assets', 'routes.txt') unless defined?(ROUTES_PATH)

# Build the SAME stack config.ru serves for the API: OriginGuard -> Otto (with the
# PASETO strategies). Routing the suite through api_app means the CSRF guard is
# under test, not bypassed. Static serving is omitted (no contract test needs it).
def build_app!
  Familia::Admin::RackApp.api_app(Familia::Admin::RackApp.otto(APP_ROOT))
end

OTTO_APP = build_app! unless defined?(OTTO_APP)

# Rack::Test wants a Rack app exposed via #app. We mix the helpers into the
# top-level object so the bare method calls inside each test resolve here.
module AdminTestHarness
  include Rack::Test::Methods

  def app
    OTTO_APP
  end

  # ----- tokens ----------------------------------------------------------

  # Full elevated admin: every permission routes.txt gates on.
  def admin_token
    @admin_token ||= Familia::Admin::Auth.mint(
      sub: 'admin@test', role: 'admin',
      permissions: %w[reveal_secrets repair run_migrations raw_command], ttl: 600
    )
  end

  # role:admin with NO elevated permissions (the gate-test token).
  def reduced_token
    @reduced_token ||= Familia::Admin::Auth.mint(
      sub: 'readonly@test', role: 'admin', permissions: [], ttl: 600
    )
  end

  # Arbitrary permission set (e.g. raw_command only).
  def custom_token(perms: [], role: 'admin', sub: 'custom@test')
    Familia::Admin::Auth.mint(sub: sub, role: role, permissions: Array(perms), ttl: 600)
  end

  # ----- cookie / login helpers ------------------------------------------
  #
  # The shared login passphrase the harness configures (see ENV pin above).
  TEST_PASSPHRASE = ENV.fetch('FAMILIA_ADMIN_PASSPHRASE')
  # Same-origin string for Rack::Test's default host, so OriginGuard allows a
  # cookie-authenticated mutation (a foreign value is the CSRF-blocked case).
  SAME_ORIGIN = 'http://example.org'

  # Rack header carrying the session cookie with the given token value.
  def cookie_headers(token, json: true, origin: nil)
    h = { 'HTTP_COOKIE' => "#{Familia::Admin::Auth::SESSION_COOKIE}=#{token}" }
    if json
      h['CONTENT_TYPE'] = 'application/json'
      h['HTTP_ACCEPT']  = 'application/json'
    end
    h['HTTP_ORIGIN'] = origin if origin
    h
  end

  # Extract the session-cookie value Set by the last response (nil if none/blank).
  def set_session_cookie_value
    raw = last_response.headers['set-cookie'] || last_response.headers['Set-Cookie']
    return nil unless raw

    m = Array(raw).join("\n").match(/#{Familia::Admin::Auth::SESSION_COOKIE}=([^;\s]*)/)
    m && m[1]
  end

  # The Set-Cookie attribute segments (lowercased, e.g. 'httponly', 'secure',
  # 'samesite=strict'), excluding the leading name=value pair. Splitting on ';'
  # is robust against the token value (base64url, no ';') matching by accident.
  def set_cookie_attrs
    raw = last_response.headers['set-cookie'] || last_response.headers['Set-Cookie']
    return [] unless raw

    Array(raw).join("\n").split(';').map { |s| s.strip.downcase }
  end

  # POST the login endpoint with a passphrase. Returns [status, json].
  # ip: sets BOTH REMOTE_ADDR (rate-limit key, client IP) and SERVER_NAME, because
  # Otto::Request#local? (which drives the loopback-conditional Secure cookie)
  # requires the server name to be a localhost name too — not the client IP alone.
  def login(passphrase, ip: nil)
    headers = { 'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json' }
    if ip
      headers['REMOTE_ADDR'] = ip
      headers['SERVER_NAME'] = ip
    end
    post '/admin/api/auth/login', JSON.generate(passphrase: passphrase), headers
    parse_body
  end

  # Cookie-authenticated GET (no token header). Returns [status, json].
  def cookie_get(path, token)
    get path, {}, cookie_headers(token)
    parse_body
  end

  # Cookie-authenticated POST. Pass origin: to satisfy/trip the OriginGuard.
  def cookie_post(path, body = {}, token = nil, origin: SAME_ORIGIN)
    post path, JSON.generate(body), cookie_headers(token, origin: origin)
    parse_body
  end

  # DELETE the session endpoint (logout). Returns [status, json].
  def logout(token = nil)
    headers = { 'HTTP_ACCEPT' => 'application/json' }
    headers.merge!('HTTP_COOKIE' => "#{Familia::Admin::Auth::SESSION_COOKIE}=#{token}") if token
    delete '/admin/api/auth/session', nil, headers
    parse_body
  end

  # ----- request helpers (return [status, parsed_json]) ------------------

  def auth_headers(token, json: true)
    h = {}
    h['HTTP_AUTHORIZATION'] = "Bearer #{token}" if token
    if json
      h['CONTENT_TYPE'] = 'application/json'
      h['HTTP_ACCEPT']  = 'application/json'
    end
    h
  end

  def parse_body
    body = last_response.body.to_s
    return [last_response.status, nil] if body.empty?
    parsed = begin
      JSON.parse(body)
    rescue StandardError
      body
    end
    [last_response.status, parsed]
  end

  def adm_get(path, token = admin_token, params: {})
    get path, params, auth_headers(token)
    parse_body
  end

  def adm_post(path, body = {}, token = admin_token)
    post path, JSON.generate(body), auth_headers(token)
    parse_body
  end

  def adm_put(path, body = {}, token = admin_token)
    put path, JSON.generate(body), auth_headers(token)
    parse_body
  end

  def adm_delete(path, token = admin_token, body = nil)
    delete path, (body ? JSON.generate(body) : nil), auth_headers(token)
    parse_body
  end

  # SSE helper: issue the stream request, read the whole body, parse every
  # `data: {json}` frame into an array of event hashes (mirrors the client's
  # parseSSE). Returns [status, events].
  def adm_sse(path, token = admin_token)
    get path, {}, auth_headers(token, json: false).merge('HTTP_ACCEPT' => 'text/event-stream')
    events = parse_sse_frames(last_response.body.to_s)
    [last_response.status, events]
  end

  # Direct Otto.call returning the bare [status, headers, body] triplet WITHOUT
  # enumerating the body. Used for the stream_commands route, whose live body is
  # a 25-second SSE loop -- iterating it (as rack-test does on last_response.body)
  # would block the suite. The triplet's status/headers are set before any frame
  # is emitted, so this asserts the auth gate + SSE headers cheaply.
  def otto_call(path, token = admin_token, method: 'GET', accept: 'text/event-stream')
    env = {
      'REQUEST_METHOD' => method,
      'PATH_INFO'      => path,
      'QUERY_STRING'   => '',
      'rack.input'     => StringIO.new(''),
      'SERVER_NAME'    => 'test.local',
      'SERVER_PORT'    => '80',
      'HTTP_ACCEPT'    => accept,
    }
    env['HTTP_AUTHORIZATION'] = "Bearer #{token}" if token
    OTTO_APP.call(env) # [status, headers, body] -- DO NOT call body.each here
  end

  def parse_sse_frames(text)
    events = []
    text.split(/\r?\n\r?\n/).each do |block|
      data_lines = block.split(/\r?\n/).filter_map do |line|
        m = /^data:\s?(.*)$/.match(line)
        m && m[1]
      end
      next if data_lines.empty?

      payload = data_lines.join("\n").strip
      next if payload.empty?

      begin
        events << JSON.parse(payload)
      rescue StandardError
        # skip comment/keepalive frames
      end
    end
    events
  end

  # ----- reset + deterministic seed --------------------------------------
  #
  # Flushes db0 (Customer/ApiKey/AuditLog) AND db1 (Session), clears the audit
  # sink, then seeds a SMALL known dataset. Tests assert against THESE ids/values,
  # never the fixtures' illustrative literals.
  #
  # Seed (clean / healthy):
  #   Customers (db0): cust_alice  active   alice@example.com
  #                    cust_bob    inactive bob@example.com
  #                    cust_pending pending pending@example.com
  #   ApiKey   (db0):  key_alice_1 (participates in cust_alice :api_keys)
  #   Session  (db1):  sess_alice_1
  def reset_and_seed!
    now = seed_now

    Customer.dbclient.flushdb            # db0: Customer, ApiKey, AuditLog
    Session.dbclient.flushdb             # db1: Session
    # AuditLog.entries is a db0 class_sorted_set; the flushdb above clears it.

    seed_customers(now)
    seed_api_key(now)
    seed_session(now)
    now
  end

  def seed_now
    @seed_now ||= Time.now.to_i
  end

  SEED_CUSTOMERS = [
    { custid: 'cust_alice',   email: 'alice@example.com',   name: 'Alice Adams', status: 'active' },
    { custid: 'cust_bob',     email: 'bob@example.com',     name: 'Bob Brooks',  status: 'inactive' },
    { custid: 'cust_pending', email: 'pending@example.com', name: 'Pam Pending', status: 'pending' },
  ].freeze

  def seed_customers(now)
    SEED_CUSTOMERS.each do |attrs|
      c = Customer.new(attrs[:custid])
      c.email      = attrs[:email]
      c.name       = attrs[:name]
      c.status     = attrs[:status]
      c.created_at = now
      c.updated_at = now
      c.api_secret = "secret-#{attrs[:custid]}"
      c.save

      c.recent_logins.clear
      [now - 3600, now - 7200].each { |t| c.recent_logins << t.to_s }
      c.feature_flags.clear
      %w[beta_ui streaming].each { |f| c.feature_flags << f }
      c.domains.clear
      c.domains.add("#{attrs[:custid]}.example.com", now)
      c.metadata['plan'] = attrs[:status] == 'active' ? 'pro' : 'free'
      c.login_count.reset
      c.login_count.increment
    end
    Customer.rebuild_email_lookup if Customer.respond_to?(:rebuild_email_lookup)
    Customer.rebuild_status_index if Customer.respond_to?(:rebuild_status_index)
  end

  def seed_api_key(now)
    k = ApiKey.new('key_alice_1')
    k.custid       = 'cust_alice'
    k.label        = 'production'
    k.created_at   = now
    k.last_used_at = now
    k.secret       = 'apikey-key_alice_1'
    k.save
    alice = Customer.new('cust_alice')
    alice.api_keys.add(k.keyid, now) if alice.respond_to?(:api_keys)
  end

  def seed_session(now)
    s = Session.new('sess_alice_1')
    s.custid     = 'cust_alice'
    s.ip_address = '203.0.113.10'
    s.user_agent = 'SeedAgent/1.0'
    s.created_at = now
    s.save
  end
end

# Make the helpers available to the top-level binding each test runs in.
include AdminTestHarness
