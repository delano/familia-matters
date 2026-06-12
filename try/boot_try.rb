# try/boot_try.rb
#
# BOOT domain -- SPECIFIES bug #7: fail-closed in production with dev-default keys.
#
# When RACK_ENV != development AND the dev-default PASETO/encryption keys are in
# use, Boot.setup! MUST refuse (raise / nonzero exit). This is asserted via a
# SUBPROCESS because the test process itself already booted with the dev keys --
# a guard cannot be retro-applied in-process.
#
# RED now: boot.rb has no environment guard, so the production subprocess boots
# clean (exit 0). When the fixer adds the guard, the production exit becomes
# nonzero and this flips green. The development subprocess must stay exit 0
# (the dev defaults are fine in development).
#
# T2 (issue #20) adds the HOST-EMBEDDED path: Boot.setup_embedded! must load
# admin code without touching the host's Familia configuration. Also asserted
# via subprocesses, each of which pre-configures Familia AS THE HOST APP WOULD
# (uri + encryption keys + key version), boots embedded, then exits nonzero if
# any of that configuration changed.

require_relative 'test_helper'

APP_DIR = File.expand_path('..', __dir__)

# Run `Boot.setup!` in a fresh Ruby subprocess under a given RACK_ENV, with the
# dev-default keys (i.e. no FAMILIA_ADMIN_PASETO_KEY / _ENCRYPTION_KEY override).
# Returns the child's exit status (0 = booted clean, nonzero = refused/raised).
def boot_exit(rack_env, overrides = {})
  script = "$LOAD_PATH.unshift(File.join('#{APP_DIR}','lib')); " \
           "require 'familia/admin/boot'; " \
           "Familia::Admin::Boot.setup!('#{APP_DIR}')"
  # Strip any inherited overrides so the dev defaults are genuinely in use, then
  # apply per-case overrides (real keys / passphrase) on top.
  env = {
    'RACK_ENV' => rack_env,
    'FAMILIA_ADMIN_PASETO_KEY' => nil,
    'FAMILIA_ADMIN_ENCRYPTION_KEY' => nil,
    'FAMILIA_ADMIN_PASSPHRASE' => nil,
  }.merge(overrides)
  system(env, 'bundle', 'exec', 'ruby', '-e', script, chdir: APP_DIR, out: File::NULL, err: File::NULL)
  $?.exitstatus
end

require 'base64'
require 'securerandom'
# Real (non-dev-default), validation-passing key material for the passphrase-guard
# cases below: a 32-byte AES key and a 32-byte v2.local key, both clearly distinct
# from the public dev defaults so only the passphrase governs the outcome.
REAL_KEYS = {
  'FAMILIA_ADMIN_PASETO_KEY' => Base64.urlsafe_encode64(SecureRandom.bytes(32), padding: false),
  'FAMILIA_ADMIN_ENCRYPTION_KEY' => Base64.strict_encode64(SecureRandom.bytes(32)),
}.freeze

@prod_exit = boot_exit('production')
@dev_exit  = boot_exit('development')
# Passphrase guard: real keys, so only the passphrase decides.
@prod_realkeys_nopass = boot_exit('production', REAL_KEYS)
@prod_realkeys_pass   = boot_exit('production', REAL_KEYS.merge('FAMILIA_ADMIN_PASSPHRASE' => 'a-real-shared-passphrase'))
# Strength floor (issue #10): a configured-but-short passphrase must refuse in
# production ('short' < Passphrase::MIN_LENGTH) but only warn in development.
@prod_realkeys_shortpass = boot_exit('production', REAL_KEYS.merge('FAMILIA_ADMIN_PASSPHRASE' => 'short'))
@dev_shortpass           = boot_exit('development', 'FAMILIA_ADMIN_PASSPHRASE' => 'short')

