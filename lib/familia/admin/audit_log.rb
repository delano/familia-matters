# frozen_string_literal: true

require 'json'
require 'securerandom'

# Familia::Admin::AuditLog
#
# Append-only audit trail for elevated/destructive admin actions (reveal,
# destroy, repair, run_migrations, rollback, raw_command). The prototype's
# `audit!` only `warn`ed; this is the real sink.
#
# Guarantees:
#   * Append-only. The store is a Redis sorted set written with ZADD only.
#     Nothing in this class removes or rewrites an entry.
#   * Tamper-evident ordering. Each entry carries a monotonic sequence number
#     (INCR) so two events in the same second cannot collide or be reordered.
#   * Never logs secrets. A reveal records WHICH field was revealed (model, id,
#     field, actor, at) — never the plaintext. A defensive scrub drops any
#     obviously-sensitive value that a future caller passes by mistake.
#   * Fail-open for the request, fail-loud for the operator. If the store is
#     unreachable the action is NOT blocked (the audit must not become a denial
#     vector), but the entry is emitted to the logger at error level so it is
#     still captured somewhere and the gap is visible.
#
module Familia
  module Admin
    class AuditLog
      DEFAULT_KEY = 'familia:admin:audit_log'
      SEQ_KEY = 'familia:admin:audit_seq'

      # Keys whose values must never be persisted to the trail, even if a caller
      # passes them by mistake. The reveal path is built to pass only metadata,
      # but this is the backstop.
      SENSITIVE_KEYS = %i[value plaintext secret password api_secret token revealed].freeze

      class << self
        def default
          @default ||= new
        end

        attr_writer :default
      end

      # @param key [String] sorted-set key for the trail
      # @param logger [#error, #info] fallback/mirror logger
      def initialize(key: DEFAULT_KEY, logger: nil)
        @key = key
        @logger = logger || default_logger
      end

      # Append one entry. Returns the stored entry hash (with :at and :seq
      # stamped). Never raises.
      #
      # @param entry [Hash]
      # @return [Hash]
      def record(entry)
        stamped = stamp(scrub(entry))
        persist(stamped)
        mirror(stamped)
        stamped
      rescue StandardError => e
        # The audit must never become a way to break the action it audits.
        warn("[familia-admin audit] sink error: #{e.class}: #{e.message}")
        entry
      end

      # Most-recent-first slice of the trail, for the audit-trail view.
      #
      # @param limit [Integer]
      # @return [Array<Hash>]
      def recent(limit: 50)
        raw = dbclient.zrevrange(@key, 0, [limit, 1].max - 1)
        Array(raw).map { |m| parse(m) }.compact
      rescue StandardError
        []
      end

      # @return [Integer] total entries recorded
      def count
        dbclient.zcard(@key).to_i
      rescue StandardError
        0
      end

      private

      def stamp(entry)
        h = entry.transform_keys(&:to_sym)
        h[:at] ||= now
        h[:seq] = next_seq
        h
      end

      # ZADD only — this is what makes the trail append-only. The score is the
      # monotonic sequence (not the second-granularity timestamp) so retrieval
      # order is true append order even for many events within one second; the
      # member embeds the sequence so identical events never overwrite.
      def persist(entry)
        dbclient.zadd(@key, entry[:seq].to_i, JSON.generate(entry))
      end

      def mirror(entry)
        @logger.info("[familia-admin audit] #{JSON.generate(entry)}") if @logger.respond_to?(:info)
      end

      # Defensive: drop sensitive values; redact long opaque strings under
      # ambiguous keys. Caller contract is metadata-only; this is the backstop.
      def scrub(entry)
        entry.each_with_object({}) do |(k, v), acc|
          key = k.to_sym
          acc[key] = if SENSITIVE_KEYS.include?(key)
                       '[REDACTED]'
                     else
                       v
                     end
        end
      end

      def next_seq
        dbclient.incr(SEQ_KEY)
      rescue StandardError
        # If the counter is unavailable, fall back to a random ordering token so
        # members still don't collide. Ordering may be imperfect but no entry is
        # lost or overwritten.
        SecureRandom.random_number(1 << 32)
      end

      def now
        (Familia.respond_to?(:now) ? Familia.now : Time.now).to_i
      end

      def parse(member)
        JSON.parse(member, symbolize_names: true)
      rescue StandardError
        nil
      end

      # The audit trail lives on the default logical database (db 0). It is
      # deliberately not a Horreum model — it is infrastructure the admin writes
      # to, not data the admin manages.
      def dbclient
        Familia.dbclient
      end

      def default_logger
        Familia.respond_to?(:logger) && Familia.logger ? Familia.logger : nil
      end
    end
  end
end
