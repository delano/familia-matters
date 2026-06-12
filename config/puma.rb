# frozen_string_literal: true
#
# config/puma.rb
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
# systemd unit in the README passes `-C` explicitly). Do NOT use `rackup`
# in production: rackup feeds its own Host/Port defaults into Puma's
# highest-precedence config layer, which clears this file's bind and
# listens on 0.0.0.0:9292 when RACK_ENV=production (verified against
# rackup 2.3.1 + puma 7.2.1). In development rackup stays fine — its dev
# default host is localhost.

# Enforce the puma-not-rackup rule rather than leaving it procedural.
# rackup's puma handler still loads this file before clobbering its bind,
# so a production boot via rackup dies here with a targeted error instead
# of silently listening on 0.0.0.0. (Rackup::Server is only defined when
# the rackup executable is driving the boot.)
if ENV.fetch('RACK_ENV', 'development') == 'production' && defined?(::Rackup::Server)
  abort 'Familia Admin must boot via `bundle exec puma` in production, never ' \
        'rackup: rackup overrides the loopback bind in config/puma.rb and ' \
        'would listen on 0.0.0.0. See README "Deploying to production".'
end

# Base 10 keeps Integer() from accepting hex/octal spellings like '0x10';
# the range check rejects ports TCP cannot bind (puma would otherwise fail
# later with a less targeted error).
port = Integer(ENV.fetch('FAMILIA_ADMIN_PORT', '9292'), 10, exception: false)
unless port && (1..65_535).cover?(port)
  abort 'FAMILIA_ADMIN_PORT must be an integer between 1 and 65535 ' \
        "(got #{ENV['FAMILIA_ADMIN_PORT'].inspect})"
end

bind "tcp://127.0.0.1:#{port}"

environment ENV.fetch('RACK_ENV', 'development')
