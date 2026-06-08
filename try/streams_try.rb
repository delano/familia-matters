# try/streams_try.rb
#
# LIVE STREAMS domain: stream_repair (the SSE contract is exercised in detail in
# integrity_try.rb; here we lock the degraded frame) and stream_commands.
#
# stream_commands note: this boot does NOT enable the command-capture middleware,
# and Familia::Instrumentation IS available, so the live route runs a 25-second
# heartbeat loop. Enumerating that body would block the suite, so we assert the
# auth gate + SSE headers via the bare Otto triplet WITHOUT reading the body.

require_relative 'test_helper'
reset_and_seed!

## stream_repair on an unknown model emits a single static error frame, then ends
status, events = adm_sse('/admin/api/stream/repair/nope')
[status, events.length, events.first['error'], events.first['resource']]
#=> [200, 1, "not_found", "model"]

## stream_commands: an admin token opens the stream (200 + SSE content-type),
## asserted on the bare triplet so the 25s body loop is never enumerated
status, headers, _body = otto_call('/admin/api/stream/commands', admin_token)
[status, headers['content-type']]
#=> [200, "text/event-stream"]

## stream_commands sets the no-buffering streaming headers
reset_and_seed!
_s, headers, _b = otto_call('/admin/api/stream/commands', admin_token)
[headers['cache-control'], headers['x-accel-buffering']]
#=> ["no-cache", "no"]

## stream_commands requires role:admin: a non-admin role is denied (302 redirect,
## the non-json deny shape) -- and this returns immediately (no stream opened)
reset_and_seed!
status, _h, _b = otto_call('/admin/api/stream/commands', custom_token(perms: [], role: 'user'))
[status, (200..299).cover?(status)]
#=> [302, false]

## a missing bearer token on the stream route is also denied
reset_and_seed!
status, _h, _b = otto_call('/admin/api/stream/commands', nil)
(200..299).cover?(status)
#=> false
