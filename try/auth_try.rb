# try/auth_try.rb
#
# AUTH-UI domain -- the browser login flow added for docs/familia-admin-auth-ui-spec.md.
# Drives the SAME stack config.ru serves (OriginGuard -> Otto + PASETO strategies),
# so login/session/logout, cookie auth, Bearer precedence, the 401-vs-403 split,
# the loopback-conditional Secure cookie, failed-login lockout, and the CSRF Origin
# guard are all exercised end to end against live Valkey.
#
# clear_cookies precedes the cookie cases so Rack::Test's jar from a prior login
# does not leak into the next assertion.

require_relative 'test_helper'
reset_and_seed!

# ===========================================================================
# LOGIN: passphrase -> minted PASETO in an HttpOnly cookie; body = claims only.
# ===========================================================================

## a correct passphrase returns the claims; the token is delivered ONLY as a cookie
reset_and_seed!
clear_cookies
status, body = login(TEST_PASSPHRASE)
cookie_tok = set_session_cookie_value
[status, body['role'], body['permissions'].sort, last_response.body.include?('v2.local'), cookie_tok.to_s.start_with?('v2.local')]
#=> [200, "admin", ["raw_command", "repair", "reveal_secrets", "run_migrations"], false, true]

## the response carries subject and a numeric expiry, never the token
reset_and_seed!
clear_cookies
_s, body = login(TEST_PASSPHRASE)
[body['sub'], body['exp'].is_a?(Integer), body.key?('token')]
#=> ["admin", true, false]

## the session cookie is HttpOnly and SameSite=Strict (not readable by document.cookie)
reset_and_seed!
clear_cookies
login(TEST_PASSPHRASE)
attrs = set_cookie_attrs
[attrs.include?('httponly'), attrs.include?('samesite=strict')]
#=> [true, true]

## Secure is set for a non-loopback client (TLS-only transmission)
reset_and_seed!
clear_cookies
login(TEST_PASSPHRASE, ip: '203.0.113.1')
set_cookie_attrs.include?('secure')
#=> true

## Secure is omitted for a loopback client in development (auth-ui-spec Open Q#6)
reset_and_seed!
clear_cookies
login(TEST_PASSPHRASE, ip: '127.0.0.1')
set_cookie_attrs.include?('secure')
#=> false

# ===========================================================================
# SECURE COOKIE IS REQUEST-AWARE (T4): the flag tracks the actual request
# (scheme + loopback peer), never RACK_ENV. The production deployment is an
# SSH tunnel — RACK_ENV=production but plain-http loopback requests — where a
# RACK_ENV-keyed Secure attribute makes Safari silently drop the cookie (a
# silent login loop). FAMILIA_ADMIN_COOKIE_SECURE overrides in either
# direction; garbage values fall back to the request-aware default.
# ===========================================================================

## production + loopback http => no Secure (the SSH-tunnel shape; Safari keeps the cookie)
reset_and_seed!
clear_cookies
@saved_rack_env = ENV['RACK_ENV']
ENV['RACK_ENV'] = 'production'
login(TEST_PASSPHRASE, ip: '127.0.0.1')
ENV['RACK_ENV'] = @saved_rack_env
set_cookie_attrs.include?('secure')
#=> false

## production + https => Secure (TLS-only transmission)
reset_and_seed!
clear_cookies
@saved_rack_env = ENV['RACK_ENV']
ENV['RACK_ENV'] = 'production'
post '/admin/api/auth/login', JSON.generate(passphrase: TEST_PASSPHRASE),
     { 'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
       'HTTPS' => 'on', 'REMOTE_ADDR' => '127.0.0.1', 'SERVER_NAME' => '127.0.0.1' }
ENV['RACK_ENV'] = @saved_rack_env
[last_response.status, set_cookie_attrs.include?('secure')]
#=> [200, true]

## production + non-loopback http => Secure (a remote client must never get a clear-text cookie)
reset_and_seed!
clear_cookies
@saved_rack_env = ENV['RACK_ENV']
ENV['RACK_ENV'] = 'production'
login(TEST_PASSPHRASE, ip: '203.0.113.40')
ENV['RACK_ENV'] = @saved_rack_env
set_cookie_attrs.include?('secure')
#=> true

