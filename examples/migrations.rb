# frozen_string_literal: true
#
# Demo migrations for the Customer model. Real Familia::Migration::Base
# subclasses — they auto-register with Familia::Migration.migrations when this
# file is loaded, and are driven by the real Runner/Registry. They are written
# to be idempotent and safe (each migration_needed? checks live state), so
# running them against already-migrated data reports :skipped rather than
# corrupting records.

require 'familia/migration'

# 20260101 — Add the status field to Customer (default 'pending').
class AddStatusField < Familia::Migration::Base
  self.migration_id = '20260101_add_status_field'
  self.description = 'Add status to Customer'

  def migration_needed?
    Customer.instances.members.any? do |id|
      v = dbclient.hget(Customer.dbkey(id), 'status')
      v.nil? || v.empty?
    end
  end

  def migrate
    Customer.instances.members.each do |id|
      key = Customer.dbkey(id)
      next unless (dbclient.hget(key, 'status')).to_s.empty?

      for_realsies_this_time? { dbclient.hset(key, 'status', 'pending') }
      track_stat(:records_updated)
    end
  end

  def down
    Customer.instances.members.each do |id|
      for_realsies_this_time? { dbclient.hdel(Customer.dbkey(id), 'status') }
    end
  end
end

# 20260318 — Backfill Customer#login_count (not reversible).
class BackfillLoginCount < Familia::Migration::Base
  self.migration_id = '20260318_backfill_login_count'
  self.description = 'Backfill Customer#login_count from event log'

  def migration_needed?
    Customer.instances.members.any? { |id| dbclient.exists(counter_key(id)).zero? }
  end

  def migrate
    Customer.instances.members.each do |id|
      next unless dbclient.exists(counter_key(id)).zero?

      for_realsies_this_time? { dbclient.set(counter_key(id), 0) }
      track_stat(:counters_initialized)
    end
  end

  def counter_key(id) = "#{Customer.prefix}:#{id}:login_count"
end

# 20260520 — Rename Customer#fullname to #name (reversible).
class RenameFullnameToName < Familia::Migration::Base
  self.migration_id = '20260520_rename_fullname_to_name'
  self.description = 'Rename Customer#fullname to #name'
  self.dependencies = ['20260101_add_status_field']

  def migration_needed?
    Customer.instances.members.any? { |id| dbclient.hexists(Customer.dbkey(id), 'fullname') == 1 }
  end

  def migrate
    Customer.instances.members.each do |id|
      key = Customer.dbkey(id)
      next unless dbclient.hexists(key, 'fullname') == 1

      for_realsies_this_time? do
        value = dbclient.hget(key, 'fullname')
        dbclient.hset(key, 'name', value)
        dbclient.hdel(key, 'fullname')
      end
      track_stat(:records_renamed)
    end
  end

  def down
    Customer.instances.members.each do |id|
      key = Customer.dbkey(id)
      next unless dbclient.hexists(key, 'name') == 1

      for_realsies_this_time? do
        dbclient.hset(key, 'fullname', dbclient.hget(key, 'name'))
        dbclient.hdel(key, 'name')
      end
    end
  end
end

# 20260603 — Re-encrypt Customer#api_secret under key v2 (not reversible).
class ReencryptApiSecretV2 < Familia::Migration::Base
  self.migration_id = '20260603_reencrypt_api_secret_v2'
  self.description = 'Re-encrypt Customer#api_secret under key v2'

  # Needs the v2 key configured; in the demo it is not, so this reports as
  # not-needed (skipped) rather than touching ciphertext.
  def migration_needed?
    Familia.config.respond_to?(:encryption_keys) &&
      Familia.config.encryption_keys.is_a?(Hash) &&
      Familia.config.encryption_keys.key?(:v2)
  end

  def migrate
    track_stat(:noop)
  end
end
