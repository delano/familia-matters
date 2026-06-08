# frozen_string_literal: true

require 'json'

# Familia::Admin::Streaming
#
# Rack 3 streaming bodies for the live endpoints. Both bodies are enumerable
# (they respond to #each and yield Server-Sent-Event chunks), which is a valid
# Rack 3 streaming body and, importantly, survives Otto's response finalizer:
# `finalize_response` wraps any body that does NOT respond to #each in an array,
# which would break a `#call(stream)`-style body. An enumerable body streams
# cleanly through Otto, rackup/WEBrick, Puma, and Falcon alike.
#
# The web server drives `body.each { |chunk| socket.write(chunk) }`; if the
# client disconnects, the write raises inside the yield and the body's `ensure`
# tears down its subscription. Each body is bounded by a deadline and an event
# cap so a stream can never run forever.
#
module Familia
  module Admin
    module Streaming
      SSE_HEADERS = {
        'content-type' => 'text/event-stream',
        'cache-control' => 'no-cache, no-store, must-revalidate',
        'connection' => 'keep-alive',
        # Disable proxy buffering (nginx) so events flush immediately.
        'x-accel-buffering' => 'no',
      }.freeze

      module_function

      # Format one SSE event. A nil/comment line is a heartbeat that keeps the
      # connection alive and lets a blocked #each notice client disconnect.
      def sse(data)
        "data: #{JSON.generate(data)}\n\n"
      end

      def heartbeat
        ": keep-alive\n\n"
      end

      # ===================================================================
      # Repair progress stream
      # ===================================================================
      #
      # Drives klass.repair_all! synchronously and forwards the {phase, current,
      # total} progress it yields as SSE, bracketed by a `start` and a `done`
      # event carrying the repair summary — the shape the prototype consumed
      # (fixtures/stream_repair.sample.jsonl).
      class RepairStreamBody
        # @param klass [Class] the Horreum model to repair
        # @param dry_run [Boolean]
        # @param on_complete [#call] optional callback(result_hash) for auditing
        def initialize(klass, dry_run: false, on_complete: nil)
          @klass = klass
          @dry_run = dry_run
          @on_complete = on_complete
        end

        def each
          yield Streaming.sse(event: 'start', model: model_name, dry_run: @dry_run, at: now)

          if @dry_run
            report = @klass.health_check(check_cross_refs: true, audit_collections: true)
            yield Streaming.sse(event: 'done', dry_run: true, healthy: report.healthy?,
                                at: now, report: Serializers.audit_report(report))
            return
          end

          # `yield` inside the progress block still yields to THIS method's
          # block, so each progress callback flushes an SSE frame to the client.
          result = @klass.repair_all!(verify: true, check_cross_refs: true) do |progress|
            yield Streaming.sse(phase: progress[:phase], current: progress[:current], total: progress[:total])
          end

          summary = summarize(result)
          @on_complete&.call(result)
          yield Streaming.sse(event: 'done', healthy: healthy_after?(result), at: now, summary: summary)
        rescue StandardError => e
          yield Streaming.sse(event: 'error', message: "#{e.class}: #{e.message}", at: now)
        end

        def close; end

        private

        def model_name
          @klass.respond_to?(:config_name) ? @klass.config_name : @klass.name
        end

        # repair_all! returns a Hash (see probe): {instances:, indexes:,
        # multi_indexes:, participations:, report:, errors:, status:,
        # post_audit:, verified:}. Reduce it to a flat, JSON-safe summary.
        def summarize(result)
          h = result.is_a?(Hash) ? result : (result.respond_to?(:to_h) ? result.to_h : {})
          {
            status: h[:status],
            verified: h[:verified],
            instances: jsonable(h[:instances]),
            indexes: jsonable(h[:indexes]),
            multi_indexes: jsonable(h[:multi_indexes]),
            participations: jsonable(h[:participations]),
            errors: Array(h[:errors]).map(&:to_s),
          }.compact
        end

        def healthy_after?(result)
          h = result.is_a?(Hash) ? result : {}
          pa = h[:post_audit]
          return pa.healthy? if pa.respond_to?(:healthy?)

          Array(h[:errors]).empty?
        end

        def jsonable(v)
          case v
          when Hash then v.transform_values { |x| jsonable(x) }
          when Array then v.map { |x| jsonable(x) }
          when nil, Numeric, true, false, String then v
          else v.to_s
          end
        end

        def now
          (Familia.respond_to?(:now) ? Familia.now : Time.now).to_i
        end
      end

      # ===================================================================
      # Live command feed
      # ===================================================================
      #
      # Familia::Instrumentation.on_command registers a process-wide hook with
      # no unsubscribe. Registering one per request would leak hooks forever, so
      # we install a SINGLE dispatcher hook lazily and fan out to a registry of
      # active per-request subscriber queues. Bodies add/remove themselves; the
      # dispatcher drops events for slow subscribers (bounded queue) so a stuck
      # client can never apply backpressure to live database traffic.
      class CommandFeed
        @mutex = Mutex.new
        @subscribers = []
        @installed = false

        class << self
          def subscribe(queue)
            install!
            @mutex.synchronize { @subscribers << queue }
          end

          def unsubscribe(queue)
            @mutex.synchronize { @subscribers.delete(queue) }
          end

          private

          def install!
            @mutex.synchronize do
              return if @installed
              return unless Familia.respond_to?(:on_command) ||
                            (defined?(Familia::Instrumentation) && Familia::Instrumentation.respond_to?(:on_command))

              hook = ->(cmd, duration, ctx) { dispatch(cmd, duration, ctx) }
              if Familia.respond_to?(:on_command)
                Familia.on_command(&hook)
              else
                Familia::Instrumentation.on_command(&hook)
              end
              @installed = true
            end
          end

          def dispatch(cmd, duration, ctx)
            subs = @mutex.synchronize { @subscribers.dup }
            return if subs.empty?

            event = {
              ts: (Familia.respond_to?(:now) ? Familia.now : Time.now).to_i,
              cmd: cmd.to_s,
              key: key_of(ctx),
              duration_ms: (duration.to_f / 1000.0).round(3), # hook duration is microseconds
            }
            subs.each do |q|
              # Non-blocking push: drop the event for a saturated subscriber
              # rather than block the database command path.
              q.push(event, true)
            rescue ThreadError
              # queue full — drop
            end
          end

          def key_of(ctx)
            full = ctx.is_a?(Hash) ? (ctx[:full_command] || ctx['full_command']) : nil
            Array(full)[1].to_s if full
          end
        end
      end

      # Streams the live command feed as SSE, bounded by max_events and a
      # deadline. Heartbeats every poll interval so a disconnected client is
      # noticed promptly and the subscription is torn down.
      class CommandStreamBody
        def initialize(enabled: true, max_events: 500, max_seconds: 120, queue_size: 256)
          @enabled = enabled
          @max_events = max_events
          @max_seconds = max_seconds
          @queue = Thread::SizedQueue.new(queue_size)
        end

        def each
          # Honest about state: if command capture is off, say so rather than
          # streaming an empty feed that looks broken.
          unless @enabled
            yield Streaming.sse(event: 'open', capture: 'disabled', at: now,
                                note: 'command capture is off; enable ADMIN_COMMAND_STREAM to stream live commands')
            return
          end

          CommandFeed.subscribe(@queue)
          deadline = monotonic + @max_seconds
          sent = 0
          yield Streaming.sse(event: 'open', capture: 'enabled', at: now)

          while sent < @max_events && monotonic < deadline
            event = @queue.pop(timeout: 5)
            if event.nil?
              yield Streaming.heartbeat # also surfaces client disconnect via write error
              next
            end
            yield Streaming.sse(event)
            sent += 1
          end
          yield Streaming.sse(event: 'close', reason: sent >= @max_events ? 'max_events' : 'timeout', at: now)
        ensure
          close if @enabled
        end

        def close
          CommandFeed.unsubscribe(@queue)
        end

        private

        def now
          (Familia.respond_to?(:now) ? Familia.now : Time.now).to_i
        end

        def monotonic
          Process.clock_gettime(Process::CLOCK_MONOTONIC)
        end
      end
    end
  end
end