## FAMILIA_ADMIN_COOKIE_SECURE=true wins over the request: Secure even on loopback http
reset_and_seed!
clear_cookies
@saved_cookie_secure = ENV['FAMILIA_ADMIN_COOKIE_SECURE']
ENV['FAMILIA_ADMIN_COOKIE_SECURE'] = 'true'
login(TEST_PASSPHRASE, ip: '127.0.0.1')
ENV['FAMILIA_ADMIN_COOKIE_SECURE'] = @saved_cookie_secure
set_cookie_attrs.include?('secure')
#=> true

## FAMILIA_ADMIN_COOKIE_SECURE=false wins over the request: no Secure even on https + non-loopback
reset_and_seed!
clear_cookies
@saved_cookie_secure = ENV['FAMILIA_ADMIN_COOKIE_SECURE']
ENV['FAMILIA_ADMIN_COOKIE_SECURE'] = 'false'
post '/admin/api/auth/login', JSON.generate(passphrase: TEST_PASSPHRASE),
     { 'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
       'HTTPS' => 'on', 'REMOTE_ADDR' => '203.0.113.41', 'SERVER_NAME' => 'admin.example.com' }
ENV['FAMILIA_ADMIN_COOKIE_SECURE'] = @saved_cookie_secure
[last_response.status, set_cookie_attrs.include?('secure')]
#=> [200, false]

## a garbage override value is ignored: the request-aware default applies (loopback http => no Secure)
reset_and_seed!
clear_cookies
@saved_cookie_secure = ENV['FAMILIA_ADMIN_COOKIE_SECURE']
ENV['FAMILIA_ADMIN_COOKIE_SECURE'] = 'maybe'
login(TEST_PASSPHRASE, ip: '127.0.0.1')
ENV['FAMILIA_ADMIN_COOKIE_SECURE'] = @saved_cookie_secure
set_cookie_attrs.include?('secure')
#=> false

## a wrong passphrase is a generic 401 and sets no cookie (no disclosure)
reset_and_seed!
clear_cookies
status, body = login('wrong-passphrase', ip: '203.0.113.8')
[status, body['error'], set_session_cookie_value]
#=> [401, "invalid_passphrase", nil]

## with the passphrase reference unset, every login is rejected (reject-all)
reset_and_seed!
clear_cookies
@saved_pp = ENV.delete('FAMILIA_ADMIN_PASSPHRASE')
status, body = login('anything', ip: '203.0.113.7')
ENV['FAMILIA_ADMIN_PASSPHRASE'] = @saved_pp
[status, body['error'], set_session_cookie_value]
#=> [401, "invalid_passphrase", nil]

# ===========================================================================
# COOKIE AUTH + BEARER PRECEDENCE: the strategy accepts either, header wins.
# ===========================================================================

## a valid session cookie authenticates on a protected route (no Bearer header)
reset_and_seed!
clear_cookies
login(TEST_PASSPHRASE)
status, body = cookie_get('/admin/api/_meta', set_session_cookie_value)
[status, body.is_a?(Hash)]
#=> [200, true]

## a Bearer header takes precedence: a valid Bearer wins despite a garbage cookie
reset_and_seed!
clear_cookies
get '/admin/api/_meta', {}, auth_headers(admin_token).merge('HTTP_COOKIE' => "#{Familia::Admin::Auth::SESSION_COOKIE}=garbage")
last_response.status
#=> 200

## a garbage cookie with no Bearer is rejected 401 (invalid credential)
reset_and_seed!
clear_cookies
s, = cookie_get('/admin/api/_meta', 'garbage')
s
#=> 401

# ===========================================================================
# SESSION INTROSPECTION: claims for UI bootstrap; requires a valid session.
# ===========================================================================

## GET auth/session returns the claims for a valid cookie session (never the token)
reset_and_seed!
clear_cookies
login(TEST_PASSPHRASE)
status, body = cookie_get('/admin/api/auth/session', set_session_cookie_value)
[status, body['role'], body['permissions'].include?('repair'), body['exp'].is_a?(Integer), last_response.body.include?('v2.local')]
#=> [200, "admin", true, true, false]

