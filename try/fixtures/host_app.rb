# frozen_string_literal: true
#
# Fixture for FAMILIA_ADMIN_APP / Boot.setup_host_app! (the HOST-APP path).
#
# It stands in for a real host application (e.g. OneTimeSecret): it OWNS the
# Familia configuration — connection URI, encryption keys, key version — and
# registers its own models, exactly as the host app's boot would. setup_host_app!
# requires this, then runs the embedded path, which must ASSERT this config and
# never overwrite it. The distinctive key version (:hostv1) lets a boot test
# prove the admin did not clobber it.

require 'familia'
require 'base64'

Familia.uri = ENV.fetch('FAMILIA_URI', 'redis://127.0.0.1:6379')
Familia.configure do |config|
  config.encryption_keys     = { hostv1: Base64.strict_encode64('h' * 32) }
  config.current_key_version = :hostv1
end

# A model with an encrypted field, to mirror the case that actually matters for a
# real app: the admin's reveal must decrypt with the HOST's key, so the host's
# key material must survive the admin boot untouched.
class Vault < Familia::Horreum
  feature :encrypted_fields

  identifier_field :vid

  field :vid
  field :label
  encrypted_field :contents
end

class Token < Familia::Horreum
  identifier_field :tid

  field :tid
  field :owner
end
