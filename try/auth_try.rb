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
# ===========================================================================

## repeated failures lock the source; even a correct passphrase is then refused 429
reset_and_seed!
clear_cookies
5.times { login('wrong', ip: '203.0.113.99') }
status, body = login(TEST_PASSPHRASE, ip: '203.0.113.99')
[status, body['error'], body['retry_after'] > 0]
#=> [429, "locked", true]

## a correct passphrase under the failure threshold logs in and resets the counter
reset_and_seed!
clear_cookies
2.times { login('wrong', ip: '203.0.113.50') }
status, body = login(TEST_PASSPHRASE, ip: '203.0.113.50')
[status, body['role'], Familia::Admin::RateLimit.current('203.0.113.50')]
#=> [200, "admin", 0]

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
5.times { |i| login('wrong', ip: '10.0.0.5', xff: "203.0.113.#{100 + i}") }
status, body = login(TEST_PASSPHRASE, ip: '10.0.0.5', xff: '203.0.113.250')
[status, body['error']]
#=> [429, "locked"]

## the limiter keys on the real peer (REMOTE_ADDR), never the untrusted X-Forwarded-For value
reset_and_seed!
clear_cookies
login('wrong', ip: '10.0.0.9', xff: '198.51.100.77')
[Familia::Admin::RateLimit.current('10.0.0.9'), Familia::Admin::RateLimit.current('198.51.100.77')]
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