## GET auth/session also works for a programmatic Bearer client
reset_and_seed!
clear_cookies
status, body = adm_get('/admin/api/auth/session', admin_token)
[status, body['role'], body['sub']]
#=> [200, "admin", "admin@test"]

## GET auth/session with no session is 401 (requires a valid session)
reset_and_seed!
clear_cookies
get '/admin/api/auth/session', {}, { 'HTTP_ACCEPT' => 'application/json' }
last_response.status
#=> 401

# ===========================================================================
# LOGOUT: clears the cookie; reachable without a valid session.
# ===========================================================================

## DELETE auth/session clears the cookie and is reachable without a session
reset_and_seed!
clear_cookies
status, body = logout
[status, body['ok'], set_session_cookie_value, set_cookie_attrs.include?('httponly')]
#=> [200, true, "", true]

# ===========================================================================
# RATE LIMIT: repeated failures lock the source; success resets the counter.
# Lockout-dependent cases pin FAMILIA_ADMIN_LOGIN_LIMITER on (delete the var)
# so this file also passes when run with the switch off (T4 AC2).
# ===========================================================================

## repeated failures lock the source; even a correct passphrase is then refused 429
reset_and_seed!
clear_cookies
@saved_limiter = ENV['FAMILIA_ADMIN_LOGIN_LIMITER']
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = nil
5.times { login('wrong', ip: '203.0.113.99') }
status, body = login(TEST_PASSPHRASE, ip: '203.0.113.99')
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = @saved_limiter
[status, body['error'], body['retry_after'] > 0]
#=> [429, "locked", true]

## a correct passphrase under the failure threshold logs in and resets the counter
reset_and_seed!
clear_cookies
2.times { login('wrong', ip: '203.0.113.50') }
status, body = login(TEST_PASSPHRASE, ip: '203.0.113.50')
[status, body['role'], Familia::Admin::RateLimit.current('203.0.113.50')]
#=> [200, "admin", 0]

## a TTL-less counter (first EXPIRE lost) is re-armed on the next failure — no permanent lock
reset_and_seed!
@saved_limiter = ENV['FAMILIA_ADMIN_LOGIN_LIMITER']
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = nil
key = Familia::Admin::RateLimit.redis_key('203.0.113.77')
Familia.dbclient.del(key)
Familia.dbclient.incr(key) # simulate a counter whose first EXPIRE never landed
ttl_before = Familia.dbclient.ttl(key)
Familia::Admin::RateLimit.record_failure('203.0.113.77')
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = @saved_limiter
[ttl_before, Familia.dbclient.ttl(key).positive?]
#=> [-1, true]

## FAIL_LIMIT=0 / WINDOW=0 are rejected like garbage: defaults apply, login stays possible
ENV['FAMILIA_ADMIN_LOGIN_FAIL_LIMIT'] = '0'
ENV['FAMILIA_ADMIN_LOGIN_WINDOW'] = '0'
limits = [Familia::Admin::RateLimit.fail_limit, Familia::Admin::RateLimit.window_seconds]
ENV.delete('FAMILIA_ADMIN_LOGIN_FAIL_LIMIT')
ENV.delete('FAMILIA_ADMIN_LOGIN_WINDOW')
limits
#=> [5, 900]

# ===========================================================================
# LIMITER SWITCH (T4): FAMILIA_ADMIN_LOGIN_LIMITER=off makes the limiter a
# no-op. Through the SSH tunnel every client is 127.0.0.1, so one teammate's
# typos would otherwise lock out ALL operators for the window. Default is ON;
# only the literal "off" disables (fail-safe for typos).
# ===========================================================================

## limiter off (tunnel mode): 6 failed logins then the correct passphrase still logs in
reset_and_seed!
clear_cookies
@saved_limiter = ENV['FAMILIA_ADMIN_LOGIN_LIMITER']
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = 'off'
6.times { login('wrong', ip: '203.0.113.60') }
status, body = login(TEST_PASSPHRASE, ip: '203.0.113.60')
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = @saved_limiter
[status, body['role']]
#=> [200, "admin"]

