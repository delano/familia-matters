# Rakefile
#
# frozen_string_literal: true
#
# Dev harness tasks for familia-admin.
#
#   rake db:seed                 populate demo records so the screens render
#   rake auth:token              mint an admin PASETO (all elevated permissions)
#   rake auth:token:reveal_only  mint a read-only token (NO elevated permissions)
#   rake auth:token:custom[...]  mint a token with explicit sub/permissions
#
# All tasks load the SAME backend bootstrap as config.ru, so the PASETO key and
# encryption keys match the running server and minted tokens verify against it.

require 'rubygems'
require 'bundler/setup'

APP_ROOT = File.expand_path(__dir__)
$LOAD_PATH.unshift(File.join(APP_ROOT, 'lib'))

require 'familia/admin/boot'

# Configure Familia + load models/admin once for every task that touches them.
def boot!
  Familia::Admin::Boot.setup!(APP_ROOT)
end

namespace :db do
  desc 'Seed demo records (idempotent) so the admin screens populate'
  task :seed do
    boot!
    require 'securerandom'

    now = Time.now.to_i

    # --- Customers (db 0): mix of statuses, encrypted secret, every collection,
    # and both indexes (email_lookup unique, status_index multi) ---------------
    customers = [
      { custid: 'cust_alice',   email: 'alice@example.com',   name: 'Alice Adams',    status: 'active' },
      { custid: 'cust_bob',     email: 'bob@example.com',     name: 'Bob Brooks',     status: 'inactive' },
      { custid: 'cust_carol',   email: 'carol@example.com',   name: 'Carol Chen',     status: 'pending' },
      { custid: 'cust_dave',    email: 'dave@example.com',    name: 'Dave Diaz',      status: 'active' },
    ]

    customers.each do |attrs|
      c = Customer.new(attrs[:custid])
      # Scalar fields first, then save: collection/counter writes on a brand-new
      # unsaved parent raise Familia::Problem (orphaned-data guard), so the parent
      # hash must exist before any DataType is touched.
      c.email      = attrs[:email]
      c.name       = attrs[:name]
      c.status     = attrs[:status]
      c.created_at = now
      c.updated_at = now
      c.api_secret = "secret-#{attrs[:custid]}-#{SecureRandom.hex(8)}" # encrypted_field
      c.save

      # Collections (idempotent: clear then repopulate the demo content).
      c.recent_logins.clear
      ["#{now - 3600}", "#{now - 7200}", "#{now - 86_400}"].each { |t| c.recent_logins << t }

      c.feature_flags.clear
      %w[beta_ui audit_v2 streaming].each { |f| c.feature_flags << f }

      c.domains.clear
      c.domains.add("#{attrs[:custid]}.example.com", now)
      c.domains.add("alt-#{attrs[:custid]}.example.net", now - 1000)

      c.metadata['signup_source'] = 'seed'
      c.metadata['plan']          = attrs[:status] == 'active' ? 'pro' : 'free'

      c.login_count.reset
      c.login_count.increment
    end

    # Index maintenance: rebuild the class-level indexes so email_lookup (unique)
    # and status_index (multi) reflect every seeded record. The rebuild methods
    # are named per index (rebuild_<index_name>); there is no rebuild_index(name).
    Customer.rebuild_email_lookup if Customer.respond_to?(:rebuild_email_lookup)
    Customer.rebuild_status_index if Customer.respond_to?(:rebuild_status_index)

    # --- ApiKeys participating in a Customer's :api_keys sorted set ------------
    alice = Customer.new('cust_alice')
    [
      { keyid: 'key_alice_1', label: 'production' },
      { keyid: 'key_alice_2', label: 'ci' },
    ].each do |attrs|
      k = ApiKey.new(attrs[:keyid])
      k.custid       = 'cust_alice'
      k.label        = attrs[:label]
      k.created_at   = now
      k.last_used_at = now
      k.secret       = "apikey-#{attrs[:keyid]}-#{SecureRandom.hex(8)}" # encrypted_field
      k.save
      # participates_in Customer, :api_keys — add to the target's collection.
      alice.api_keys.add(k.keyid, now) if alice.respond_to?(:api_keys)
    end

    # --- Sessions on db 1 (Session declares logical_database 1) ----------------
    [
      { sessid: 'sess_alice_1', custid: 'cust_alice', ip: '203.0.113.10' },
      { sessid: 'sess_bob_1',   custid: 'cust_bob',   ip: '203.0.113.22' },
    ].each do |attrs|
      s = Session.new(attrs[:sessid])
      s.custid     = attrs[:custid]
      s.ip_address = attrs[:ip]
      s.user_agent = 'SeedAgent/1.0'
      s.created_at = now
      s.save
    end

    puts "Seeded #{customers.size} customers, 2 api keys, 2 sessions."
  end
end

namespace :auth do
  # Permissions referenced by routes.txt as elevated (auth=permission:NAME).
  ALL_PERMISSIONS = %w[reveal_secrets repair run_migrations raw_command].freeze

  desc 'Mint an admin PASETO with all elevated permissions; prints the token'
  task :token do
    boot!
    sub = ENV.fetch('SUB', 'admin@familia-admin.dev')
    ttl = ENV.fetch('TTL', '3600').to_i
    token = Familia::Admin::Auth.mint(sub: sub, role: 'admin', permissions: ALL_PERMISSIONS, ttl: ttl)
    puts token
  end

  namespace :token do
    desc 'Mint a reduced-permission admin token (role:admin, NO elevated perms)'
    task :reveal_only do
      boot!
      # Despite the name, this is the read-only gating token: role:admin passes
      # (so all auth=role:admin routes work), but it carries NO elevated
      # permissions, so permission:reveal_secrets / repair / run_migrations /
      # raw_command routes are correctly denied. Used to test the permission gate.
      sub = ENV.fetch('SUB', 'readonly@familia-admin.dev')
      ttl = ENV.fetch('TTL', '3600').to_i
      token = Familia::Admin::Auth.mint(sub: sub, role: 'admin', permissions: [], ttl: ttl)
      puts token
    end

    desc 'Mint a token with explicit role/permissions (PERMS=comma,list SUB=.. ROLE=..)'
    task :custom do
      boot!
      sub   = ENV.fetch('SUB', 'custom@familia-admin.dev')
      role  = ENV.fetch('ROLE', 'admin')
      perms = ENV.fetch('PERMS', '').split(',').map(&:strip).reject(&:empty?)
      ttl   = ENV.fetch('TTL', '3600').to_i
      token = Familia::Admin::Auth.mint(sub: sub, role: role, permissions: perms, ttl: ttl)
      puts token
    end
  end
end
