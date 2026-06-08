# frozen_string_literal: true

module Familia
  module Admin
    # Seeds a representative dataset for the demo and the contract tests: the
    # canonical Customer/ApiKey records, one of every collection type on a focus
    # customer, an encrypted secret, and (optionally) deliberate integrity drift
    # so the audit console has phantoms/missing/stale entries to surface.
    #
    # Assumes Boot.boot! already ran. Idempotent (uses upserting saves).
    module Seed
      module_function

      CUSTOMERS = [
        { custid: 'cust_8f2a91', email: 'alice@example.com', name: 'Alice Ng',      status: 'active',   created_at: 1_730_419_200, updated_at: 1_748_736_000 },
        { custid: 'cust_4410bd', email: 'bob@example.com',   name: 'Bob Tran',      status: 'pending',  created_at: 1_733_011_200, updated_at: 1_733_011_200 },
        { custid: 'cust_2200ee', email: 'erin@example.com',  name: 'Erin Diaz',     status: 'inactive', created_at: 1_727_740_800, updated_at: 1_746_057_600 },
        { custid: 'cust_91ab3c', email: 'carla@northwind.io', name: 'Carla Okonkwo', status: 'active',  created_at: 1_747_785_600, updated_at: 1_748_649_600 },
      ].freeze

      def run!(drift: true)
        records!
        collections!
        api_keys!
        inject_drift! if drift
        self
      end

      def records!
        CUSTOMERS.each do |attrs|
          c = Customer.new(**attrs)
          c.api_secret = "sk_live_#{attrs[:custid].sub('cust_', '')}f4a0c7e1"
          c.save
        end
      end

      def collections!
        c = Customer.find_by_identifier('cust_8f2a91')
        return unless c

        reset_collections(c)
        c.recent_logins << '203.0.113.10' << '198.51.100.24' << '192.0.2.77'
        %w[beta_dashboard api_v2 sso_okta audit_export].each { |f| c.feature_flags.add(f) }
        { 'example.com' => 1_730_419_200, 'alice.dev' => 1_733_097_600, 'ng.consulting' => 1_744_761_600 }
          .each { |m, s| c.domains.add(m, s) }
        { 'signup_source' => 'referral', 'plan' => 'team', 'region' => 'eu-west' }
          .each { |k, v| c.metadata[k] = v }
        c.login_count.value = 318 if c.login_count.value.to_i.zero?
      end

      def api_keys!
        k = ApiKey.new(keyid: 'key_77c3', custid: 'cust_8f2a91', label: 'CI deploy token',
                       created_at: 1_738_368_000, last_used_at: 1_748_908_800)
        k.secret = 'sk_key_77c3_secret'
        k.save
        cust = Customer.find_by_identifier('cust_8f2a91')
        safe { cust.api_keys.add('key_77c3', 1_738_368_000) } if cust.respond_to?(:api_keys)
      end

      # Introduce one of several drift types so the integrity report is unhealthy:
      #   phantoms        — ids in the instances timeline with no object hash
      #   missing         — object hashes not in the timeline
      #   stale unique    — an index entry whose field value no longer matches
      #   missing unique  — a live record whose index entry was removed
      def inject_drift!
        db = Familia.dbclient
        # phantoms (ids in the timeline with no object hash)
        %w[cust_legacy_01 cust_legacy_02].each { |id| Customer.instances.add(id, Familia.now) }
        # missing: a real object hash that is absent from the instances timeline
        ghost = Customer.new(custid: 'cust_9931', email: 'ghost@example.com', name: 'Ghost', status: 'active',
                             created_at: Familia.now.to_i, updated_at: Familia.now.to_i)
        ghost.save
        safe { Customer.instances.remove('cust_9931') }
        # stale unique index entry (points at bob, but value mismatches his email)
        safe { Customer.email_lookup['bob@old.example'] = 'cust_4410bd' }
        # missing unique index (erin exists but her entry was removed)
        safe { db.hdel(Customer.email_lookup.dbkey, 'erin@example.com') }
        self
      end

      def reset_collections(c)
        %i[recent_logins feature_flags domains metadata login_count].each do |name|
          safe { c.send(name).clear if c.send(name).respond_to?(:clear) }
        end
      end

      def safe
        yield
      rescue StandardError
        nil
      end
    end
  end
end