## the off switch is a no-op, not a deletion: nothing accrues, nothing locks
reset_and_seed!
@saved_limiter = ENV['FAMILIA_ADMIN_LOGIN_LIMITER']
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = 'off'
n = Familia::Admin::RateLimit.record_failure('203.0.113.61')
locked = Familia::Admin::RateLimit.locked?('203.0.113.61')
wait = Familia::Admin::RateLimit.retry_after('203.0.113.61')
counted = Familia::Admin::RateLimit.current('203.0.113.61')
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = @saved_limiter
[n, locked, wait, counted]
#=> [0, false, 0, 0]

## only the literal "off" (case-insensitive) disables; any other value keeps the limiter ON
@saved_limiter = ENV['FAMILIA_ADMIN_LOGIN_LIMITER']
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = 'disabled'
typo_on = Familia::Admin::RateLimit.enabled?
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = 'OFF'
upcase_off = Familia::Admin::RateLimit.enabled?
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = @saved_limiter
[typo_on, upcase_off]
#=> [true, false]

# ===========================================================================
# RATE-LIMIT KEY IS NOT X-FORWARDED-FOR-SPOOFABLE (security finding 0609,
# re-analysed as a FALSE POSITIVE — see docs/adr/0001 section 5). `@req.ip`
# returns the TCP peer (REMOTE_ADDR) unless the peer is in Otto's
# security_config.trusted_proxies, which defaults to EMPTY — so by default
# X-Forwarded-For is never consulted. These tests pin that contract so it
# cannot silently regress (e.g. a future change keying on a raw header).
# ===========================================================================

## by default, an internal peer cannot escape the lockout by rotating X-Forwarded-For
reset_and_seed!
clear_cookies
@saved_limiter = ENV['FAMILIA_ADMIN_LOGIN_LIMITER']
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = nil
5.times { |i| login('wrong', ip: '10.0.0.5', xff: "203.0.113.#{100 + i}") }
status, body = login(TEST_PASSPHRASE, ip: '10.0.0.5', xff: '203.0.113.250')
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = @saved_limiter
[status, body['error']]
#=> [429, "locked"]

## the limiter keys on the real peer (REMOTE_ADDR), never the untrusted X-Forwarded-For value
reset_and_seed!
clear_cookies
@saved_limiter = ENV['FAMILIA_ADMIN_LOGIN_LIMITER']
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = nil
login('wrong', ip: '10.0.0.9', xff: '198.51.100.77')
counts = [Familia::Admin::RateLimit.current('10.0.0.9'), Familia::Admin::RateLimit.current('198.51.100.77')]
ENV['FAMILIA_ADMIN_LOGIN_LIMITER'] = @saved_limiter
counts
#=> [1, 0]

# ===========================================================================
# CSRF: a cookie makes csrf=exempt mutations cross-site reachable. SameSite +
# the OriginGuard close that; Bearer clients are unaffected.
# ===========================================================================

## a cookie-authenticated mutation from a FOREIGN Origin is blocked (CSRF defense)
reset_and_seed!
clear_cookies
login(TEST_PASSPHRASE)
status, body = cookie_post('/admin/api/models/customer/records',
                           { fields: { custid: 'csrf_x', email: 'csrf@x.z' } },
                           set_session_cookie_value, origin: 'http://evil.example.com')
[status, body['error']]
#=> [403, "forbidden_origin"]

## the SAME cookie mutation from the same origin succeeds
reset_and_seed!
clear_cookies
login(TEST_PASSPHRASE)
status, body = cookie_post('/admin/api/models/customer/records',
                           { fields: { custid: 'csrf_ok', email: 'csrfok@x.z' } },
                           set_session_cookie_value, origin: SAME_ORIGIN)
[status, body['custid']]
#=> [200, "csrf_ok"]

## a cookie mutation with NO Origin/Referer is refused (defense-in-depth)
reset_and_seed!
clear_cookies
login(TEST_PASSPHRASE)
status, body = cookie_post('/admin/api/models/customer/records',
                           { fields: { custid: 'csrf_no', email: 'csrfno@x.z' } },
                           set_session_cookie_value, origin: nil)
