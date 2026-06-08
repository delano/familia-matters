# frozen_string_literal: true
#
# Shared harness for the contract tests. Boots Familia against an isolated test
# database, seeds the canonical dataset (with integrity drift), registers admin
# + read-only tokens, and exposes Rack::Test helpers plus a fixture shape
# matcher so the tests can assert that live responses match the shapes the
# prototype consumed (fixtures/*.json).

require 'bundler/setup'
$LOAD_PATH.unshift File.expand_path('../lib', __dir__)

require 'familia/admin'
require_relative '../lib/familia/admin/seed'
require 'rack/test'
require 'json'

module TryHelper
  module_function

  TEST_URI = ENV.fetch('ADMIN_TEST_URI', 'redis://127.0.0.1:6379/9')

  # Boot once per process (re-loading the model file would redefine fields and
  # Familia rejects that); every call re-flushes and re-seeds the test DB.
  def boot_once!
    return if @booted

    Familia::Admin::Boot.boot!(uri: TEST_URI)
    @booted = true
  end

  def boot_and_seed!(drift: true)
    boot_once!
    Familia.dbclient.flushdb
    Familia::Admin::Auth.reset!
    Familia::Admin::Auth.register('admintok', actor: 'admin_42', role: 'admin',
                                  permissions: Familia::Admin::Auth::ELEVATED_PERMISSIONS)
    Familia::Admin::Auth.register('rotok', actor: 'ro_admin', role: 'admin', permissions: [])
    Familia::Admin::Seed.run!(drift: drift)
    Familia::Admin::Migrations.seed!
    self
  end

  def session
    @session ||= Rack::Test::Session.new(Rack::MockSession.new(Familia::Admin::App.build(security: true)))
  end

  def auth(token)
    token ? { 'HTTP_AUTHORIZATION' => "Bearer #{token}" } : {}
  end

  def get(path, token: 'admintok')
    session.get(path, {}, auth(token))
  end

  def post(path, body = {}, token: 'admintok')
    session.post(path, body.is_a?(String) ? body : body.to_json,
                 auth(token).merge('CONTENT_TYPE' => 'application/json'))
  end

  def put(path, body = {}, token: 'admintok')
    session.put(path, body.to_json, auth(token).merge('CONTENT_TYPE' => 'application/json'))
  end

  def delete(path, token: 'admintok')
    session.delete(path, {}, auth(token))
  end

  def json(resp)
    JSON.parse(resp.body)
  rescue StandardError
    {}
  end

  # GET and parse in one step.
  def get_json(path, token: 'admintok')
    json(get(path, token: token))
  end

  def fixture(name)
    JSON.parse(File.read(File.expand_path("../fixtures/#{name}", __dir__)))
  end

  # SSE helper: collect the data: events from a streamed body into parsed hashes.
  def sse_events(resp)
    resp.body.scan(/^data: (.+)$/).flatten.map { |line| JSON.parse(line) rescue { 'raw' => line } }
  end

  # True when every key/structure in `fixture` is present and type-compatible in
  # `actual`. Keys that are fixture annotations (endpoint/_note/_key/anything
  # starting with "_") are ignored. Lenient on string-vs-number scalars because
  # Familia returns Redis hash values as strings.
  def shape_match?(fixture, actual)
    case fixture
    when Hash
      return false unless actual.is_a?(Hash)

      fixture.all? do |k, v|
        next true if k.to_s.start_with?('_') || %w[endpoint count_fast_note].include?(k.to_s)

        actual.key?(k.to_s) && shape_match?(v, actual[k.to_s])
      end
    when Array
      return false unless actual.is_a?(Array)
      return true if fixture.empty? || actual.empty?

      shape_match?(fixture.first, actual.first)
    else
      type_compat?(fixture, actual)
    end
  end

  def type_compat?(fixture, actual)
    return true if fixture.nil? || actual.nil?
    return true if fixture.is_a?(Numeric) && (actual.is_a?(Numeric) || numeric_string?(actual))
    return [TrueClass, FalseClass].include?(actual.class) if [TrueClass, FalseClass].include?(fixture.class)
    return actual.is_a?(String) if fixture.is_a?(String)

    true
  end

  def numeric_string?(value)
    value.is_a?(String) && value.match?(/\A-?\d+(\.\d+)?\z/)
  end
end
