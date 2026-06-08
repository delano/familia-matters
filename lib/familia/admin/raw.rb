# frozen_string_literal: true

require 'json'

module Familia
  module Admin
    # The raw key explorer — the schemaless layer, guarded.
    #
    # Security posture (see SECURITY.md):
    #   * Listing is SCAN-only (cursor paged). KEYS is hard-denied.
    #   * The command console runs a fixed READ allowlist for real, and HARD
    #     denies every destructive/administrative command — even with the
    #     raw_command tier and force:true. The admin is a read/diagnostic
    #     surface; destructive work goes through the dedicated, dry-run-gated,
    #     audited repair/migration endpoints, never an ad-hoc FLUSHALL.
    #   * Encrypted model fields are masked in key inspection so the explorer
    #     can never surface secret ciphertext.
    module Raw
      module_function

      # Real, side-effect-free reads. Executed against the live database.
      ALLOW = %w[
        GET HGET HGETALL HKEYS HLEN HMGET HEXISTS TYPE TTL PTTL OBJECT MEMORY
        SCAN HSCAN SSCAN ZSCAN ZRANGE ZREVRANGE ZRANGEBYSCORE ZSCORE ZCARD ZRANK
        SMEMBERS SCARD SISMEMBER LLEN LRANGE LINDEX STRLEN EXISTS DBSIZE INFO
      ].freeze

      # Hard-denied. Reason is surfaced to the operator. These never execute,
      # regardless of tier or force.
      BLOCK = {
        'KEYS'     => 'Blocking O(N) scan of the entire keyspace. Use SCAN with a cursor instead.',
        'FLUSHALL' => 'Destroys every key in every database. The admin never runs this.',
        'FLUSHDB'  => 'Destroys every key in the current database. The admin never runs this.',
        'CONFIG'   => 'Reads/writes server configuration. Out of scope for the data admin.',
        'SHUTDOWN' => 'Stops the server process. The admin never runs this.',
        'DEBUG'    => 'Server-debug surface; can stall or crash the instance.',
        'MONITOR'  => 'Streams every command from every client; operational hazard.',
        'SWAPDB'   => 'Swaps entire logical databases. The admin never runs this.',
        'MIGRATE'  => 'Moves keys between servers. Out of scope and destructive.',
        'RESTORE'  => 'Writes arbitrary serialized payloads. Out of scope.',
      }.freeze

      def client
        Familia.dbclient
      end

      # ----- SCAN-based key listing --------------------------------------

      def scan_keys(pattern: '*', type: nil, cursor: 0, count: 100)
        cur, keys = client.scan(cursor.to_s, match: (pattern.nil? || pattern.empty? ? '*' : pattern), count: count)
        type = nil if type.to_s.empty? || type.to_s == 'all'

        entries = keys.map { |k| describe_key(k) }
        entries.select! { |e| e[:type] == type } if type

        {
          keys: entries,
          cursor: cur.to_i,
          scanned: keys.size,
          matched: entries.size,
        }
      end

      # Lightweight per-key descriptor used by the listing (no value read).
      def describe_key(key)
        rtype = client.type(key)
        model, id = model_for(key)
        {
          key: key,
          type: wire_type(key, rtype),
          ttl: client.ttl(key),
          db: db_for(model),
          model: model,
          id: id,
        }
      end

      # ----- single-key inspection ---------------------------------------

      def inspect_key(key)
        rtype = client.type(key)
        return { error: 'no_such_key', key: key } if rtype == 'none'

        model, id = model_for(key)
        {
          key: key,
          type: wire_type(key, rtype),
          ttl: client.ttl(key),
          memory: memory_usage(key),
          db: db_for(model),
          model: model,
          id: id,
          value: typed_value(key, rtype, model),
        }
      end

      # Read the typed value, masking encrypted fields on model object keys so
      # the explorer can never reveal secret ciphertext.
      def typed_value(key, rtype, model)
        case rtype
        when 'hash'
          entries = client.hgetall(key)
          entries = mask_encrypted(entries, model) if model
          { type: 'hash', entries: entries }
        when 'list'
          { type: 'list', members: client.lrange(key, 0, 199) }
        when 'set'
          { type: 'set', members: client.smembers(key).map { |m| decode(m) } }
        when 'zset'
          raw = client.zrange(key, 0, 199, withscores: true)
          { type: 'zset', members: raw.map { |(m, s)| { member: decode(m), score: s } } }
        when 'string'
          val = client.get(key)
          counter?(key) ? { type: 'counter', value: val.to_i } : { type: 'string', value: val }
        else
          { type: rtype }
        end
      end

      # ----- server info -------------------------------------------------

      def info
        sections = {}
        %w[server memory clients stats keyspace].each do |section|
          sections[section] = (client.info(section) || {})
        rescue StandardError
          sections[section] = {}
        end
        sections
      end

      # ----- command console ---------------------------------------------

      # @return [Hash] one of:
      #   {cmd:, args:, result:, _executed:true, _simulated:false}
      #   {error:'command_blocked', cmd:, required_tier:, reason:, _executed:false}
      #   {error:'unknown_command'|'empty', cmd:}
      def run_command(cmd, args = [], force: false, tier: nil)
        name = cmd.to_s.strip.upcase
        return { error: 'empty' } if name.empty?

        if BLOCK.key?(name)
          # Hard deny — never executes, even with the raw_command tier + force.
          return {
            error: 'command_blocked',
            cmd: name,
            required_tier: 'permission:raw_command',
            reason: BLOCK[name],
            forced: !!force,
            _executed: false,
          }
        end

        return { error: 'unknown_command', cmd: name } unless ALLOW.include?(name)

        result = client.call(name, *Array(args))
        { cmd: name, args: Array(args), result: format_result(result), _executed: true, _simulated: false }
      rescue StandardError => e
        { error: 'command_error', cmd: name, message: e.message }
      end

      def blocked?(cmd)
        BLOCK.key?(cmd.to_s.upcase)
      end

      # ----- helpers ------------------------------------------------------

      # prefix => klass for every loaded model, e.g. "customer" => Customer.
      def model_prefixes
        @model_prefixes = nil unless defined?(@model_prefixes) && @cached_members == Familia.members
        @cached_members = Familia.members
        @model_prefixes ||= Familia.members.each_with_object({}) do |klass, acc|
          p = (klass.prefix.to_s rescue nil)
          acc[p] = klass if p && !p.empty?
        end
      end

      # counter field suffixes per prefix, e.g. {"customer" => Set["login_count"]}.
      def counter_fields
        @counter_fields ||= model_prefixes.each_with_object({}) do |(prefix, klass), acc|
          fields = (klass.related_fields rescue {}).select do |_n, defn|
            (Descriptor.datatype_name_for(defn.klass).to_s == 'counter' rescue false)
          end.keys.map(&:to_s)
          acc[prefix] = fields unless fields.empty?
        end
      end

      def model_for(key)
        if (m = key.match(/\A([^:]+):(.+):object\z/)) && model_prefixes[m[1]]
          [model_prefixes[m[1]].config_name, m[2]]
        else
          [nil, nil]
        end
      end

      def db_for(model)
        return 0 unless model

        klass = model_prefixes.values.find { |k| k.config_name == model }
        (klass&.logical_database) || 0
      end

      def counter?(key)
        parts = key.split(':')
        return false unless parts.size >= 3

        prefix = parts.first
        field = parts.last
        Array(counter_fields[prefix]).include?(field)
      end

      def wire_type(key, rtype)
        return 'counter' if rtype == 'string' && counter?(key)

        rtype
      end

      def mask_encrypted(entries, model)
        klass = model_prefixes.values.find { |k| k.config_name == model }
        return entries unless klass

        entries.each_with_object({}) do |(field, value), acc|
          ft = (klass.field_types[field.to_sym] rescue nil)
          acc[field] = if ft && ft.category == :encrypted
                         '[CONCEALED]'
                       elsif ft && ft.category == :transient
                         '[REDACTED]'
                       else
                         value
                       end
        end
      end

      def memory_usage(key)
        client.call('MEMORY', 'USAGE', key)
      rescue StandardError
        nil
      end

      def decode(raw)
        JSON.parse(raw)
      rescue StandardError
        raw
      end

      def format_result(result)
        case result
        when nil then nil
        when Array, Hash then result
        else result
        end
      end
    end
  end
end
