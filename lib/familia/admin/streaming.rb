# frozen_string_literal: true

require 'json'
require_relative 'serializers'
require_relative 'audit_log'

module Familia
  module Admin
    # Rack 3 streaming bodies for the live endpoints (server-sent events).
    #
    # {SSEBody} responds to BOTH #each (the broadly-supported Rack 3 streaming
    # body — Puma flushes each yielded chunk under chunked transfer encoding)
    # and #call(stream) (the Rack 3.1 streaming protocol). The generator block
    # receives an `emit` callable and produces one event at a time, so the work
    # (a real repair, or a simulated command feed) runs lazily as the server
    # pulls the body.
    module Streaming
      module_function

      SSE_HEADERS = {
        'content-type' => 'text/event-stream',
        'cache-control' => 'no-cache, no-transform',
        'connection' => 'keep-alive',
        # Disable proxy buffering (nginx) so events flush immediately.
        'x-accel-buffering' => 'no',
      }.freeze

      # A Rack 3 streaming body. The block yields events via `emit`.
      class SSEBody
        def initialize(&block)
          @block = block
        end

        # Classic Rack 3 streaming body.
        def each
          @block.call(->(event) { yield format(event) })
        end

        # Rack 3.1 streaming protocol.
        def call(stream)
          @block.call(->(event) { stream.write(format(event)) })
        ensure
          begin
            stream.close
          rescue StandardError
            nil
          end
        end

        def format(event)
          return event if event.is_a?(String) && event.start_with?(':') # raw comment/heartbeat

          "data: #{event.is_a?(String) ? event : JSON.generate(event)}\n\n"
        end
      end

      # Stream a repair of `klass`. Emits the canonical shape:
      #   start -> per-component phase events -> done{summary}
      # When dry_run is false it actually runs repair_all! (verified) between the
      # preview events and the done event, and writes an audit entry.
      def repair_stream(klass, dry_run: false, actor: 'unknown', interval: 0.12)
        SSEBody.new do |emit|
          begin
            report = klass.health_check(check_cross_refs: true, audit_collections: true)
            ser = Serializers.audit_report(report)

            emit.call(event: 'start', model: klass.name, dry_run: dry_run, at: Time.now.to_i)
            stream_components(ser, emit, interval)

            unless dry_run
              klass.repair_all!(check_cross_refs: true, audit_collections: true, verify: true)
              AuditLog.record(action: :repair, actor: actor, model: klass.config_name,
                              writes: ser[:summary][:total_issues])
            end

            emit.call(event: 'done', healthy: true, at: Time.now.to_i, summary: done_summary(ser))
          rescue StandardError => e
            emit.call(event: 'error', message: e.message, at: Time.now.to_i)
          end
        end
      end

      # Emit one phase event per audit component that has issues, mirroring
      # fixtures/stream_repair.sample.jsonl.
      def stream_components(ser, emit, interval)
        inst = ser[:instances]
        total = inst[:count_timeline].to_i
        phantoms = inst[:phantoms].size
        missing = inst[:missing].size
        if phantoms.positive? || missing.positive?
          [0, 0.33, 0.66].each do |frac|
            emit.call(phase: 'instances', current: (total * frac).round, total: total)
            sleep interval if interval.positive?
          end
          emit.call(phase: 'instances', current: total, total: total,
                    result: { phantoms_removed: phantoms, missing_added: missing })
          sleep interval if interval.positive?
        end

        ser[:unique_indexes].each do |ix|
          next if ix[:stale].empty? && ix[:missing].empty?

          emit.call(phase: 'unique_indexes', current: 1, total: 1, index: ix[:index_name],
                    result: { stale_removed: ix[:stale].size, rebuilt: ix[:missing].size })
          sleep interval if interval.positive?
        end

        ser[:multi_indexes].each do |ix|
          next if ix[:stale_members].empty? && ix[:orphaned_keys].empty?

          emit.call(phase: 'multi_indexes', current: 1, total: 1, index: ix[:index_name],
                    result: { stale_members_removed: ix[:stale_members].size,
                              orphaned_keys_removed: ix[:orphaned_keys].size })
          sleep interval if interval.positive?
        end

        ser[:participations].each do |p|
          next if p[:stale_members].empty?

          emit.call(phase: 'participations', current: 1, total: 1, collection: p[:collection_name],
                    result: { stale_removed: p[:stale_members].size })
          sleep interval if interval.positive?
        end

        cross = ser[:cross_references]
        crm = cross[:in_instances_missing_unique_index].size
        crw = cross[:index_points_to_wrong_identifier].size
        return unless crm.positive? || crw.positive?

        emit.call(phase: 'cross_references', current: 1, total: 1,
                  result: { reindexed: crm, retargeted: crw })
        sleep interval if interval.positive?
      end

      def done_summary(ser)
        by = ser[:summary][:by_type]
        {
          phantoms_removed: by[:phantoms],
          missing_added: by[:missing],
          indexes_rebuilt: by[:stale_unique_index] + by[:missing_unique_index],
          stale_members_removed: by[:stale_multi_member] + by[:stale_participation],
          orphaned_keys_removed: by[:orphaned_index_key],
          participations_fixed: by[:stale_participation],
          cross_refs_fixed: by[:cross_ref_missing_index] + by[:cross_ref_wrong_target],
        }
      end

      # The live command feed: simulated read traffic derived from real keys in
      # the keyspace. Bounded by `limit` so it terminates for tests and finite
      # demos; a production feed would subscribe to command instrumentation.
      def command_feed(limit: 30, interval: 0.1, client: nil)
        client ||= Familia.dbclient
        SSEBody.new do |emit|
          keys = sample_keys(client)
          commands = %w[HGETALL GET ZRANGE SMEMBERS HGET TTL TYPE LRANGE ZSCORE EXISTS]
          emit.call(':connected')
          limit.times do |i|
            key = keys.empty? ? 'customer:instances' : keys[i % keys.size]
            cmd = commands[i % commands.size]
            slow = (i % 7).zero?
            emit.call(ts: Time.now.to_f.round(3), cmd: cmd, key: key,
                      duration_ms: slow ? (10 + rand(15)).round(1) : (rand * 1.5).round(2))
            sleep interval if interval.positive?
          end
          emit.call(event: 'end', at: Time.now.to_i)
        end
      end

      def sample_keys(client)
        _cur, keys = client.scan('0', match: '*', count: 50)
        keys.first(20)
      rescue StandardError
        []
      end
    end
  end
end
