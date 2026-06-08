# frozen_string_literal: true

# Contract: the headline integrity console. The live AuditReport#to_h only
# COUNTS each drift dimension; the prototype consumed identifier ARRAYS plus a
# summary.by_type (fixtures/health_check.sample.json). These pin that transform
# and the dry-run -> apply -> re-check-healthy flow.

require_relative 'helper'

AT.seed!

## a clean check is healthy with the full report shape and zero issues
live = AT.body(:health_check, params: { model: 'customer' })
[live[:healthy], live[:summary][:total_issues], live[:instances][:phantoms]]
#=> [true, 0, []]

## the healthy report still covers the health_check.sample.json shape (empty arrays)
AT.covers_shape?(AT.body(:health_check, params: { model: 'customer' }), AT.fixture('health_check.sample.json'))
#=> true

## inject a phantom (timeline entry with no backing object) and it is detected as an ARRAY
Customer.instances.add('cust_phantom_99', Familia.now.to_i)
live = AT.body(:health_check, params: { model: 'customer' })
[live[:healthy], live[:instances][:phantoms], live[:summary][:by_type][:phantoms]]
#=> [false, ["cust_phantom_99"], 1]

## summary.total_issues is derived from the arrays (cannot disagree with sections)
live = AT.body(:health_check, params: { model: 'customer' })
live[:summary][:total_issues] == live[:summary][:by_type].values.sum
#=> true

## report carries the model name + checked_at (renamed from the raw to_h's model_class/audited_at)
live = AT.body(:health_check, params: { model: 'customer' })
[live[:model], live[:checked_at].is_a?(Integer)]
#=> ["Customer", true]

## repair dry-run previews the report and mutates NOTHING
b = AT.body(:repair, params: { model: 'customer', dry_run: 'true' }, perms: %w[repair])
still_there = AT.body(:health_check, params: { model: 'customer' })[:instances][:phantoms]
[b[:dry_run], b[:report][:instances][:phantoms], still_there]
#=> [true, ["cust_phantom_99"], ["cust_phantom_99"]]

## repair apply fixes the drift and reports a summary
b = AT.body(:repair, params: { model: 'customer' }, perms: %w[repair])
[b[:repaired], b[:summary].is_a?(Hash)]
#=> [true, true]

## after repair, the next check comes back healthy (the prototype's state rule, for real)
AT.body(:health_check, params: { model: 'customer' })[:healthy]
#=> true

## stale_indexes endpoint returns its array shape
AT.body(:stale_indexes).key?(:stale_indexes)
#=> true

## health_check of an unknown model is a 404
AT.api(:health_check, params: { model: 'nope' })[0]
#=> 404
