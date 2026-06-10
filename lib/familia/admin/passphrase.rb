# lib/familia/admin/passphrase.rb
#
# frozen_string_literal: true

require 'openssl'

module Familia
  module Admin
    # Shared-passphrase verification for the admin login flow.
    #
    # The login screen exchanges a single shared passphrase for a minted PASETO
    # session (see Admin::Sessions#login). This module owns the comparison and the
    # "is a passphrase even configured?" question.
    #
    # PASSPHRASE-AT-REST DECISION (see docs/adr/0001-auth-ui-flow.md): the
    # reference is held as plaintext in the environment and compared in constant
    # time. The environment is already the secret boundary for this app — the
    # PASETO signing key and the Familia encryption key both live there in
    # plaintext, and the signing key is strictly MORE powerful than the passphrase
    # (it mints any token, bypassing login entirely). Hardening the weaker secret
    # with a hashing dependency while the stronger one stays plaintext buys little
    # against the realistic threat (environment compromise yields the signing key
    # regardless). #verify is the single seam: swap its body for an argon2id/bcrypt
    # digest verify if that calculus ever changes, with no caller impact.
    module Passphrase
      ENV_KEY = 'FAMILIA_ADMIN_PASSPHRASE'

      # Minimum reference length enforced at boot outside development (see
      # Boot.guard_production_keys! and ADR 0001 decision 1). The shared
      # passphrase is the one secret an attacker can guess online, so a strength
      # floor bounds brute-force exposure if the login rate limiter is ever
      # bypassed or degraded.
      MIN_LENGTH = 16

      module_function

      # The configured reference passphrase, or nil when unset/blank.
      # @return [String, nil]
      def reference
        v = ENV[ENV_KEY]
        v.nil? || v.empty? ? nil : v
      end

      # Whether a passphrase reference is configured. When false, #verify rejects
      # every attempt (the spec's "passphrase-absent -> reject all").
      # @return [Boolean]
      def configured?
        !reference.nil?
      end

      # Whether the configured reference meets the boot-time strength floor.
      # False when unset — absence is reported separately by the boot guard.
      # @return [Boolean]
      def meets_length_floor?
        ref = reference
        !ref.nil? && ref.length >= MIN_LENGTH
      end

      # Constant-time verification of a submitted passphrase against the reference.
      #
      # Both sides are SHA-256 digested to a fixed length before comparison so the
      # compare is constant-time AND cannot leak the reference length through an
      # early length-mismatch return. Returns false (never raises, never discloses
      # which part failed) for an unset reference or a blank/absent submission.
      #
      # @param submitted [String, nil]
      # @return [Boolean]
      def verify(submitted)
        ref = reference
        return false if ref.nil?
        return false if submitted.nil? || submitted.to_s.empty?

        a = OpenSSL::Digest::SHA256.digest(submitted.to_s)
        b = OpenSSL::Digest::SHA256.digest(ref)
        OpenSSL.fixed_length_secure_compare(a, b)
      end
    end
  end
end
