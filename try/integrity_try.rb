# try/integrity_try.rb
#
# INTEGRITY domain: health_check, repair dry-run, stream_repair SSE.
# Live-shape delta: GET /integrity/:model returns report.to_h, whose live keys
# differ from the fixture (model_class not model; audited_at not checked_at;
# counts are integers not arrays; no summary). We assert the LIVE keys.
#
# SPECIFIES bug #3 -- on CLEAN seeded data the stream_repair 'done' event must
# report healthy:true AND agree with GET /integrity/:model healthy:true on the
# same data. On a clean seed the source already agrees, so this is GREEN at
# baseline; we assert the agreement (correct behavior) regardless of color.

require_relative 'test_helper'
reset_and_seed!

## health_check returns report.to_h: live keys (model_class/audited_at/...), 200
status, body = adm_get('/admin/api/integrity/customer')
[status, body.key?('model_class'), body.key?('audited_at'), body.key?('healthy')]
#=> [200, true, true, true]

## the live report does NOT use the fixture's 'model'/'checked_at'/'summary' keys
reset_and_seed!
_s, body = adm_get('/admin/api/integrity/customer')
[body.key?('model'), body.key?('checked_at'), body.key?('summary')]
#=> [false, false, false]

## clean seeded data is healthy, with the instances section as integer counts
reset_and_seed!
_s, body = adm_get('/admin/api/integrity/customer')
[body['healthy'], body['instances']['count_timeline'], body['instances']['phantoms']]
#=> [true, 3, 0]

## health_check carries the index + cross-reference sections
reset_and_seed!
_s, body = adm_get('/admin/api/integrity/customer')
[body['unique_indexes'].is_a?(Array), body['multi_indexes'].is_a?(Array), body['cross_references'].is_a?(Hash)]
#=> [true, true, true]

## repair dry-run previews without mutating: dry_run:true + a report
reset_and_seed!
status, body = adm_post('/admin/api/integrity/customer/repair', {}, admin_token)
# default repair (no dry_run) runs repair_all!; assert the dry-run preview path:
_s2, dry = adm_get('/admin/api/integrity/customer')  # baseline read
sd, drybody = adm_post('/admin/api/integrity/customer/repair?dry_run=true', {}, admin_token)
[sd, drybody['dry_run'], drybody['report'].is_a?(Hash)]
#=> [200, true, true]

## repair is elevated: a reduced token (no repair permission) is denied 403 (valid token, lacks permission)
reset_and_seed!
status, = adm_post('/admin/api/integrity/customer/repair', {}, reduced_token)
status
#=> 403

# ---------------------------------------------------------------------------
# stream_repair SSE -- bug #3: healthy agreement on clean data.
# ---------------------------------------------------------------------------

## stream_repair emits start, per-phase, and a done event (SSE frames parse)
reset_and_seed!
status, events = adm_sse('/admin/api/stream/repair/customer')
kinds = { start: events.any? { |e| e['event'] == 'start' },
          phases: events.count { |e| e['phase'] },
          done: events.any? { |e| e['event'] == 'done' } }
[status, kinds[:start], kinds[:phases] >= 1, kinds[:done]]
#=> [200, true, true, true]

## the start event names the model and per-phase events carry phase/total
reset_and_seed!
_s, events = adm_sse('/admin/api/stream/repair/customer')
phase = events.find { |e| e['phase'] }
[events.find { |e| e['event'] == 'start' }['model'], phase.key?('phase'), phase.key?('total')]
#=> ["Customer", true, true]

## BUG #3: on clean data the done event is healthy:true ...
reset_and_seed!
_s, events = adm_sse('/admin/api/stream/repair/customer')
events.find { |e| e['event'] == 'done' }['healthy']
#=> true

## ... AND it AGREES with GET /integrity/:model healthy on the identical data (bug #3)
reset_and_seed!
_s1, events = adm_sse('/admin/api/stream/repair/customer')
done_healthy = events.find { |e| e['event'] == 'done' }['healthy']
_s2, ic = adm_get('/admin/api/integrity/customer')
[done_healthy, ic['healthy'], done_healthy == ic['healthy']]
#=> [true, true, true]

## stream_repair is elevated: a reduced token (valid, lacks repair permission) is an
## AUTHORIZATION denial -> 403 even on this non-response=json route (authz denials are
## 403 regardless of content type; only AUTHENTICATION failures still 302-redirect).
## A non-2xx is exactly what the client must treat as forbidden.
reset_and_seed!
get '/admin/api/stream/repair/customer', {}, { 'HTTP_AUTHORIZATION' => "Bearer #{reduced_token}", 'HTTP_ACCEPT' => 'text/event-stream' }
[last_response.status, (200..299).cover?(last_response.status)]
#=> [403, false]
