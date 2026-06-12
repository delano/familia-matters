# lib/familia/admin/audit_log.rb
#
# frozen_string_literal: true

require 'json'
require 'securerandom'
require 'familia'

# Familia::Admin::AuditLog
#
# Append-only audit sink for the admin surface. Every elevated/mutating action
# (reveal, repair, destroy, run_migrations, rollback) is recorded here so the
# trail survives the request that produced it.
#
# Storage shape: a single class-level sorted set (`AuditLog.entries`) whose
# members are JSON-encoded entries scored by their Unix timestamp. Scoring by
# time gives cheap newest-first reads (revrange) and natural time-window
# queries without scanning, while JSON members keep each entry self-describing.
#
# This file ONLY provides the sink. Wiring it into Admin::API#audit! is owned by
# a later phase; api.rb is left untouched here.
#
# @example Record and read back
#   Familia::Admin::AuditLog.record(actor: 'admin@x', action: :reveal, model: 'customer', id: 'c1')
#   Familia::Admin::AuditLog.recent(10) # => [{ "at" => ..., "actor" => ..., ... }, ...]
#
module Familia
  module Admin
    class AuditLog < Familia::Horreum
      # Class-level, append-only sorted set. Member = JSON string, score = epoch
      # seconds. Lives on the default logical database (db 0) alongside Customer.
      class_sorted_set :entries

      # Retention (T6): the sink trims itself on every write, keeping only the
      # newest N entries so the key's memory growth is bounded. N comes from
      # FAMILIA_ADMIN_AUDIT_LIMIT (positive integer), default 10_000 — at the
      # observed entry size (~150 bytes) that bounds the key around 1.5 MB.
      RETENTION_ENV     = 'FAMILIA_ADMIN_AUDIT_LIMIT'
      RETENTION_DEFAULT = 10_000

      # Append one audit entry (and apply the retention trim).
      #
      # @param actor [String] the authenticated admin (sub) responsible
      # @param action [String, Symbol] the action performed (e.g. :reveal, :repair)
      # @param details [Hash] arbitrary structured context (model:, id:, field:, ...)
      # @return [Hash] the entry that was recorded
      def self.record(actor:, action:, **details)
        at = Familia.now.to_i
        entry = { at: at, actor: actor.to_s, action: action.to_s }.merge(details)
        # add(member, score): score by timestamp so newest entries sort last and
        # revrange returns them first. A monotonic-ish nonce in the member keeps
        # two entries in the same second from colliding to a single ZSET member.
        member = entry.merge(_nonce: SecureRandom.hex(4)).to_json
        entries.add(member, at)
        trim!
        entry
      end

      # Keep only the newest retention_limit entries. Ranks are score-ascending
      # (oldest first), so removing ranks 0..-(N+1) drops everything except the
      # newest N. ZREMRANGEBYRANK via Familia's SortedSet#remrangebyrank.
      def self.trim!
        entries.remrangebyrank(0, -(retention_limit + 1))
      end

      # The env-tunable retention cap. Unset/zero/garbage falls back to the
      # default; the floor of 1 means a configured limit can never silently
      # disable trimming or delete the entry being written.
      def self.retention_limit
        v = ENV[RETENTION_ENV].to_s
        n = v.match?(/\A\d+\z/) ? v.to_i : RETENTION_DEFAULT
        n.positive? ? n : RETENTION_DEFAULT
      end

      # Most recent entries, newest first.
      #
      # @param limit [Integer] maximum number of entries to return
      # @return [Array<Hash>] decoded entries (the transient _nonce is stripped)
      def self.recent(limit = 50)
        n = [limit.to_i, 1].max
        Array(entries.revrange(0, n - 1)).map do |raw|
          parsed = begin
            JSON.parse(raw)
          rescue StandardError
            { 'raw' => raw }
          end
          parsed.delete('_nonce')
          parsed
        end
      end
    end
  end
end
