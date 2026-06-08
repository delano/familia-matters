# lib/familia/admin/boot.rb
#
# frozen_string_literal: true
#
# Single source of truth for backend setup: Familia connection + encryption,
# the fixture models, and the admin code. Both config.ru (server) and the
# Rakefile (seed/token tasks) require this so they share identical configuration
# — same Valkey target, same encryption keys, same PASETO key resolution. That
# shared state is what lets a token minted by `rake auth:token` verify against
# the running server.

require 'familia'

module Familia
  module Admin
    module Boot
      # base64("familia-admin-dev-encryption-key") == exactly 32 bytes.
      # DEV DEFAULT ONLY for Customer#api_secret / ApiKey#secret. Override via
      # FAMILIA_ADMIN_ENCRYPTION_KEY. SEPARATE from the PASETO token key.
      ENCRYPTION_DEV_KEY = 'ZmFtaWxpYS1hZG1pbi1kZXYtZW5jcnlwdGlvbi1rZXk='

      module_function

      # Configure the Familia connection + encryption and load all model/admin
      # code. Idempotent: safe to call from both config.ru and rake.
      def setup!(app_root)
        configure_connection!
        configure_encryption!
        load_models!(app_root)
        load_admin!
        true
      end

      def configure_connection!
        # Customer/ApiKey live on db 0 (default); Session declares
        # `logical_database 1` in-model and Familia's connection chain routes it.
        Familia.uri = ENV.fetch('FAMILIA_URI', 'redis://127.0.0.1:6379')
      end

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
      end
    end
  end
end