# ---------------------------------------------------------------------------
# T2 (issue #20): HOST-EMBEDDED path. Each subprocess below configures Familia
# AS THE HOST APP WOULD (distinctive uri with /3 db suffix, its own encryption
# keys + key version), calls Boot.setup_embedded!, then exits with a distinct
# nonzero code if any host configuration changed or the dev fixture models got
# loaded. Exit 0 = booted clean, host configuration survived untouched.
# TRY_HOST_PRECONFIG=0 skips the host configuration step, to prove the
# embedded path fails closed when the host never configured encryption.
# ---------------------------------------------------------------------------
EMBEDDED_SNIPPET = <<~RUBY.freeze
  $LOAD_PATH.unshift(File.join('#{APP_DIR}', 'lib'))
  require 'familia'
  require 'base64'
  host_keys = { vhost: Base64.strict_encode64('h' * 32) }
  if ENV['TRY_HOST_PRECONFIG'] == '1'
    Familia.uri = 'redis://127.0.0.1:6379/3'
    Familia.config.encryption_keys     = host_keys.dup
    Familia.config.current_key_version = :vhost
  end
  require 'familia/admin/boot'
  Familia::Admin::Boot.setup_embedded!
  exit 10 unless Familia.config.encryption_keys == host_keys
  exit 11 unless Familia.config.current_key_version == :vhost
  exit 12 unless Familia.uri.to_s.include?('/3')
  exit 13 if defined?(Customer)
RUBY

def embedded_exit(rack_env, overrides = {}, preconfigure: true)
  env = {
    'RACK_ENV' => rack_env,
    'FAMILIA_ADMIN_PASETO_KEY' => nil,
    'FAMILIA_ADMIN_ENCRYPTION_KEY' => nil,
    'FAMILIA_ADMIN_PASSPHRASE' => nil,
    'TRY_HOST_PRECONFIG' => preconfigure ? '1' : '0',
  }.merge(overrides)
  system(env, 'bundle', 'exec', 'ruby', '-e', EMBEDDED_SNIPPET, chdir: APP_DIR, out: File::NULL, err: File::NULL)
  $?.exitstatus
end

@emb_dev_preconfigured  = embedded_exit('development')
@emb_dev_unconfigured   = embedded_exit('development', preconfigure: false)
# Guard parity: the dev-default-secrets refusal applies to the embedded path
# too (PASETO key + passphrase gate admin access regardless of who owns
# Familia config).
@emb_prod_devdefaults   = embedded_exit('production')
@emb_prod_realkeys_pass = embedded_exit('production', REAL_KEYS.merge('FAMILIA_ADMIN_PASSPHRASE' => 'a-real-shared-passphrase'))

## BUG #7: production boot with dev-default keys must FAIL (nonzero exit)
@prod_exit != 0
#=> true

## development boot with the same dev-default keys succeeds (exit 0)
@dev_exit
#=> 0

## the two environments diverge: dev boots, production refuses (bug #7)
[@dev_exit.zero?, @prod_exit.zero?]
#=> [true, false]

## production with REAL keys but NO passphrase still fails closed (passphrase guard)
@prod_realkeys_nopass != 0
#=> true

## production with real keys AND a shared passphrase boots (guard satisfied)
@prod_realkeys_pass
#=> 0

## production with a passphrase BELOW the strength floor fails closed (issue #10)
@prod_realkeys_shortpass != 0
#=> true

## development with the same short passphrase boots (warn-only, never blocks dev)
@dev_shortpass
#=> 0

## T2 AC1: a pre-configured Familia.config.encryption_keys (and key version,
## and uri) survives the embedded admin boot untouched, and the dev fixture
## models are not loaded (exit 10-13 name the clobbered piece; 0 = untouched)
@emb_dev_preconfigured
#=> 0

## embedded boot FAILS CLOSED when the host never configured encryption keys
## (setup_embedded! asserts host configuration instead of supplying its own)
@emb_dev_unconfigured != 0
#=> true

## guard_production_keys! runs unchanged on the embedded path: production with
## dev-default admin secrets refuses even when the host configured Familia
@emb_prod_devdefaults != 0
#=> true

## production embedded boot with real admin secrets AND host-configured Familia
## boots clean -- and the host configuration still survives untouched
@emb_prod_realkeys_pass
#=> 0
