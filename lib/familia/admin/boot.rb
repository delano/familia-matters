# lib/familia/admin/boot.rb
#
# frozen_string_literal: true
#
# Single source of truth for backend setup. Two explicit entry points:
#
#   setup!(app_root)  — STANDALONE-DEV path. Configures the Familia connection
#                       + encryption, loads the fixture models and the admin
#                       code. Used by config.ru (server), the Rakefile
#                       (seed/token tasks), and try/test_helper.rb so they
#                       share identical configuration — same Valkey target,
#                       same encryption keys, same PASETO key resolution. That
#                       shared state is what lets a token minted by
#                       `rake auth:token` verify against the running server.
#
#   setup_embedded!   — HOST-EMBEDDED path (admin running inside another app's
#                       process, e.g. OneTimeSecret). The HOST owns Familia.uri
#                       and Familia.config.encryption_keys; this path loads the
#                       admin code only and ASSERTS — never sets — Familia
#                       configuration. Overwriting the host's encryption keys
#                       would make `reveal` return garbage on real customer
#                       secrets, the single worst failure available here.
#
# The split is explicit by method name — a host app opts in by calling
# setup_embedded! from its own boot — never inferred from the environment.

require 'familia'

module Familia
  module Admin
    module Boot
      # base64("familia-admin-dev-encryption-key") == exactly 32 bytes.
      # DEV DEFAULT ONLY for Customer#api_secret / ApiKey#secret. Override via
      # FAMILIA_ADMIN_ENCRYPTION_KEY. SEPARATE from the PASETO token key.
      ENCRYPTION_DEV_KEY = 'ZmFtaWxpYS1hZG1pbi1kZXYtZW5jcnlwdGlvbi1rZXk='

      module_function

      # STANDALONE-DEV path: configure the Familia connection + encryption and
      # load all model/admin code. Idempotent: safe to call from both config.ru
      # and rake. Never call this from inside a host app — it writes
      # Familia.uri and the encryption keys, which the host owns. Use
      # setup_embedded! there instead.
      def setup!(app_root)
        guard_production_keys!
        configure_connection!
        configure_encryption!
        load_models!(app_root)
        load_admin!
        true
      end

      # HOST-EMBEDDED path: load the admin code into a process whose Familia
      # configuration (connection URI, encryption keys, key version) the HOST
      # application already owns. Writes none of it. Asserts the encryption
      # configuration exists (keys + key version, via assert_host_encryption!);
      # the connection URI is the host's responsibility but is NOT asserted —
      # Familia initializes Familia.uri to a built-in default at gem load, so
      # an explicit host assignment of that same value is indistinguishable
      # from "never configured". There is no unconfigured state to detect; the
      # try suite proves the URI is never written, which is the property this
      # path can actually guarantee. Does not load the dev fixture models
      # (lib/models.rb is a dev fixture only — the host registers its own
      # Horreum models).
      #
      # guard_production_keys! runs on this path too: the PASETO token key and
      # the shared login passphrase are admin-owned secrets that gate admin
      # access regardless of who configured Familia, and those checks are
      # identical on both paths. FAMILIA_ADMIN_ENCRYPTION_KEY is the one
      # path-aware check: this path never consumes it (configure_encryption!
      # is never called; key material comes from the host and is validated by
      # assert_host_encryption!), so the guard does not demand it here —
      # demanding it would put a dead env var in the host's unit file that
      # reads as live key material. A value explicitly set to the public dev
      # default still refuses: that cannot be real key material and signals a
      # copy-pasted dev environment.
      def setup_embedded!
        guard_production_keys!(embedded: true)
        assert_host_encryption!
        load_admin!
        true
      end

      # Assert — never set — the host's Familia encryption configuration.
      # Fail-closed: booting the admin without host-configured keys would
      # surface as runtime errors on every encrypted-field access (or worse,
      # invite a "configure them here" fix that clobbers the host's keys and
      # corrupts decryption of existing data).
      def assert_host_encryption!
        keys = Familia.config.encryption_keys
        if keys.nil? || keys.empty?
          raise <<~MSG.strip
            Familia::Admin::Boot.setup_embedded! requires the HOST application to have
            already configured Familia.config.encryption_keys and current_key_version.
            It refuses to set them itself: overwriting the host's keys would corrupt
            decryption of existing encrypted fields. Configure Familia in the host boot
            before calling setup_embedded!, or use Boot.setup!(app_root) for the
            standalone dev server.
          MSG
        end

        # Read-only validation of the host's key material/provider; raises
        # Familia::EncryptionError if misconfigured (missing current version,
        # invalid Base64 key, no provider). It writes nothing to Familia.config.
        Familia::Encryption.validate_configuration!
      end

      # Fail-closed in any non-development environment that still carries the
      # dev-default key material. The dev defaults are public constants in this
      # source; booting production with them would let anyone mint admin tokens
      # or decrypt the encrypted fields. Development (no env / 'development')
      # boots unchanged so the rake/rackup dev flow keeps working — a weak
      # passphrase only warns there.
      #
      # auth.rb owns DEV_PASETO_KEY but is only required in load_admin! (after
      # this guard), so require it here to resolve the constant.
      #
      # embedded: the PASETO-key and passphrase checks are identical on both
      # paths (admin-owned secrets, never weaker anywhere). Only the
      # FAMILIA_ADMIN_ENCRYPTION_KEY check is path-aware, because only the
      # standalone path consumes that variable (configure_encryption!). On the
      # embedded path the host owns the data-encryption keys — validated
      # fail-closed by assert_host_encryption! — so an UNSET variable is
      # correct configuration there, not an offense. A variable explicitly set
      # to the public dev default refuses on both paths: it cannot be live key
      # material and signals a copy-pasted dev environment.
      def guard_production_keys!(embedded: false)
        env = ENV['RACK_ENV'] || ENV['APP_ENV'] || 'development'
        require 'familia/admin/passphrase'
        if env == 'development'
          warn_weak_dev_passphrase!
          return
        end

        require 'familia/admin/auth'

        paseto = ENV.fetch('FAMILIA_ADMIN_PASETO_KEY', Familia::Admin::Auth::DEV_PASETO_KEY)
        enc    = embedded ? ENV['FAMILIA_ADMIN_ENCRYPTION_KEY'] : ENV.fetch('FAMILIA_ADMIN_ENCRYPTION_KEY', ENCRYPTION_DEV_KEY)

        offenders = []
        offenders << 'FAMILIA_ADMIN_PASETO_KEY (dev-default PASETO key)' if paseto == Familia::Admin::Auth::DEV_PASETO_KEY
        offenders << 'FAMILIA_ADMIN_ENCRYPTION_KEY (dev-default encryption key)' if enc == ENCRYPTION_DEV_KEY
        # The shared-passphrase login is the browser auth gate; booting non-dev
        # without a reference would leave it permanently reject-all (auth-ui-spec:
        # "passphrase reference absent -> reject all"). Fail closed at boot instead
        # of presenting an unusable login, mirroring the dev-default key guard.
        # A configured-but-short passphrase also refuses: the passphrase is the
        # one online-guessable secret, and the length floor is the defense-in-depth
        # that bounds brute force if the login rate limiter is bypassed or degraded.
        if Familia::Admin::Passphrase.configured?
          unless Familia::Admin::Passphrase.meets_length_floor?
            offenders << "FAMILIA_ADMIN_PASSPHRASE (shorter than the #{Familia::Admin::Passphrase::MIN_LENGTH}-character minimum)"
          end
        else
          offenders << 'FAMILIA_ADMIN_PASSPHRASE (no shared login passphrase set)'
        end
        return if offenders.empty?

        # Name only the offending variables and the remedy that is true for the
        # path being booted: telling an embedded operator to set
        # FAMILIA_ADMIN_ENCRYPTION_KEY "to a real secret" would plant a dead
        # env var in the host's unit file that reads as live key material.
        set_vars = offenders.map { |o| o[/\A\S+/] }
        fixes = []
        if embedded && set_vars.delete('FAMILIA_ADMIN_ENCRYPTION_KEY')
          fixes << 'unset FAMILIA_ADMIN_ENCRYPTION_KEY (the embedded path never reads it; the host owns the data-encryption keys)'
        end
        fixes << "set #{set_vars.join(' and ')} to real secrets" unless set_vars.empty?
        fixes << 'or run with RACK_ENV=development'

        raise <<~MSG.strip
          Refusing to boot in #{env.inspect}: unsafe/missing auth secret(s) for #{offenders.join(' and ')}.
          The dev-default keys are public in the source; the login passphrase gates browser access and
          must be at least #{Familia::Admin::Passphrase::MIN_LENGTH} characters. Remedy: #{fixes.join('; ')}.
        MSG
      end

      # Development is exempt from the strength floor (a throwaway dev passphrase
      # must not block boot), but a quietly weak secret is how one drifts into
      # production — surface it at boot instead.
      def warn_weak_dev_passphrase!
        return unless Familia::Admin::Passphrase.configured?
        return if Familia::Admin::Passphrase.meets_length_floor?

        warn "[familia-admin boot] FAMILIA_ADMIN_PASSPHRASE is shorter than " \
             "#{Familia::Admin::Passphrase::MIN_LENGTH} characters; a non-development boot will refuse it."
      end

      # Standalone-dev only. Never reached from setup_embedded!: the host app
      # owns Familia.uri.
      def configure_connection!
        # Customer/ApiKey live on db 0 (default); Session declares
        # `logical_database 1` in-model and Familia's connection chain routes it.
        Familia.uri = ENV.fetch('FAMILIA_URI', 'redis://127.0.0.1:6379')
      end

      # Standalone-dev only. Never reached from setup_embedded!: the host app
      # owns the encryption keys, and clobbering them breaks decryption of the
      # host's existing encrypted data.
      def configure_encryption!
        Familia.configure do |config|
          config.encryption_keys     = { v1: ENV.fetch('FAMILIA_ADMIN_ENCRYPTION_KEY', ENCRYPTION_DEV_KEY) }
          config.current_key_version = :v1
        end
        # Raises Familia::EncryptionError if misconfigured (empty/invalid key,
        # missing version, or no available provider).
        Familia::Encryption.validate_configuration!
      end

      def load_models!(app_root)
        # Promoted copy at lib/models.rb (the resources/00-assets original is the
        # pristine contract snapshot). The copy adds `feature :transient_fields`
        # to Customer, which the original omits — without it the model raises
        # NoMethodError on `transient_field` under Familia 2.10.1.
        require File.join(app_root, 'lib', 'models')
      end

      def load_admin!
        require 'familia/admin/descriptor'
        require 'familia/admin/api'
        require 'familia/admin/audit_log'
        require 'familia/admin/auth'
        require 'familia/admin/passphrase'
        require 'familia/admin/rate_limit'
        require 'familia/admin/sessions'
      end
    end
  end
end
