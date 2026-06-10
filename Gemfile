# frozen_string_literal: true

source 'https://rubygems.org'

# Otto 2.2.0 (published 2026-06) carries the route-level auth wiring and the
# strategy-level AuthorizationFailure -> 403 mapping the auth flow relies on.
gem 'otto', '~> 2.2'

# Familia 2.10.1 is published; fall back to the path checkout only on conflict.
gem 'familia', '~> 2.10'

gem 'paseto'
# paseto 0.4.1 (and Familia's encryption) require 'base64', which Ruby 3.4
# removed from the default gems. Pin it explicitly so the require resolves.
gem 'base64'
gem 'puma', '~> 7'
gem 'rack', '~> 3'
gem 'rackup'
gem 'rake'

group :development, :test do
  gem 'tryouts', '~> 3'
  # In-process Rack harness for the Phase 2 contract test suite (try/*).
  gem 'rack-test', '~> 2.2'
end
