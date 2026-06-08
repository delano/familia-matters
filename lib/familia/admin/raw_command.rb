# frozen_string_literal: true

require 'set'

# Familia::Admin::RawCommand
#
# The raw explorer's `run_command` is the single most dangerous endpoint in the
# admin: it forwards a command to the database. This module is the gate.
#
# Posture: DEFAULT DENY. Only commands on the read-only ALLOWLIST ever execute.
# Holding `permission:raw_command` does NOT unlock destructive commands — there
# is no tier or `force` flag that turns FLUSHALL/CONFIG/SHUTDOWN/EVAL into an
# allowed operation through the admin. Write and administrative commands are
# categorically refused; the only "raw" power here is read-only inspection.
#
# This is intentionally stricter than the prototype simulator (which hinted at a
# tier+force unlock). Reconciling toward the security checklist: "deny
# KEYS/FLUSH*/CONFIG/SHUTDOWN/DEBUG", and we extend that to every command that
# can mutate data, change server config, run scripts, or block the connection.
#
module Familia
  module Admin
    module RawCommand
      # Read-only commands the explorer may run. Curated, not derived — adding a
      # command here is a deliberate security decision.
      ALLOWLIST = %w[
        GET MGET STRLEN GETRANGE SUBSTR
        EXISTS TYPE TTL PTTL EXPIRETIME PEXPIRETIME OBJECT
        HGET HMGET HGETALL HKEYS HVALS HLEN HEXISTS HSTRLEN HRANDFIELD
        SMEMBERS SISMEMBER SMISMEMBER SCARD SRANDMEMBER SINTERCARD
        ZRANGE ZREVRANGE ZRANGEBYSCORE ZREVRANGEBYSCORE ZRANGEBYLEX
        ZSCORE ZMSCORE ZCARD ZCOUNT ZRANK ZREVRANK ZLEXCOUNT
        LRANGE LLEN LINDEX LPOS
        SCAN HSCAN SSCAN ZSCAN
        DBSIZE INFO MEMORY
        BITCOUNT BITPOS GETBIT
        GEOPOS GEODIST GEOHASH
        PFCOUNT
        XRANGE XREVRANGE XLEN XINFO
      ].to_set.freeze

      # Subcommands permitted for multi-word commands that are otherwise unsafe.
      # OBJECT ENCODING/REFCOUNT/IDLETIME and MEMORY USAGE are read-only; DEBUG is
      # allowed ONLY for JMAP-free read subcommands and is otherwise blocked.
      SUBCOMMAND_ALLOWLIST = {
        'OBJECT' => %w[ENCODING REFCOUNT IDLETIME FREQ HELP].to_set,
        'MEMORY' => %w[USAGE DOCTOR STATS].to_set,
        'XINFO'  => %w[STREAM GROUPS CONSUMERS HELP].to_set,
      }.freeze

      # The famous footguns — listed only so the error message can name why a
      # command is refused. The allowlist is what actually decides; this set
      # never grants anything.
      DENYLIST_NOTE = %w[
        KEYS FLUSHALL FLUSHDB SWAPDB SHUTDOWN CONFIG SAVE BGSAVE BGREWRITEAOF
        SCRIPT EVAL EVALSHA FCALL FUNCTION MODULE
        MIGRATE RESTORE DUMP COPY MOVE
        SLAVEOF REPLICAOF FAILOVER CLUSTER CLIENT ACL RESET
        MONITOR SUBSCRIBE PSUBSCRIBE BLPOP BRPOP BLMOVE WAIT
        SET DEL UNLINK RENAME EXPIRE PERSIST SORT GETDEL GETEX
        MULTI EXEC WATCH DISCARD
      ].to_set.freeze

      MAX_ARGS = 16
      SCAN_MAX_COUNT = 1000

      Blocked = Class.new(StandardError)

      module_function

      # @param cmd [String]
      # @return [Boolean] whether the command is on the read-only allowlist
      def allowed?(cmd)
        ALLOWLIST.include?(normalize(cmd))
      end

      # Validate and run a single read-only command against the given client.
      #
      # @param dbclient [Object] a Redis/Valkey client (Familia.dbclient)
      # @param cmd [String]
      # @param args [Array]
      # @return [Hash] { command:, args:, result: }
      # @raise [Blocked] when the command/args are not permitted
      def run(dbclient, cmd, args)
        name = normalize(cmd)
        args = Array(args)

        raise Blocked, refusal(name) unless ALLOWLIST.include?(name)
        raise Blocked, "too many arguments (max #{MAX_ARGS})" if args.size > MAX_ARGS

        validate_subcommand!(name, args)
        args = guard_args(name, args)

        result = dbclient.call(name, *args)
        { command: name, args: args, result: normalize_result(result) }
      end

      # ----- internals -------------------------------------------------------

      def normalize(cmd)
        cmd.to_s.strip.upcase
      end

      def refusal(name)
        if DENYLIST_NOTE.include?(name)
          "command '#{name}' is refused: write/administrative commands are never permitted via the raw explorer"
        else
          "command '#{name}' is not on the read-only allowlist"
        end
      end

      # For multi-word commands, the first arg is the subcommand and must be on
      # that command's subcommand allowlist.
      def validate_subcommand!(name, args)
        allowed = SUBCOMMAND_ALLOWLIST[name]
        return unless allowed # not a gated multi-word command

        sub = args.first.to_s.upcase
        unless allowed.include?(sub)
          raise Blocked, "subcommand '#{name} #{sub}' is not permitted"
        end
      end

      # Cap the cursor-scan COUNT so a single call cannot ask the server to walk
      # an unbounded slice. Reads SCAN/HSCAN/SSCAN/ZSCAN COUNT option.
      def guard_args(name, args)
        return args unless %w[SCAN HSCAN SSCAN ZSCAN].include?(name)

        out = args.dup
        if (i = out.index { |a| a.to_s.upcase == 'COUNT' }) && out[i + 1]
          requested = out[i + 1].to_i
          out[i + 1] = [[requested, 1].max, SCAN_MAX_COUNT].min
        end
        out
      end

      # Make results JSON-friendly (e.g. INFO returns a Hash already; most
      # commands return strings/arrays/integers).
      def normalize_result(result)
        case result
        when Hash then result
        when Array then result.map { |r| normalize_result(r) }
        when nil, true, false, Numeric then result
        else result.to_s
        end
      end
    end
  end
end
