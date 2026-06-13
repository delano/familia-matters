# try/discovery_try.rb
#
# DISCOVERY domain: _meta (the descriptor IS the frontend's source of truth),
# list_models, describe_model. Asserts KEYS/structure against the live descriptor
# and the fixture shape -- NOT the fixtures' illustrative literals. The descriptor
# is pure metadata (no DB reads), so these lock the wire contract of GET /_meta.

require_relative 'test_helper'
reset_and_seed!

@status, @meta = adm_get('/admin/api/_meta')
@customer = @meta['models'].find { |m| m['model'] == 'customer' }

## _meta is a bare descriptor: top-level keys, no success/data envelope
[@status, @meta.keys.sort]
#=> [200, ["familia_version", "generated_at", "models"]]

## familia_version is the live Familia version string
@meta['familia_version']
#=> Familia::VERSION

## every administrable host model describes (customer/session/api_key). The
## admin's OWN internal models (Familia::Admin::AuditLog) are EXCLUDED from the
## surface — they are not administrable, and the audit trail has its dedicated
## GET /admin/api/audit view, not a degenerate generic-model entry.
@names = @meta['models'].map { |m| m['model'] }
[%w[customer session api_key].all? { |n| @names.include?(n) }, @names.include?('audit_log')]
#=> [true, false]

## the customer descriptor carries the documented metadata keys. json_schema is
## absent (no per-model schema registered) and logical_database is absent
## (customer is on db0 default -> nil -> compacted out). Live truth.
@customer.keys.sort
#=> ["actions", "class", "datatypes", "expiration", "fields", "identifier_field", "indexes", "key_pattern", "model", "participations", "safe_dump_fields"]

## fields carry name/category/persisted; categories cover field/encrypted/transient
cats = @customer['fields'].map { |f| f['category'] }.uniq.sort
cats
#=> ["encrypted", "field", "transient"]

## the encrypted field is masked-by-display and the transient field is hidden
api = @customer['fields'].find { |f| f['name'] == 'api_secret' }
pw  = @customer['fields'].find { |f| f['name'] == 'password' }
[api['category'], api['display'], pw['category'], pw['client_visible']]
#=> ["encrypted", "[CONCEALED]", "transient", false]

## the identifier field is flagged
@customer['fields'].find { |f| f['identifier'] }['name']
#=> "custid"

## datatypes enumerate every attached collection with a canonical wire type. The
## descriptor lists instance-scoped collections AND class-scoped ones (the
## instances timeline, the api_keys participation target, the index keys); assert
## the instance collections are all present with the right type.
inst = @customer['datatypes'].select { |d| d['scope'] == 'instance' }
inst.map { |d| [d['name'], d['type']] }.sort
#=> [["api_keys", "sorted_set"], ["domains", "sorted_set"], ["feature_flags", "set"], ["login_count", "counter"], ["metadata", "hashkey"], ["recent_logins", "list"]]

## both indexes describe with cardinality (live coordinate uses ':' not the
## fixture's '.', so assert structure not the literal)
idx = @customer['indexes'].map { |i| [i['index_name'], i['field'], i['cardinality'], i['queryable']] }.sort
idx
#=> [["email_lookup", "email", "unique", true], ["status_index", "status", "multi", true]]

## actions include reveal (encrypted present) and rebuild_index (indexes present)
@customer['actions']
#==> _.include?('reveal') && _.include?('rebuild_index')

## session is on logical_database 1, has no indexes, and exposes only the
## class-scoped instances timeline (no instance collections)
sess = @meta['models'].find { |m| m['model'] == 'session' }
[sess['logical_database'], sess['indexes'], sess['datatypes'].map { |d| d['scope'] }.uniq]
#=> [1, [], ["class"]]

## api_key participates in the Customer :api_keys sorted set
ak = @meta['models'].find { |m| m['model'] == 'api_key' }
ak['participations'].map { |p| [p['collection'], p['type'], p['target']] }
#=> [["api_keys", "sorted_set", "Customer"]]

## GET /models lists the registered model CLASS names (Descriptor.models.map &:name)
status, body = adm_get('/admin/api/models')
[status, body['models'].include?('Customer'), body['models'].include?('Session')]
#=> [200, true, true]

## GET /models/:model describes a single model (same shape as the _meta entry)
status, body = adm_get('/admin/api/models/customer')
[status, body['model'], body['class']]
#=> [200, "customer", "Customer"]

## an unknown model is a 404 not_found
status, body = adm_get('/admin/api/models/nope')
[status, body['error'], body['resource']]
#=> [404, "not_found", "model"]

## the admin's own internal model (Familia::Admin::AuditLog) is unresolvable
## through every per-model route: a 404 on describe AND on records, matching its
## exclusion from the model list. It is not administrable; GET /admin/api/audit
## is its only surface.
status_d, body_d = adm_get('/admin/api/models/audit_log')
status_r, body_r = adm_get('/admin/api/models/audit_log/records')
[status_d, body_d['error'], status_r, body_r['error']]
#=> [404, "not_found", 404, "not_found"]

## role:admin is required: a missing bearer token is denied (401, the only gate)
get '/admin/api/_meta', {}, {}
last_response.status
#=> 401
