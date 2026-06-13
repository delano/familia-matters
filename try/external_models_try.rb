# try/external_models_try.rb
#
# EXTERNAL MODELS domain — SPECIFIES "admin my own application's models".
#
# The admin reflects whatever Horreum models are loaded (Descriptor.models ==
# Familia.members), so pointing a standalone boot at YOUR models is the whole
# feature — no per-model or frontend code. Two explicit entry points, both
# asserted in FRESH SUBPROCESSES: Familia.members is process-global, so a
# subprocess is the only honest way to prove a boot reflects the external models
# and NOT the demo fixtures this test process already loaded via test_helper.
#
#   FAMILIA_ADMIN_MODELS -> Boot.setup! loads operator model FILES (the admin
#                           owns the connection + encryption).
#   FAMILIA_ADMIN_APP    -> Boot.setup_host_app! requires an app that owns the
#                           Familia config + registers its own models, then runs
#                           the embedded path (asserts host config, never clobbers).

require_relative 'test_helper'
require 'open3'
require 'json'

APP_DIR           = File.expand_path('..', __dir__) unless defined?(APP_DIR)
FIXTURES          = File.join(APP_DIR, 'try', 'fixtures')
STANDALONE_MODELS = File.join(FIXTURES, 'standalone_models.rb')
HOST_APP          = File.join(FIXTURES, 'host_app.rb')

# Run a boot snippet in a fresh subprocess; returns [exitstatus, stdout]. Boot
# warnings go to stderr, so stdout is the snippet's JSON report verbatim.
def boot_run(snippet, overrides = {})
  script = "$LOAD_PATH.unshift(File.join('#{APP_DIR}', 'lib')); " \
           "require 'json'; require 'familia/admin/boot'; #{snippet}"
  env = {
    'RACK_ENV' => 'development',
    'FAMILIA_ADMIN_PASSPHRASE' => 'a-real-shared-passphrase-here',
    'FAMILIA_ADMIN_MODELS' => nil,
    'FAMILIA_ADMIN_APP' => nil,
    'FAMILIA_ADMIN_ENCRYPTION_KEY' => nil,
    'APP_DIR' => APP_DIR,
  }.merge(overrides)
  out, _err, status = Open3.capture3(env, 'bundle', 'exec', 'ruby', '-e', script, chdir: APP_DIR)
  [status.exitstatus, out]
end

def report(out)
  JSON.parse(out.to_s.lines.last.to_s)
rescue StandardError
  {}
end

# --- FAMILIA_ADMIN_MODELS: standalone, admin-owned config, model-only source ---
STANDALONE_SNIPPET = <<~'RUBY'
  Familia::Admin::Boot.setup!(ENV['APP_DIR'])
  w = Widget.new('w_try'); w.name = 'Sprocket'; w.color = 'red'; w.save
  loaded = Widget.find_by_identifier('w_try')
  names = Familia::Admin::Descriptor.app[:models].map { |m| m[:model] }
  puts JSON.generate('models' => names, 'roundtrip' => (loaded && loaded.name))
RUBY
@standalone_exit, standalone_out = boot_run(STANDALONE_SNIPPET, 'FAMILIA_ADMIN_MODELS' => STANDALONE_MODELS)
@standalone = report(standalone_out)

# --- FAMILIA_ADMIN_APP: host app owns the Familia config + registers models ---
HOSTAPP_SNIPPET = <<~'RUBY'
  Familia::Admin::Boot.setup_host_app!(ENV['HOST_APP'])
  names = Familia::Admin::Descriptor.app[:models].map { |m| m[:model] }
  puts JSON.generate(
    'models' => names,
    'key_version' => Familia.config.current_key_version.to_s,
    'customer_absent' => !defined?(Customer),
  )
RUBY
@hostapp_exit, hostapp_out = boot_run(HOSTAPP_SNIPPET, 'HOST_APP' => HOST_APP)
@hostapp = report(hostapp_out)

# --- a model spec that matches nothing must fail the boot with a clear error ---
@missing_exit, = boot_run("Familia::Admin::Boot.setup!(ENV['APP_DIR']); puts 'BOOTED'",
                          'FAMILIA_ADMIN_MODELS' => File.join(FIXTURES, 'does_not_exist_*.rb'))

## FAMILIA_ADMIN_MODELS: a standalone boot reflects the operator's models
## (alongside the admin's own audit_log model, as the demo boot does too)
@standalone['models']
#==> _.include?('widget')

## ...and NOT the bundled demo fixtures (Customer/Session/ApiKey)
@standalone['models'].include?('customer')
#=> false

## the admin-owned connection works against the external model (data round-trips)
@standalone['roundtrip']
#=> 'Sprocket'

## the standalone external-models boot exits clean
@standalone_exit
#=> 0

## FAMILIA_ADMIN_APP: setup_host_app! reflects the host app's own models
@hostapp['models']
#==> _.include?('vault') && _.include?('token')

## the host app's encryption key version survives the admin boot UNTOUCHED
@hostapp['key_version']
#=> 'hostv1'

## the demo fixtures are never loaded on the host-app path
@hostapp['customer_absent']
#=> true

## the host-app boot exits clean
@hostapp_exit
#=> 0

## a FAMILIA_ADMIN_MODELS spec that matches nothing fails the boot (clear error)
@missing_exit != 0
#=> true
