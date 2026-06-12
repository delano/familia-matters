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
# rack_env nil = genuinely unset (the env-resolution cases below need both
# RACK_ENV and APP_ENV absent in the child).
def boot_exit(rack_env, overrides = {})
  script = "$LOAD_PATH.unshift(File.join('#{APP_DIR}','lib')); " \
           "require 'familia/admin/boot'; " \
           "Familia::Admin::Boot.setup!('#{APP_DIR}')"
  # Strip any inherited overrides so the dev defaults are genuinely in use, then
  # apply per-case overrides (real keys / passphrase) on top.
  env = {
    'RACK_ENV' => rack_env,
    'APP_ENV' => nil,
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

def embedded_env(rack_env, overrides, preconfigure)
  {
    'RACK_ENV' => rack_env,
    'APP_ENV' => nil,
    'FAMILIA_ADMIN_PASETO_KEY' => nil,
    'FAMILIA_ADMIN_ENCRYPTION_KEY' => nil,
    'FAMILIA_ADMIN_PASSPHRASE' => nil,
    'TRY_HOST_PRECONFIG' => preconfigure ? '1' : '0',
  }.merge(overrides)
end

def embedded_exit(rack_env, overrides = {}, preconfigure: true)
  env = embedded_env(rack_env, overrides, preconfigure)
  system(env, 'bundle', 'exec', 'ruby', '-e', EMBEDDED_SNIPPET, chdir: APP_DIR, out: File::NULL, err: File::NULL)
  $?.exitstatus
end

# Like embedded_exit but returns [exitstatus, stderr] — for the cases that
# assert what the boot SAYS (the unused-variable warning), not just whether
# it booted.
require 'open3'
def embedded_capture(rack_env, overrides = {}, preconfigure: true)
  env = embedded_env(rack_env, overrides, preconfigure)
  _out, err, status = Open3.capture3(env, 'bundle', 'exec', 'ruby', '-e', EMBEDDED_SNIPPET, chdir: APP_DIR)
  [status.exitstatus, err]
end

@emb_dev_preconfigured  = embedded_exit('development')
@emb_dev_unconfigured   = embedded_exit('development', preconfigure: false)
# Guard parity: the dev-default-secrets refusal applies to the embedded path
# too (PASETO key + passphrase gate admin access regardless of who owns
# Familia config).
@emb_prod_devdefaults   = embedded_exit('production')
@emb_prod_realkeys_pass = embedded_exit('production', REAL_KEYS.merge('FAMILIA_ADMIN_PASSPHRASE' => 'a-real-shared-passphrase'))

# FAMILIA_ADMIN_ENCRYPTION_KEY path-awareness: the embedded path never consumes
# the variable (key material comes from the host, asserted fail-closed), so the
# guard must not demand it there -- but an explicitly dev-default value must
# still refuse (copy-pasted dev env tripwire), and the standalone path, which
# DOES consume it, must keep demanding it.
REAL_PASETO_AND_PASS = {
  'FAMILIA_ADMIN_PASETO_KEY' => REAL_KEYS['FAMILIA_ADMIN_PASETO_KEY'],
  'FAMILIA_ADMIN_PASSPHRASE' => 'a-real-shared-passphrase',
}.freeze
@emb_prod_no_enc_var         = embedded_exit('production', REAL_PASETO_AND_PASS)
@emb_prod_devdefault_enc_var = embedded_exit('production', REAL_PASETO_AND_PASS.merge(
  'FAMILIA_ADMIN_ENCRYPTION_KEY' => Familia::Admin::Boot::ENCRYPTION_DEV_KEY,
))
@prod_no_enc_var             = boot_exit('production', REAL_PASETO_AND_PASS)

# Env resolution is path-aware (round 3): with neither RACK_ENV nor APP_ENV
# set, the standalone path keeps its historical development default (the
# no-env rake/rackup dev flow, T2 AC2), while the embedded path treats the
# env as unresolved and runs the full guard — a misconfigured production
# host must not skip the guard onto the public dev PASETO key.
@standalone_noenv        = boot_exit(nil)
@emb_noenv_devdefaults   = embedded_exit(nil)
@emb_noenv_realsecrets   = embedded_exit(nil, REAL_PASETO_AND_PASS)

# FAMILIA_ADMIN_ENCRYPTION_KEY set to a REAL (non-dev-default) value on the
# embedded path is never consumed; without a warning an operator who
# "rotates" it would believe they changed live key material (round 3).
@emb_warn_status, @emb_warn_stderr = embedded_capture('development', {
  'FAMILIA_ADMIN_ENCRYPTION_KEY' => REAL_KEYS['FAMILIA_ADMIN_ENCRYPTION_KEY'],
})
@emb_nowarn_status, @emb_nowarn_stderr = embedded_capture('development')

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

## embedded production boot with FAMILIA_ADMIN_ENCRYPTION_KEY UNSET boots clean:
## the embedded path never consumes that variable (the host owns the data
## encryption keys), so the guard must not demand a dead env var
@emb_prod_no_enc_var
#=> 0

## embedded production boot with FAMILIA_ADMIN_ENCRYPTION_KEY explicitly set to
## the public dev default still refuses (copy-pasted dev env tripwire)
@emb_prod_devdefault_enc_var != 0
#=> true

## standalone production boot with FAMILIA_ADMIN_ENCRYPTION_KEY unset still
## refuses: the standalone path consumes that variable (configure_encryption!),
## so demanding it there remains correct
@prod_no_enc_var != 0
#=> true

## standalone boot with NEITHER RACK_ENV nor APP_ENV set keeps the historical
## development default and boots (the no-env rake/rackup dev flow, T2 AC2)
@standalone_noenv
#=> 0

## embedded boot with NEITHER RACK_ENV nor APP_ENV set FAILS CLOSED on
## dev-default secrets: an env-less host process is misconfigured, not
## development, and must not skip the guard onto the public dev PASETO key
@emb_noenv_devdefaults != 0
#=> true

## embedded boot with no env but REAL admin secrets and host-configured
## Familia boots clean: the env-less default is "run the full guard",
## not a hard refusal
@emb_noenv_realsecrets
#=> 0

## a real (non-dev-default) FAMILIA_ADMIN_ENCRYPTION_KEY on the embedded path
## still boots (it is not the dev default) but draws a boot-time warning --
## the variable is never consumed there, and silence would let an operator
## believe a "rotation" changed live key material
[@emb_warn_status, @emb_warn_stderr.include?('FAMILIA_ADMIN_ENCRYPTION_KEY is set but the embedded')]
#=> [0, true]

## with the variable unset, the embedded boot emits no such warning
[@emb_nowarn_status, @emb_nowarn_stderr.include?('FAMILIA_ADMIN_ENCRYPTION_KEY')]
#=> [0, false]
