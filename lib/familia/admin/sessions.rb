# lib/familia/admin/sessions.rb
#
# frozen_string_literal: true

require 'json'
require 'familia/admin/auth'
require 'familia/admin/passphrase'
require 'familia/admin/rate_limit'
require 'familia/admin/audit_log'
require 'familia/admin/util'

# Admin::Sessions
#
# The browser authentication surface: exchange a shared passphrase for a minted
# PASETO delivered as an HttpOnly session cookie, introspect the current session,
# and clear it. Otto instantiates this per request with (req, res) exactly like
# Admin::API, and the same response contract applies: actions set @res.status and
# RETURN a bare Hash (Otto's JSONHandler serializes it). Cookies set on @res via
# send_secure_cookie survive that serialization (the handler reuses the same
# response object and calls #finish).
#
# Routes (resources/00-assets/routes.txt):
#   POST   /admin/api/auth/login    -> #login    (no session required)
#   GET    /admin/api/auth/session  -> #show     (auth=role:admin)
#   DELETE /admin/api/auth/session  -> #destroy  (no session required)
#
# THE TOKEN NEVER APPEARS IN A RESPONSE BODY. Login delivers it only as the cookie
# and returns the claims; #show returns claims; the passphrase never appears in any
# response, error, or log.
module Admin
  class Sessions
    include Familia::Admin::Util

    # Recognized tokens for the FAMILIA_ADMIN_COOKIE_SECURE override. Anything
    # else (unset, empty, garbage) falls through to the request-aware default.
    COOKIE_SECURE_TRUE  = %w[1 true yes on].freeze
    COOKIE_SECURE_FALSE = %w[0 false no off].freeze

    def initialize(req, res)
      @req = req
      @res = res
    end

    # POST /admin/api/auth/login   body: { passphrase: "..." }
    #
    # Order matters: the lockout check precedes the passphrase compare so a locked
    # source learns nothing about its guess. An unset passphrase reference rejects
    # every attempt. A wrong passphrase yields a single generic error (no
    # disclosure of which part failed) and increments the failure counter.
    def login
      ip = client_ip

      if Familia::Admin::RateLimit.locked?(ip)
        audit!(:login_locked, ip: ip)
        return json({ error: 'locked', retry_after: Familia::Admin::RateLimit.retry_after(ip) }, status: 429)
      end

      submitted = body_json['passphrase']

      unless Familia::Admin::Passphrase.verify(submitted)
        Familia::Admin::RateLimit.record_failure(ip)
        # Generic error: do not disclose whether the passphrase reference is unset
        # or simply wrong, and never echo the submission.
        return json({ error: 'invalid_passphrase' }, status: 401)
      end

      Familia::Admin::RateLimit.reset(ip)

      ttl   = Familia::Admin::Auth::DEFAULT_TTL
      token = Familia::Admin::Auth.mint_session(ttl: ttl)
      set_session_cookie(token, ttl)

      claims = Familia::Admin::Auth.verify(token)
      audit!(:login, actor: claims.sub)
      json(claims_payload(claims))
    end

    # GET /admin/api/auth/session  (auth=role:admin)
    # Returns the current session's claims for UI bootstrap. Requires a valid
    # session (the route's auth gate guarantees the strategy_result is present).
    def show
      sr = @req.env['otto.strategy_result']
      user = sr && sr.respond_to?(:user) ? sr.user : nil
      return json({ error: 'no_session' }, status: 401) unless user.is_a?(Hash)

      json({
        sub: user[:id] || user['id'],
        role: user[:role] || user['role'],
        permissions: Array(user[:permissions] || user['permissions']),
        exp: user[:exp] || user['exp'],
      })
    end

    # DELETE /admin/api/auth/session  (no session required)
    # Clears the browser session cookie. Reachable without a valid session so a
    # stale/expired cookie can still be cleared. PASETO v2.local is stateless, so
    # this ends the BROWSER session but does not revoke the token before its expiry
    # (TTL-only revocation; see the ADR).
    def destroy
      clear_session_cookie
      json({ ok: true })
    end

    private

    # The minted PASETO claims as the public session payload — never the token.
    def claims_payload(claims)
      {
        sub: claims.sub,
        role: claims.role,
        permissions: claims.permissions,
        exp: claims.exp,
      }
    end

    # Secure flag: request-aware (see secure_cookie? below). HttpOnly +
    # SameSite=Strict are unconditional (defaults of send_secure_cookie).
    def set_session_cookie(token, ttl)
      @res.send_secure_cookie(Familia::Admin::Auth::SESSION_COOKIE, token, ttl, secure: secure_cookie?)
    end

    def clear_session_cookie
      # Negative ttl drives send_secure_cookie's deletion path (max-age 0 + past expires).
      @res.send_secure_cookie(Familia::Admin::Auth::SESSION_COOKIE, '', -1, secure: secure_cookie?)
    end

    # The Secure attribute must track the ACTUAL request, not RACK_ENV (T4).
    # The production deployment is an SSH tunnel: RACK_ENV=production but the
    # loopback request is plain HTTP. Keying off RACK_ENV set `Secure` there,
    # and Safari historically drops Secure cookies on loopback http — a silent
    # login loop. So: Secure when the request is HTTPS or from a non-loopback
    # client; plain http over loopback omits it. FAMILIA_ADMIN_COOKIE_SECURE
    # overrides in either direction for deployments this heuristic misjudges.
    def secure_cookie?
      override = cookie_secure_override
      return override unless override.nil?

      request_secure? || !loopback?
    end

    # Tri-state env override: true / false / nil (no override).
    def cookie_secure_override
      v = ENV['FAMILIA_ADMIN_COOKIE_SECURE'].to_s.strip.downcase
      return true  if COOKIE_SECURE_TRUE.include?(v)
      return false if COOKIE_SECURE_FALSE.include?(v)

      nil
    end

    # Otto::Request#secure? checks the direct connection (HTTPS env / port 443)
    # and honors X-Forwarded-Proto ONLY from Otto's trusted_proxies — the same
    # single trust config client_ip leans on.
    def request_secure?
      @req.respond_to?(:secure?) ? !!@req.secure? : @req.env['rack.url_scheme'] == 'https'
    end

    # Deliberately NOT Otto::Request#local?: that helper is env-gated (always
    # false outside dev), which would smuggle RACK_ENV right back into the
    # Secure decision. The TCP peer address is the truth we key on; through the
    # SSH tunnel every operator arrives as 127.0.0.1.
    def loopback?
      %w[127.0.0.1 ::1].include?(@req.env['REMOTE_ADDR'].to_s)
    end

    # The rate-limit key — must be an address the client cannot forge. `@req.ip`
    # is Otto::Request#ip, which returns the raw TCP peer (REMOTE_ADDR) UNLESS the
    # peer is in Otto's `security_config.trusted_proxies` — which defaults to
    # EMPTY. So by default X-Forwarded-For is NOT consulted and the key is
    # unspoofable. (Note: Otto does not override #ip but DOES override
    # #trusted_proxy?, the predicate #ip uses to decide whether to read
    # X-Forwarded-For; Rack's own RFC1918-trusting default filter is never called.
    # This is why security finding 0609's "spoofable X-Forwarded-For" was a false
    # positive — see docs/adr/0001 section 5.)
    #
    # Behind a reverse proxy, register the proxy via Otto's trusted_proxies so this
    # (and IP-privacy masking) resolve the real client; otherwise every request
    # keys on the proxy's IP. Do NOT add a parallel trusted-proxy config here —
    # keep it the single Otto one to avoid divergence.
    def client_ip
      @req.respond_to?(:ip) && @req.ip ? @req.ip : (@req.env['REMOTE_ADDR'] || 'unknown')
    end

    # body_json / json / safe come from Familia::Admin::Util (shared with
    # Admin::API); see util.rb for the Otto JSONHandler contract and the T4
    # truth-telling policy.

    # Auditing must never break login itself, but a failed audit write is
    # LOGGED via safe{} (T4) instead of vanishing.
    def audit!(action, actor: 'anonymous', **details)
      safe('audit!') { Familia::Admin::AuditLog.record(actor: actor, action: action, **details) }
    end
  end
end