[status, body['error']]
#=> [403, "forbidden_origin"]

## a Bearer-authenticated mutation is NOT subject to the Origin check (curl/CI/MCP unaffected)
reset_and_seed!
clear_cookies
post '/admin/api/models/customer/records',
     JSON.generate(fields: { custid: 'bearer_x', email: 'bx@x.z' }),
     auth_headers(admin_token).merge('HTTP_ORIGIN' => 'http://evil.example.com')
[last_response.status, JSON.parse(last_response.body)['custid']]
#=> [200, "bearer_x"]

## an EMPTY 'Bearer ' header does not stand the guard down: the strategy would fall
## back to the ambient cookie, so the Origin check must still apply (regex alignment)
reset_and_seed!
clear_cookies
login(TEST_PASSPHRASE)
post '/admin/api/models/customer/records',
     JSON.generate(fields: { custid: 'csrf_eb', email: 'csrfeb@x.z' }),
     cookie_headers(set_session_cookie_value, origin: 'http://evil.example.com')
       .merge('HTTP_AUTHORIZATION' => 'Bearer ')
[last_response.status, JSON.parse(last_response.body)['error']]
#=> [403, "forbidden_origin"]

# ===========================================================================
# TRUTH-TELLING safe{} (T4): a rescued exception is logged to stderr (tagged
# with the rescuing class, exception class + message) while the response still
# degrades gracefully. The old silent safe{} converted incident-time failures
# into mysteriously missing fields.
# ===========================================================================

## a raised reflection error surfaces in stderr while the response degrades gracefully
reset_and_seed!
clear_cookies
Customer.define_singleton_method(:count) { raise NoMethodError, 'synthetic reflection failure (T4 try)' }
@captured = StringIO.new
@orig_stderr = $stderr
$stderr = @captured
status, body = adm_get('/admin/api/models/customer/records')
$stderr = @orig_stderr
Customer.singleton_class.send(:remove_method, :count)
log = @captured.string
[status, body['records'].is_a?(Array), body.key?('count_fast'), body['count_fast'],
 log.include?('[familia-admin Admin::API]'), log.include?('NoMethodError'),
 log.include?('synthetic reflection failure (T4 try)')]
#=> [200, true, true, nil, true, true, true]

## a failed audit write during login is logged (tagged Admin::Sessions), and login still succeeds
reset_and_seed!
clear_cookies
@orig_record = Familia::Admin::AuditLog.method(:record)
Familia::Admin::AuditLog.define_singleton_method(:record) { |**| raise RuntimeError, 'audit sink down (T4 try)' }
@captured = StringIO.new
@orig_stderr = $stderr
$stderr = @captured
status, body = login(TEST_PASSPHRASE)
$stderr = @orig_stderr
Familia::Admin::AuditLog.singleton_class.send(:remove_method, :record)
Familia::Admin::AuditLog.define_singleton_method(:record, @orig_record)
log = @captured.string
[status, body['role'], log.include?('[familia-admin Admin::Sessions audit!]'),
 log.include?('RuntimeError'), log.include?('audit sink down (T4 try)')]
#=> [200, "admin", true, true, true]

## a malformed login body logs the exception CLASS only — JSON::ParserError's
## message quotes the raw body, i.e. the passphrase, so it is redacted; the
## request still degrades gracefully to the generic 401
reset_and_seed!
clear_cookies
@captured = StringIO.new
@orig_stderr = $stderr
$stderr = @captured
post '/admin/api/auth/login', '{"passphrase": "hunter2-supersecret',
     { 'CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json',
       'REMOTE_ADDR' => '127.0.0.1' }
$stderr = @orig_stderr
log = @captured.string
[last_response.status, JSON.parse(last_response.body)['error'],
 log.include?('[familia-admin Admin::Sessions body_json]'),
 log.include?('JSON::ParserError'), log.include?('redacted'),
 log.include?('hunter2'), log.include?('supersec'), log.include?('passphrase')]
#=> [401, "invalid_passphrase", true, true, true, false, false, false]
