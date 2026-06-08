# frozen_string_literal: true

require 'familia'
require 'familia/migration'
require 'securerandom'
require 'base64'

module Familia
  module Admin
    # Boot configures the Familia runtime the admin operates on: the Redis/Valkey
    # connection, the encryption keys that back encrypted_field, and the set of
    # models to reflect. It is deliberately ENV-driven so the same code boots a
    # dev box, a test run (isolated logical DB), or production.
    #
    #   ENV['FAMILIA_URI']             redis URI (default redis://127.0.0.1:6379/0)
    #   ENV['FAMILIA_ENCRYPTION_KEY']  base64 of 32 bytes for the current key version
    #   ENV['FAMILIA_KEY_VERSION']     symbol name for the current key (default v1)
    #   ENV['ADMIN_MODELS']            path to the models file to load
    #
    # Security: in production the encryption key MUST come from the environment.
    # A deterministic development key is only used when none is provided AND
    # RACK_ENV is not 'production' — and it logs a loud warning.
    module Boot
      module_function

      DEFAULT_URI = 'redis://127.0.0.1:6379/0'
      # A fixed, obviously-not-secret development key (base64 of 32 bytes).
      DEV_KEY = Base64.strict_encode64('familia-admin-dev-key-not-secret').freeze

      def boot!(uri: nil, models_path: nil, encryption_key: nil, key_version: nil, migrations_path: nil)
        configure_connection(uri)
        configure_encryption(encryption_key, key_version)
        load_models(models_path)
        load_migrations(migrations_path)
        self
      end

      def configure_connection(uri)
        Familia.uri = uri || ENV['FAMILIA_URI'] || ENV['REDIS_URL'] || DEFAULT_URI
      end

      def configure_encryption(key, version)
        key     ||= ENV['FAMILIA_ENCRYPTION_KEY']
        version ||= (ENV['FAMILIA_KEY_VERSION'] || 'v1')
        vsym = version.to_sym

        if key.nil? || key.empty?
          if production?
            raise 'FAMILIA_ENCRYPTION_KEY is required in production (base64 of 32 bytes)'
          end
          warn '[familia-admin] WARNING: using an insecure development encryption key. ' \
               'Set FAMILIA_ENCRYPTION_KEY (base64 of 32 bytes) for any real data.'
          key = DEV_KEY
        end

        Familia.config.encryption_keys    = { vsym => key }
        Familia.config.current_key_version = vsym
      end

      # Load the model classes the admin reflects. Idempotent: re-loading the
      # same path simply redefines the constants.
      def load_models(path)
        path ||= ENV['ADMIN_MODELS'] || File.expand_path('../../../examples/models.rb', __dir__)
        return unless File.exist?(path)

        load path
      end

      # Load demo/app migration classes (they auto-register via Base.inherited).
      def load_migrations(path)
        path ||= ENV['ADMIN_MIGRATIONS'] || File.expand_path('../../../examples/migrations.rb', __dir__)
        return unless File.exist?(path)

        load path
      end

      def production?
        %w[production prod].include?(ENV['RACK_ENV'].to_s.downcase)
      end
    end
  end
end
