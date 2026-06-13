# examples/onetimesecret-config.ru
#
# frozen_string_literal: true
#
# Sample rackup/puma config for running Familia Admin against a REAL host
# application (here: OneTimeSecret). Copy it, edit the two env placeholders, and
# boot it. Production must boot with puma, never rackup — see the admin README
# "Deploying to production".
#
# IMPORTANT: run this UNDER THE HOST APP'S BUNDLE so Familia/Otto and the app's
# other dependencies resolve to the host's versions, not the admin's:
#
#   FAMILIA_ADMIN_ROOT=/path/to/familia-admin \
#   ONETIME_APP=/path/to/onetimesecret/lib/onetime \
#   FAMILIA_ADMIN_PASSPHRASE='your shared admin passphrase' \
#   FAMILIA_ADMIN_PASETO_KEY=<base64url 32-byte key> \
#   BUNDLE_GEMFILE=/path/to/onetimesecret/Gemfile \
#     bundle exec puma -C /path/to/familia-admin/config/puma.rb \
#                      /path/to/familia-admin/examples/onetimesecret-config.ru
#
# The admin's own code (its lib/) and its gems (otto, paseto, rack) must be
# available in that bundle — add familia-admin as a dependency of the host app,
# or keep the admin's lib on $LOAD_PATH with its gems installed.

require 'rubygems'
require 'bundler/setup'

# --- 1. Put the admin's code on the load path -------------------------------
ADMIN_ROOT = ENV.fetch('FAMILIA_ADMIN_ROOT') # absolute path to the admin checkout
$LOAD_PATH.unshift(File.join(ADMIN_ROOT, 'lib'))

# --- 2. Load the host application -------------------------------------------
# Requiring OneTimeSecret boots its Familia configuration (connection URI,
# encryption keys, key version) and registers its Horreum models. Point this at
# the file that does so — its model/config load path, NOT its web-server entry
# (you do not want to start OTS's own Puma here).
require ENV.fetch('ONETIME_APP', '/path/to/onetimesecret/lib/onetime')

# --- 3. Mount the admin over the host's already-configured Familia ----------
# setup_embedded! ASSERTS the host's Familia config and never overwrites it, so
# OneTimeSecret's own keys decrypt its real secrets and the admin cannot clobber
# live key material. Boot.setup_host_app!(ENV['ONETIME_APP']) is the one-call
# equivalent of step 2 + this line (require the target, then run the embedded
# path) — it is what config.ru uses when FAMILIA_ADMIN_APP is set.
require 'familia/admin/boot'
Familia::Admin::Boot.setup_embedded!

require 'familia/admin/rack_app'
run Familia::Admin::RackApp.build(ADMIN_ROOT)
