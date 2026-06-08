# frozen_string_literal: true
#
# The live SSE endpoints (Rack 3 streaming bodies): repair progress + command
# feed. Event shapes mirror fixtures/stream_repair.sample.jsonl.

require_relative 'helper'
TryHelper.boot_and_seed!

## the repair stream is served as text/event-stream
TryHelper.get('/admin/api/stream/repair/customer?dry_run=true').headers['content-type']
#=> "text/event-stream"

## the repair stream emits start -> phase -> done events in the fixture shape
events = TryHelper.sse_events(TryHelper.get('/admin/api/stream/repair/customer?dry_run=true'))
start = events.find { |e| e['event'] == 'start' }
done  = events.find { |e| e['event'] == 'done' }
phase = events.find { |e| e['phase'] }
!start.nil? && start.key?('model') && start.key?('dry_run') &&
  !phase.nil? && phase.key?('current') && phase.key?('total') &&
  !done.nil? && done['summary'].is_a?(Hash)
#==> true

## the done summary carries the repair-result counters
events = TryHelper.sse_events(TryHelper.get('/admin/api/stream/repair/customer?dry_run=true'))
summary = events.find { |e| e['event'] == 'done' }['summary']
%w[phantoms_removed missing_added indexes_rebuilt cross_refs_fixed].all? { |k| summary.key?(k) }
#==> true

## the command feed streams {cmd, key, duration_ms} events
events = TryHelper.sse_events(TryHelper.get('/admin/api/stream/commands?limit=4'))
events.any? { |e| e.key?('cmd') && e.key?('key') && e.key?('duration_ms') }
#==> true
