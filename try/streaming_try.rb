# frozen_string_literal: true

# Contract: the live endpoints are Rack 3 streaming bodies (enumerable SSE).
# stream_repair drives repair_all! and emits start/phase/done frames in the
# stream_repair.sample.jsonl shape; stream_commands streams the live feed.

require_relative 'helper'
require 'logger'

AT.seed!

## stream_repair sets SSE response headers (text/event-stream, no-cache)
res = AT.response(:stream_repair, params: { model: 'customer' }, perms: %w[repair])
[res.status, res['content-type'], res['cache-control'].to_s.include?('no-cache')]
#=> [200, "text/event-stream", true]

## stream_repair body is an enumerable Rack 3 streaming body (responds to #each)
AT.response(:stream_repair, params: { model: 'customer' }, perms: %w[repair]).body.respond_to?(:each)
#=> true

## stream_repair emits a start frame then a done frame with healthy + summary
Customer.instances.add('phantom_stream_1', Familia.now.to_i)
events = AT.drain_sse(AT.response(:stream_repair, params: { model: 'customer' }, perms: %w[repair]).body)
[events.first[:event], events.last[:event], events.last[:healthy]]
#=> ["start", "done", true]

## stream_repair emits per-phase progress frames with current/total
phases = AT.drain_sse(AT.response(:stream_repair, params: { model: 'customer' }, perms: %w[repair]).body).select { |e| e[:phase] }
phases.any? && phases.all? { |p| p.key?(:current) && p.key?(:total) }
#=> true

## the streamed repair actually fixed the drift (next check is healthy)
AT.body(:health_check, params: { model: 'customer' })[:healthy]
#=> true

## stream_repair dry-run streams a done event WITHOUT mutating
Customer.instances.add('phantom_stream_2', Familia.now.to_i)
events = AT.drain_sse(AT.response(:stream_repair, params: { model: 'customer', dry_run: 'true' }, perms: %w[repair]).body)
still = AT.body(:health_check, params: { model: 'customer' })[:instances][:phantoms].include?('phantom_stream_2')
[events.last[:event], events.last[:dry_run], still]
#=> ["done", true, true]

## stream_repair requires permission:repair (defense in depth, rendered as JSON)
res = AT.response(:stream_repair, params: { model: 'customer' }, perms: [])
parts = []; res.body.each { |p| parts << p }
[res.status, JSON.parse(parts.join, symbolize_names: true)[:error]]
#=> [403, "forbidden"]

## stream_commands sets SSE headers
res = AT.response(:stream_commands)
[res.status, res['content-type']]
#=> [200, "text/event-stream"]

## when capture is disabled, the feed opens honestly (capture: disabled)
Familia::Admin.config.command_stream_enabled = false
res = AT.response(:stream_commands)
first = res.body.to_enum(:each).next
JSON.parse(first.sub(/^data: /, ''), symbolize_names: true)[:capture]
#=> "disabled"

## when capture is enabled, the feed opens with capture: enabled
Familia::Admin.config.command_stream_enabled = true
Familia.logger.level = Logger::FATAL if Familia.respond_to?(:logger) && Familia.logger
Familia::Admin.enable_command_capture!
body = AT.response(:stream_commands).body
open_frame = JSON.parse(body.to_enum(:each).next.sub(/^data: /, ''), symbolize_names: true)
body.close
open_frame[:capture]
#=> "enabled"

## the CommandFeed (the machinery behind the body) delivers live command events
q = Thread::SizedQueue.new(64)
Familia::Admin::Streaming::CommandFeed.subscribe(q)
Customer.dbclient.get('stream_trigger_key')
event = nil
5.times { e = q.pop(timeout: 2); (event = e) and break if e && e[:cmd] == 'get' }
Familia::Admin::Streaming::CommandFeed.unsubscribe(q)
[event && event[:cmd], event && event[:key], event && event.key?(:duration_ms), event && event.key?(:ts)]
#=> ["get", "stream_trigger_key", true, true]
