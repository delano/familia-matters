# lib/familia/admin/sessions.rb
#
# frozen_string_literal: true

require 'json'
require 'familia/admin/auth'
require 'familia/admin/passphrase'
require 'familia/admin/rate_limit'
require 'familia/admin/audit_log'

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

    # Secure flag: on except in development over loopback (auth-ui-spec Open Q#6).
    # HttpOnly + SameSite=Strict are unconditional (defaults of send_secure_cookie).
    def set_session_cookie(token, ttl)
      @res.send_secure_cookie(Familia::Admin::Auth::SESSION_COOKIE, token, ttl, secure: secure_cookie?)
    end

    def clear_session_cookie
      # Negative ttl drives send_secure_cookie's deletion path (max-age 0 + past expires).
      @res.send_secure_cookie(Familia::Admin::Auth::SESSION_COOKIE, '', -1, secure: secure_cookie?)
    end

    def secure_cookie?
      !(development? && loopback?)
    end

    def development?
      env = ENV['RACK_ENV'] || ENV['APP_ENV'] || 'development'
      env == 'development'
    end

    def loopback?
      @req.respond_to?(:local?) ? !!@req.local? : %w[127.0.0.1 ::1].include?(@req.env['REMOTE_ADDR'])
    end

    def client_ip
      @req.respond_to?(:ip) && @req.ip ? @req.ip : (@req.env['REMOTE_ADDR'] || 'unknown')
    end

    def body_json
      @body_json ||= begin
        body = @req.body
        raw = body ? body.read : ''
        body.rewind if body.respond_to?(:rewind)
        raw.to_s.empty? ? {} : (JSON.parse(raw) rescue {})
      end
    end

    def audit!(action, actor: 'anonymous', **details)
      Familia::Admin::AuditLog.record(actor: actor, action: action, **details)
    rescue StandardError
      nil
    end

    # Set @res.status and RETURN the bare hash (Otto JSONHandler serializes it).
    def json(payload, status: 200)
      @res.status = status
      payload
    end
  end
end
