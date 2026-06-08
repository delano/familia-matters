# try/migrations_try.rb
#
# MIGRATIONS domain: status / drift / run / rollback.
# Live-shape delta: Familia::Migration is NOT loaded in this environment, so the
# controller's `safe {}` wrappers collapse the runner/registry to nil. We assert
# the LIVE shapes the source actually produces:
#   migration_status => { status: <runner.status or nil> }
#   schema_drift     => { drift:  <registry.schema_drift or nil> }
#   run/rollback     => 400 'migration runner unavailable' (runner is nil)

require_relative 'test_helper'
reset_and_seed!

## migration_status returns the bare { status: ... } envelope (status nil w/o runner)
status, body = adm_get('/admin/api/migrations')
[status, body.keys, body['status']]
#=> [200, ["status"], nil]

## schema_drift returns the bare { drift: ... } envelope (drift nil w/o registry)
reset_and_seed!
status, body = adm_get('/admin/api/migrations/drift')
[status, body.keys, body['drift']]
#=> [200, ["drift"], nil]

## run is elevated (permission:run_migrations): reduced token denied at the gate
reset_and_seed!
status, = adm_post('/admin/api/migrations/run', {}, reduced_token)
status
#=> 401

## run with the admin token reports the runner is unavailable (no Migration lib)
reset_and_seed!
status, body = adm_post('/admin/api/migrations/run', { dry_run: true }, admin_token)
[status, body['error'], body['message']]
#=> [400, "bad_request", "migration runner unavailable"]

## rollback is elevated: reduced token denied at the gate
reset_and_seed!
status, = adm_post('/admin/api/migrations/rollback', { id: 'x' }, reduced_token)
status
#=> 401

## rollback with the admin token reports the runner is unavailable
reset_and_seed!
status, body = adm_post('/admin/api/migrations/rollback', { id: 'x' }, admin_token)
[status, body['message']]
#=> [400, "migration runner unavailable"]
