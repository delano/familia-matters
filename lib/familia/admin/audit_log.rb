# frozen_string_literal: true

require 'json'

module Familia
  module Admin
    # Append-only admin audit trail.
    #
    # Every elevated or mutating action (reveal, create, update, destroy,
    # collection mutation, repair, migration run/rollback, raw command) is
    # recorded here BEFORE or alongside the side effect, attributed to the
    # authenticated principal.
    #
    # Storage is a Redis Stream (XADD), which is the right primitive for an
    # audit trail: entries are append-only and individually immutable, the
    # stream is strictly ordered, and each entry gets a server-assigned id
    # (`<ms>-<seq>`). We never expose update or delete. The stream lives on the
    # default Familia connection so it is independent of any one model's
    # logical database.
    #
    # Security notes:
    #   * Never record secret material. `reveal` records the field name, never
    #     the revealed plaintext.
    #   * A failure to write the audit entry must not crash the action, but it
    #     is logged loudly so a broken trail is visible.
    module AuditLog
      module_function

      STREAM_KEY = (ENV['ADMIN_AUDIT_STREAM'] || 'familia_admin:audit').freeze

      # Record one audit entry. Returns the stored entry (with its stream id).
      #
      # @param action [Symbol, String] the action name (e.g. :reveal)
      # @param actor [String] the authenticated principal id
      # @param details [Hash] additional structured context (model, id, field…)
      def record(action:, actor:, **details)
        entry = {
          at: Time.now.to_i,
          actor: (actor || 'unknown').to_s,
          action: action.to_s,
        }.merge(stringify_keys(details))

        emit_log(entry)
        id = append(entry)
        entry.merge(_id: id)
      rescue StandardError => e
        # Auditing must not take down the request, but a silent failure would
        # defeat the purpose — surface it.
        warn "[familia-admin] AUDIT WRITE FAILED: #{e.class}: #{e.message} entry=#{entry.to_json}"
        entry
      end

      # Most-recent entries, newest first. Used by the audit endpoint and tests.
      def recent(limit: 50)
        client.xrevrange(STREAM_KEY, '+', '-', count: limit).map do |(id, fields)|
          parse(id, fields)
        end
      rescue StandardError
        []
      end

      def count
        client.xlen(STREAM_KEY)
      rescue StandardError
        0
      end

      # --- internals -------------------------------------------------------

      def append(entry)
        # One JSON field keeps the entry atomic and schema-flexible; actor and
        # action are duplicated as top-level fields for cheap server-side
        # filtering without parsing every entry.
        client.xadd(STREAM_KEY, {
          'actor' => entry[:actor],
          'action' => entry[:action],
          'json' => entry.to_json,
        })
      end

      def parse(id, fields)
        raw = fields['json'] || fields[:json]
        base = raw ? JSON.parse(raw, symbolize_names: true) : {}
        base.merge(_id: id)
      end

      def emit_log(entry)
        line = "[familia-admin audit] #{entry.to_json}"
        if defined?(Familia) && Familia.respond_to?(:logger) && Familia.logger
          Familia.logger.info(line)
        else
          warn line
        end
      end

      def client
        Familia.dbclient
      end

      def stringify_keys(hash)
        hash.each_with_object({}) { |(k, v), acc| acc[k.to_sym] = v }
      end
    end
  end
end
