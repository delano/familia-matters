# frozen_string_literal: true

# try/helper.rb — shared setup for the familia-admin contract + security suite.
#
# These tests drive the REAL controller against a REAL Redis/Valkey with the REAL
# Familia models, exactly the way Otto invokes it (Admin::API.new(req, res) then
# `instance.send(action)`), and assert the responses match the JSON shapes the
# design prototype consumed (fixtures/*.json). That is the "fixtures are the
# seam" guarantee made executable: if the live response and the fixture diverge,
# a test fails.
#
# Everything lives under the AT (AdminTry) module on purpose. A top-level
# `def call` would define Object#call and collide with the bare `.call` Familia
# uses internally on scan enumerators — so harness helpers are namespaced, never
# global.

require 'json'
require 'securerandom'
require 'base64'

$LOAD_PATH.unshift(File.expand_path('../lib', __dir__))

require 'familia'
require 'otto'
require 'rack/mock'

# Use a dedicated logical database for tests so a run never touches dev data.
TEST_DB = (ENV['FAMILIA_TEST_DB'] || '15').to_i
Familia.uri = "redis://127.0.0.1:6379/#{TEST_DB}" if Familia.respond_to?(:uri=)

Familia.configure do |c|
  c.encryption_keys = { v1: ENV['FAMILIA_TEST_KEY'] || Base64.strict_encode64(SecureRandom.bytes(32)) }
  c.current_key_version = :v1
end

require 'familia/admin'
require_relative '../fixtures/models'

module AT
  module_function

  SR = Otto::Security::Authentication::StrategyResult
  ALL_PERMS = %w[reveal_secrets repair run_migrations raw_command].freeze
  FIXTURES = File.expand_path('../fixtures', __dir__)

  # Invoke a controller action the way Otto does and return [status, body].
  #
  # @param action [Symbol]
  # @param params [Hash] route + query params (become req.params)
  # @param body [Hash, nil] JSON request body
  # @param perms [Array<String>, :none] permissions for the synthetic admin, or
  #   :none to send no strategy_result at all (simulates an unauthenticated edge)
  def api(action, params: {}, body: nil, perms: ALL_PERMS)
    query = params.empty? ? '' : "?#{URI.encode_www_form(params)}"
    opts = { 'CONTENT_TYPE' => 'application/json' }
    opts[:input] = JSON.generate(body) if body
    env = Rack::MockRequest.env_for(query.empty? ? '/' : query, opts)
    env['otto.strategy_result'] = strategy(perms) unless perms == :none

    res = Otto::Response.new
    out = Admin::API.new(Otto::Request.new(env), res).public_send(action)
    [res.status || 200, out]
  end

  # Just the body, for terse assertions.
  def body(action, **kwargs)
    api(action, **kwargs)[1]
  end

  def status(action, **kwargs)
    api(action, **kwargs)[0]
  end

  # The full Otto::Response object — needed for streaming endpoints where the
  # body, status, and SSE headers are what matter.
  def response(action, params: {}, body: nil, perms: ALL_PERMS)
    query = params.empty? ? '' : "?#{URI.encode_www_form(params)}"
    opts = { 'CONTENT_TYPE' => 'application/json' }
    opts[:input] = JSON.generate(body) if body
    env = Rack::MockRequest.env_for(query.empty? ? '/' : query, opts)
    env['otto.strategy_result'] = strategy(perms) unless perms == :none
    res = Otto::Response.new
    Admin::API.new(Otto::Request.new(env), res).public_send(action)
    res
  end

  def strategy(perms)
    SR.new(
      session: {},
      user: { id: 'admin_42', role: 'admin', permissions: Array(perms) },
      auth_method: 'token',
      metadata: {},
      strategy_name: 'test',
    )
  end

  # Drain an SSE streaming body into its decoded `data:` events (ignoring
  # heartbeats/comments).
  def drain_sse(rack_body)
    frames = []
    rack_body.each { |chunk| frames << chunk }
    frames.join.scan(/^data: (.+)$/).map { |m| JSON.parse(m[0], symbolize_names: true) }
  ensure
    rack_body.close if rack_body.respond_to?(:close)
  end

  def fixture(name)
    JSON.parse(File.read(File.join(FIXTURES, name)), symbolize_names: true)
  end

  # Structural contract check: every key in `contract` (except meta keys like
  # _note/endpoint) must exist in `live` with a type-compatible value. Optional
  # keys are skipped — they are metadata the prototype tolerated being absent.
  OPTIONAL_KEYS = %i[json_schema logical_database internals safe_dump_fields
                     count_fast_note _note _key _audit endpoint generated_at].freeze

  def covers_shape?(live, contract)
    case contract
    when Hash
      return false unless live.is_a?(Hash)

      contract.all? do |k, v|
        next true if meta_key?(k) || OPTIONAL_KEYS.include?(k)

        # Key-type tolerant: dynamic-content hashes (hashkey entries) carry
        # string keys on the wire; schema hashes carry symbol keys here.
        live_val = live.key?(k) ? live[k] : live[k.to_s]
        next false unless live.key?(k) || live.key?(k.to_s)

        covers_shape?(live_val, v)
      end
    when Array
      return false unless live.is_a?(Array)
      return true if contract.empty? || live.empty?

      covers_shape?(live.first, contract.first)
    when Numeric then live.is_a?(Numeric)
    when true, false then [true, false].include?(live)
    when nil then true
    else
      # Contract scalar string. The live hash holds Ruby Symbols for names /
      # categories that become strings on the wire (JSON), so accept both.
      live.is_a?(String) || live.is_a?(Symbol) || live.nil?
    end
  end

  def meta_key?(key)
    key.to_s.start_with?('_') || %i[endpoint].include?(key)
  end

  # Canonical fixture dataset, seeded into a freshly flushed db. Mirrors
  # records.sample.json so live responses can be compared to it.
  def seed!
    Familia.dbclient.flushdb

    alice = Customer.build(custid: 'cust_8f2a91', email: 'alice@example.com', name: 'Alice Ng',
                           status: 'active', created_at: 1_730_419_200, updated_at: 1_748_736_000) do |o|
      o.domains.add('example.com', 1_730_419_200)
      o.domains.add('alice.dev', 1_733_097_600)
      o.domains.add('ng.consulting', 1_744_761_600)
      o.metadata['signup_source'] = 'referral'
      o.metadata['plan'] = 'team'
      o.metadata['region'] = 'eu-west'
      o.feature_flags.add('beta')
    end
    alice.login_count.incrementby(318)
    alice.api_secret = 'sk_live_9f8c2a7b1e4d6093'
    alice.save

    Customer.build(custid: 'cust_4410bd', email: 'bob@example.com', name: 'Bob Tran',
                   status: 'pending', created_at: 1_733_011_200, updated_at: 1_733_011_200)
    Customer.build(custid: 'cust_2200ee', email: 'erin@example.com', name: 'Erin Diaz',
                   status: 'inactive', created_at: 1_727_740_800, updated_at: 1_746_057_600)

    ApiKey.build(keyid: 'key_77c3', custid: 'cust_8f2a91', label: 'CI deploy token',
                 created_at: 1_738_368_000, last_used_at: 1_748_908_800) do |k|
      k.secret = 'sk_key_secret_value'
    end

    :seeded
  end
end
