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
