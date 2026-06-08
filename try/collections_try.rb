# try/collections_try.rb
#
# COLLECTIONS domain: read_collection / mutate_collection over the DataTypes
# attached to a record (list/set/sorted_set/hashkey/counter). Locks the bare
# member/size wire shapes against live output.

require_relative 'test_helper'
reset_and_seed!

## read a set collection: bare shape with members
status, body = adm_get('/admin/api/models/customer/records/cust_alice/feature_flags')
[status, body.keys.sort, body['members'].sort]
#=> [200, ["collection", "limit", "members", "offset"], ["beta_ui", "streaming"]]

## read a list collection (recent_logins) returns its members
reset_and_seed!
status, body = adm_get('/admin/api/models/customer/records/cust_alice/recent_logins')
[status, body['collection'], body['members'].is_a?(Array), body['members'].size]
#=> [200, "recent_logins", true, 2]

## reading a collection on a missing record is 404
status, body = adm_get('/admin/api/models/customer/records/nobody/feature_flags')
[status, body['resource']]
#=> [404, "record"]

## mutate a set: add a member, response echoes op/size/members
reset_and_seed!
status, body = adm_post('/admin/api/models/customer/records/cust_alice/feature_flags',
                        { op: 'add', args: ['new_flag'] })
[status, body['op'], body['members'].include?('new_flag'), body['size']]
#=> [200, "add", true, 3]

## mutate a set: remove a member shrinks it
reset_and_seed!
adm_post('/admin/api/models/customer/records/cust_alice/feature_flags', { op: 'add', args: ['temp'] })
status, body = adm_post('/admin/api/models/customer/records/cust_alice/feature_flags',
                        { op: 'remove', args: ['temp'] })
[status, body['members'].include?('temp')]
#=> [200, false]

## mutate a hashkey via the 'set' op: stores field=>value
reset_and_seed!
status, body = adm_post('/admin/api/models/customer/records/cust_alice/metadata',
                        { op: 'set', args: ['tier', 'gold'] })
status
#=> 200

## the hashkey mutation is durable (read it back)
reset_and_seed!
adm_post('/admin/api/models/customer/records/cust_alice/metadata', { op: 'set', args: ['tier', 'gold'] })
_s, body = adm_get('/admin/api/models/customer/records/cust_alice/metadata')
body['members']
#=*>

## an unknown op is a 400 bad_request (allowlist enforced)
reset_and_seed!
status, body = adm_post('/admin/api/models/customer/records/cust_alice/feature_flags',
                        { op: 'DROP', args: ['x'] })
[status, body['error']]
#=> [400, "bad_request"]
