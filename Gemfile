# frozen_string_literal: true

source 'https://rubygems.org'

ruby '>= 3.2'

# Core runtime: the object layer, the web framework, and Rack 3 (streaming bodies).
gem 'familia', '~> 2.10', '>= 2.10.1'
gem 'otto',    '~> 2.1'
gem 'rack',    '~> 3.0'

group :development, :test do
  gem 'rackup',   '~> 2.1' # `rackup`/WEBrick for local boot of config.ru
  gem 'tryouts',  '~> 3.7' # the contract + security test suite lives in try/
end
