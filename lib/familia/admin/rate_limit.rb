# lib/familia/admin/rate_limit.rb
#
# frozen_string_literal: true

module Familia
  module Admin
    # Failed-login throttle backed by Valkey counters.
    #
    # A single shared passphrase has no per-account lockout to lean on, so the
    # limiter keys on the client IP: too many FAILED attempts within a window locks
    # that source for the remainder of the window. Successful logins reset the
    # counter. Thresholds are conservative defaults (auth-ui-spec Open Q#5) and are
    # env-tunable; document any change against the ADR.
    #
    # Mechanics: INCR a per-IP key, EXPIRE it to the window on first failure (so the
    # window is a fixed window from the first failure). `locked?` is checked BEFORE
    # the passphrase compare, so a locked source learns nothing about whether its
    # guess would have worked.
    module RateLimit
      # Failed attempts within the window before a source is locked.
      FAIL_LIMIT_DEFAULT = 5
      # Window / lockout duration in seconds (also the counter TTL).
      WINDOW_SECONDS_DEFAULT = 900

      module_function

      def fail_limit
        int_env('FAMILIA_ADMIN_LOGIN_FAIL_LIMIT', FAIL_LIMIT_DEFAULT)
      end

      def window_seconds
        int_env('FAMILIA_ADMIN_LOGIN_WINDOW', WINDOW_SECONDS_DEFAULT)
      end

      # Whether this source is currently locked out. Read-only (no side effects),
      # so it is safe to call before verifying the passphrase.
      # @return [Boolean]
      def locked?(ip)
        current(ip) >= fail_limit
      end

      # Seconds until the current lockout window elapses (0 when not locked).
      # @return [Integer]
      def retry_after(ip)
        ttl = safe { Familia.dbclient.ttl(redis_key(ip)) }
        ttl.is_a?(Integer) && ttl.positive? ? ttl : 0
      end

      # Record a failed attempt; returns the new failure count. Sets the window TTL
      # on the first failure so the lockout is a fixed window from first failure.
      # @return [Integer]
      def record_failure(ip)
        key = redis_key(ip)
        n = safe { Familia.dbclient.incr(key) } || 0
        safe { Familia.dbclient.expire(key, window_seconds) } if n == 1
        n
      end

      # Clear the counter for a source (called on successful login).
      def reset(ip)
        safe { Familia.dbclient.del(redis_key(ip)) }
      end

      # Current failure count for a source.
      # @return [Integer]
      def current(ip)
        safe { Familia.dbclient.get(redis_key(ip)) }.to_i
      end

      def redis_key(ip)
        "familia_admin:login_fail:#{ip}"
      end

      def int_env(name, default)
        v = ENV[name]
        v && v.to_s.match?(/\A\d+\z/) ? v.to_i : default
      end

      def safe
        yield
      rescue StandardError
        nil
      end
    end
  end
end
