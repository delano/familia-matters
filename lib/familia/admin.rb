# frozen_string_literal: true

require 'familia'

# Familia::Admin
#
# A model-aware admin backend for applications built on Familia (a Ruby object
# layer over Redis/Valkey), served through the Otto framework. This file is the
# single require entry point: it loads the reflection descriptor, the contract
# serializers, the audit sink, the raw-command allowlist, the streaming bodies,
# and the Otto controller (`Admin::API`).
#
# The descriptor is the frontend's source of truth; every screen builds itself
# from `GET /admin/api/_meta`. The controller turns the routes file into typed
# CRUD, integrity, migration, raw-explorer, and live-stream endpoints, all of
# which emit the exact JSON shapes the design prototype consumed (see
# `fixtures/*.json`, pinned as contract tests in `try/`).
#
module Familia
  module Admin
    # Raised by controller helpers to short-circuit an action with a specific
    # HTTP status and JSON body. Caught at the edge of every action so the
    # `klass = resolve_model! or return ...` flow stays readable.
    class Halt < StandardError
      attr_reader :status, :payload

      def initialize(status, payload)
        @status = status
        @payload = payload
        super(payload.is_a?(Hash) ? (payload[:error] || payload['error']).to_s : payload.to_s)
      end
    end

    module_function

    # Process-wide configuration for the admin. Apps tune these at boot; the
    # defaults are safe (audit enabled, raw explorer read-only) so an
    # unconfigured mount cannot do anything dangerous.
    #
    # @return [Familia::Admin::Configuration]
    def config
      @config ||= Configuration.new
    end

    # @yieldparam config [Familia::Admin::Configuration]
    def configure
      yield config if block_given?
      config
    end

    # Enable Familia's per-command instrumentation so the live command feed
    # (`GET /admin/api/stream/commands`) receives events. Idempotent. This adds
    # observability overhead to EVERY database command process-wide, so it is
    # opt-in (off unless `config.command_stream_enabled` / ADMIN_COMMAND_STREAM).
    def enable_command_capture!
      return if @command_capture_enabled

      Familia.enable_database_logging = true if Familia.respond_to?(:enable_database_logging=)
      @command_capture_enabled = true
    end

    # Holds the tunable policy for an admin mount. Everything here is a security
    # boundary, so each option is documented with its blast radius.
    class Configuration
      # Permission tier strings (must match the `auth=permission:NAME` tiers in
      # the routes file). Centralized so the controller's defense-in-depth checks
      # and the routes file never drift apart.
      attr_accessor :permission_reveal, :permission_repair,
                    :permission_run_migrations, :permission_raw_command

      # When true (default) the controller re-checks the elevated permission on
      # every gated action, even though Otto's auth middleware already enforced
      # the route's `auth=` tier. Belt-and-suspenders: a misconfigured route, or
      # a future refactor that drops the tier, still cannot leak a secret or run
      # a raw command.
      attr_accessor :enforce_permissions_in_controller

      # The audit sink. Defaults to a Familia-backed append-only log; swap for
      # your SIEM/external store. Must respond to #record(entry_hash).
      attr_accessor :audit_sink

      # Raw `run_command` is the dangerous path. Off by default: even a holder of
      # `permission:raw_command` gets `command_disabled` until an operator
      # explicitly turns it on for an app.
      attr_accessor :raw_command_enabled

      # Whether the live command feed is enabled. Off by default because it
      # requires process-wide command instrumentation (overhead on every query).
      attr_accessor :command_stream_enabled

      # Pagination guards (mirrored in Admin::API).
      attr_accessor :page_default, :page_max

      def initialize
        @permission_reveal = 'reveal_secrets'
        @permission_repair = 'repair'
        @permission_run_migrations = 'run_migrations'
        @permission_raw_command = 'raw_command'
        @enforce_permissions_in_controller = true
        @raw_command_enabled = false
        @command_stream_enabled = false
        @page_default = 50
        @page_max = 500
        @audit_sink = nil # lazily defaults to AuditLog.default
      end

      def audit_sink
        @audit_sink ||= Familia::Admin::AuditLog.default
      end
    end
  end
end

require_relative 'admin/descriptor'
require_relative 'admin/serializers'
require_relative 'admin/audit_log'
require_relative 'admin/raw_command'
require_relative 'admin/streaming'
require_relative 'admin/api'
require_relative 'admin/mcp'
