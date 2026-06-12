# try/streams_try.rb
#
# LIVE STREAMS domain: stream_repair (the SSE contract is exercised in detail in
# integrity_try.rb; here we lock the degraded frame, the streaming headers, and
# the auth gate).
#
# stream_commands was removed (T5): its per-request Instrumentation.on_command
# hook could never be unregistered (permanent closure accumulation), boot never
# enabled command capture (the stream emitted only heartbeats), and each open
# connection pinned a Puma worker for 25 seconds. The absence case at the
# bottom locks the removal.

require_relative 'test_helper'
reset_and_seed!

## stream_repair on an unknown model emits a single static error frame, then ends
status, events = adm_sse('/admin/api/stream/repair/nope')
[status, events.length, events.first['error'], events.first['resource']]
#=> [200, 1, "not_found", "model"]

## stream_repair opens with the SSE content-type and the no-buffering streaming
## headers, asserted on the bare triplet so the live body is never enumerated
status, headers, _body = otto_call('/admin/api/stream/repair/customer')
[status, headers['content-type'], headers['cache-control'], headers['x-accel-buffering']]
#=> [200, "text/event-stream", "no-cache", "no"]

## stream_repair requires permission:repair: a VALID token WITHOUT it is an
## authorization denial -> 403, returned immediately (no stream opened)
reset_and_seed!
status, _h, _b = otto_call('/admin/api/stream/repair/customer', custom_token(perms: []))
[status, (200..299).cover?(status)]
#=> [403, false]

## a missing bearer token on the stream route is also denied
reset_and_seed!
status, _h, _b = otto_call('/admin/api/stream/repair/customer', nil)
(200..299).cover?(status)
#=> false

## the stream/commands route is GONE: requesting it is a routing miss (404),
## not a 25-second pinned worker
status, _h, _b = otto_call('/admin/api/stream/commands')
status
#=> 404
