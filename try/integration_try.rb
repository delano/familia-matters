# frozen_string_literal: true

# Full-stack integration: drive the REAL Otto app (routes + token auth strategy +
# middleware) in-process via otto.call(env). This proves routing, header-token
# auth, the response=json serialization, and the streaming bodies end-to-end —
# the "real Otto backend", not just the controller in isolation.

require_relative 'helper'
require 'familia/admin/token_strategy'

AT.seed!
Familia::Admin.config.raw_command_enabled = true

# Two principals: a full admin, and a read-only admin (role only, no permissions).
ACL = {
  'admin' => { id: 'admin', role: 'admin', permissions: %w[reveal_secrets repair run_migrations raw_command] },
  'ro' => { id: 'ro', role: 'admin', permissions: [] },
}.freeze

OTTO = Otto.new(
  File.expand_path('../routes', __dir__),
  auth_strategies: {
    'role' => Familia::Admin::TokenStrategy.new(ACL),
    'permission' => Familia::Admin::TokenStrategy.new(ACL),
  },
)

module AT
  def self.http(method, path, token: nil, json: nil)
    headers = {}
    headers['HTTP_AUTHORIZATION'] = "Bearer #{token}" if token
    opts = { method: method.to_s.upcase }.merge(headers)
    if json
      opts[:input] = JSON.generate(json)
      opts['CONTENT_TYPE'] = 'application/json'
    end
    status, _h, body = OTTO.call(Rack::MockRequest.env_for("/admin/api#{path}", opts))
    chunks = []
    body.each { |c| chunks << c }
    body.close if body.respond_to?(:close)
    text = chunks.join
    parsed = begin
      JSON.parse(text, symbolize_names: true)
    rescue StandardError
      text
    end
    [status, parsed]
  end
end

## GET /_meta with an admin token routes through Otto and returns the descriptor
st, b = AT.http(:get, '/_meta', token: 'admin')
[st, b[:models].is_a?(Array)]
#=> [200, true]

## an unauthenticated request is rejected by Otto's auth layer (not 200)
AT.http(:get, '/models', token: nil).first != 200
#=> true

## GET /models/:model/records lists records as JSON through the full stack
st, b = AT.http(:get, '/models/customer/records', token: 'admin')
[st, b[:model], b[:records].is_a?(Array)]
#=> [200, "customer", true]

## POST create routes through (csrf=exempt + token auth) and returns 201
st, b = AT.http(:post, '/models/customer/records', token: 'admin',
                json: { fields: { custid: 'cust_int1', email: 'int@example.com', name: 'Int', status: 'active', created_at: 1_730_000_000 } })
[st, b[:created], b[:id]]
#=> [201, true, "cust_int1"]

## reveal with the admin token returns the plaintext through the full stack
st, b = AT.http(:post, '/models/customer/records/cust_8f2a91/reveal/api_secret', token: 'admin', json: {})
[st, b[:api_secret]]
#=> [200, "sk_live_9f8c2a7b1e4d6093"]

## reveal with the READ-ONLY token is rejected by the permission tier (not 200)
AT.http(:post, '/models/customer/records/cust_8f2a91/reveal/api_secret', token: 'ro', json: {}).first != 200
#=> true

## the raw FLUSHALL is refused (403) even through the HTTP stack
st, b = AT.http(:post, '/raw/command', token: 'admin', json: { cmd: 'FLUSHALL' })
[st, b[:error]]
#=> [403, "command_blocked"]

## the integrity endpoint returns the audit-report contract through the stack
st, b = AT.http(:get, '/integrity/customer', token: 'admin')
[st, b.key?(:summary), b[:instances].is_a?(Hash)]
#=> [200, true, true]

## the repair stream (a GET SSE route) streams text/event-stream start..done
Customer.instances.add('phantom_int_1', Familia.now.to_i)
status, headers, body = OTTO.call(Rack::MockRequest.env_for('/admin/api/stream/repair/customer',
                                                            method: 'GET',
                                                            'HTTP_AUTHORIZATION' => 'Bearer admin'))
frames = []; body.each { |c| frames << c }; body.close if body.respond_to?(:close)
events = frames.join.scan(/^data: (.+)$/).map { |m| JSON.parse(m[0], symbolize_names: true) }
[status, headers['content-type'], events.first[:event], events.last[:event]]
#=> [200, "text/event-stream", "start", "done"]

## the command-stream route (GET SSE) is reachable and opens a stream
status, headers, body = OTTO.call(Rack::MockRequest.env_for('/admin/api/stream/commands',
                                                            method: 'GET',
                                                            'HTTP_AUTHORIZATION' => 'Bearer admin'))
first = body.to_enum(:each).next
body.close if body.respond_to?(:close)
[status, headers['content-type'], first.start_with?('data:')]
#=> [200, "text/event-stream", true]
