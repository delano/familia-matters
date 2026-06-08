# frozen_string_literal: true
#
# The integrity console is the headline feature: the live AuditReport must
# serialize to the health_check fixture shape (arrays of identifiers + summary).

require_relative 'helper'
TryHelper.boot_and_seed!

## health_check matches the health_check fixture shape
fx = TryHelper.fixture('health_check.sample.json')
live = TryHelper.get_json('/admin/api/integrity/customer')
TryHelper.shape_match?(fx, live)
#==> true

## the seeded drift makes the report unhealthy with phantoms + missing
live = TryHelper.get_json('/admin/api/integrity/customer')
[live['healthy'], live['instances']['phantoms'].size >= 2, live['instances']['missing'].size >= 1]
#=> [false, true, true]

## summary.by_type carries the nine canonical issue keys
TryHelper.get_json('/admin/api/integrity/customer')['summary']['by_type'].keys.sort
#=> ["cross_ref_missing_index", "cross_ref_wrong_target", "missing", "missing_unique_index", "orphaned_index_key", "phantoms", "stale_multi_member", "stale_participation", "stale_unique_index"]

## summary.total_issues equals the sum of by_type
live = TryHelper.get_json('/admin/api/integrity/customer')['summary']
live['total_issues'] == live['by_type'].values.sum
#==> true

## a dry-run repair previews writes without mutating the model
live = TryHelper.json(TryHelper.post('/admin/api/integrity/customer/repair?dry_run=true'))
still = TryHelper.get_json('/admin/api/integrity/customer')
live['dry_run'] == true && live['writes'].is_a?(Integer) && still['healthy'] == false
#==> true

## applying the repair reconciles the model so the next check is healthy
TryHelper.post('/admin/api/integrity/customer/repair')
TryHelper.get_json('/admin/api/integrity/customer')['healthy']
#==> true
