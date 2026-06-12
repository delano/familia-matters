# config/puma.rb
#
# frozen_string_literal: true
#
# Deployment safety: pin the listener to loopback (ticket T1).
#
# With RACK_ENV=production, both `puma` and `rackup` default to binding
# 0.0.0.0 — every interface on the host. Familia Admin is an internal-only
# operator tool whose network perimeter is SSH (operators reach it through
# an SSH tunnel; see README "Deploying to production"). The only legitimate
# listener is loopback, so the bind lives here in config, not in operator
# memory.
#
# The bind host is hardcoded to 127.0.0.1 on purpose. Loopback is not a
# tuning knob: do not add a bind-host env var, and do not read a host from
# the environment. Exposing the admin beyond loopback is an
# architecture change (it would put the destroy/repair/reveal surface behind
# nothing but one shared passphrase), not a configuration edit.
#
# Only the port is env-tunable:
#
#   FAMILIA_ADMIN_PORT   default 9292 (matches the dev rackup default and
#                        the Vite proxy target in vite.config.ts)
#
# Production MUST boot with `bundle exec puma` (which loads this file; the
# systemd unit in the README passes `-C config/puma.rb` explicitly). Do NOT
# use `rackup` in production: rackup feeds its own Host/Port defaults into
# Puma's highest-precedence config layer, which clears this file's bind and
# listens on 0.0.0.0:9292 when RACK_ENV=production (verified against
# rackup 2.3.1 + puma 7.2.1). In development rackup stays fine — its dev
# default host is localhost.

port = Integer(ENV.fetch('FAMILIA_ADMIN_PORT', '9292'), exception: false)
if port.nil? || !port.positive?
  abort "FAMILIA_ADMIN_PORT must be a positive integer " \
        "(got #{ENV['FAMILIA_ADMIN_PORT'].inspect})"
end

bind "tcp://127.0.0.1:#{port}"

environment ENV.fetch('RACK_ENV', 'development')
