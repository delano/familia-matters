# frozen_string_literal: true

source 'https://rubygems.org'

# Ruby 3.2+ so the admin can be integrated with Familia and Otto.
ruby '>= 3.2'

# Familia — the Ruby object layer over Redis/Valkey this admin reflects and
# operates on. Pinned to the version the descriptor/API were verified against.
gem 'familia', '2.10.1'

# Otto — the routing + controller framework that serves the admin HTTP/MCP API
# from the plain-text `routes` file.
gem 'otto', '2.1.0'

# Rack 3 (+ rackup CLI) for the streaming response bodies used by the live
# command feed and the repair progress stream.
gem 'rack', '>= 3.0'
gem 'rackup', '>= 2.1'

# Application server. Puma serves Rack 3 streaming bodies with chunked flushing.
gem 'puma', '~> 6.4'

group :development, :test do
  # Tryouts — the contract test runner. fixtures/*.json are asserted against
  # live responses in try/.
  gem 'tryouts', '~> 3.7'
  gem 'rake', '~> 13.0'
  gem 'rack-test', '~> 2.1'
end
