# frozen_string_literal: true

# Contract: migration status/drift/run/rollback. With no migration files defined
# the live runner returns empty collections — the SHAPE is what the prototype
# (migrations.sample.json) consumed, and applying is gated + audited.

require_relative 'helper'

AT.seed!

## migration_status returns status + pending collections
b = AT.body(:migration_status)
[b.key?(:status), b.key?(:pending)]
#=> [true, true]

## schema_drift returns a drift result
AT.body(:schema_drift).key?(:drift)
#=> true

## run_migrations dry-run returns a result envelope and is not audited as applied
b = AT.body(:run_migrations, params: { dry_run: 'true' }, perms: %w[run_migrations])
[b[:dry_run], b.key?(:result)]
#=> [true, true]

## run_migrations requires permission:run_migrations (defense in depth)
AT.api(:run_migrations, params: { dry_run: 'true' }, perms: [])[0]
#=> 403

## rollback requires a migration id
AT.api(:rollback, perms: %w[run_migrations])[0]
#=> 400

## rollback requires permission:run_migrations
AT.api(:rollback, params: { id: 'x' }, perms: [])[0]
#=> 403
