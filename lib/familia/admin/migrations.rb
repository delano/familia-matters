# frozen_string_literal: true

require 'familia/migration'
require 'json'
require_relative 'audit_log'

module Familia
  module Admin
    # Thin adapter over Familia's REAL migration subsystem
    # (Familia::Migration::Runner + Registry). It does not reimplement
    # migrations — it serializes the runner/registry output into the shapes the
    # admin frontend consumes, and enriches schema drift (which the registry
    # reports as a list of changed model names) with the registry's own schema
    # digests plus a baseline field snapshot so the UI can render the field-level
    # diff and suggest a migration.
    module Migrations
      module_function

      # Baseline field snapshot per model, captured at the last migration. The
      # registry only stores a digest; we keep the field list alongside so we
      # can show *which* fields changed. (Demo seeds a stale Customer snapshot.)
      SNAPSHOT_KEY = (ENV['ADMIN_SCHEMA_SNAPSHOT_KEY'] || 'familia_admin:schema_snapshot').freeze

      def runner
        Familia::Migration::Runner.new
      end

      def registry
        Familia::Migration::Registry.new
      end

      def client = Familia.dbclient

      # ----- status ------------------------------------------------------

      # {applied: [...], pending: [...]} in the frontend's shape.
      def status
        by_id = migration_classes.each_with_object({}) { |k, h| h[k.migration_id] = k }
        applied = []
        pending = []

        runner.status.each do |row|
          klass = by_id[row[:migration_id]]
          entry = {
            id: row[:migration_id],
            description: row[:description] || klass&.description,
            reversible: row[:reversible],
          }
          if row[:status] == :applied
            entry[:applied_at] = row[:applied_at].respond_to?(:to_i) ? row[:applied_at].to_i : row[:applied_at]
            applied << entry
          else
            entry[:dependencies] = Array(klass&.dependencies)
            pending << entry
          end
        end

        { applied: applied, pending: pending }
      end

      # ----- schema drift ------------------------------------------------

      # {models: [{model, changed, stored_digest, current_digest, differences, suggested_migration}]}
      def schema_drift
        reg = registry
        snapshots = baseline_snapshots
        models = Familia.members.reject { |m| m.name.nil? }.map do |klass|
          current_fields = klass.fields.map(&:to_s).sort
          current_digest = "sha256:#{reg.schema_digest(klass)}"
          stored_fields = snapshots[klass.name] || current_fields
          stored_digest = reg.stored_schema(klass)
          stored_digest = stored_digest ? "sha256:#{stored_digest}" : current_digest
          diffs = field_differences(stored_fields, current_fields)
          {
            model: klass.name,
            changed: !diffs.empty?,
            stored_digest: stored_digest,
            current_digest: current_digest,
            differences: diffs,
            suggested_migration: diffs.empty? ? nil : suggested_migration_for(klass.name, diffs),
          }.compact
        end
        { models: models }
      end

      def field_differences(stored, current)
        removed = (stored - current).map { |f| { field: f, change: 'removed' } }
        added = (current - stored).map { |f| { field: f, change: 'added' } }
        (removed + added)
      end

      # The pending migration that would resolve this model's drift: prefer one
      # whose description names the model AND a changed field; fall back to any
      # pending migration that names the model.
      def suggested_migration_for(model_name, diffs)
        fields = Array(diffs).map { |d| d[:field] }
        applied = registry.all_applied.map { |e| e[:migration_id] }.to_set
        pending = migration_classes.reject { |k| applied.include?(k.migration_id) }
        cand = pending.find { |k| d = k.description.to_s; d.include?(model_name) && fields.any? { |f| d.include?(f) } }
        cand ||= pending.find { |k| k.description.to_s.include?(model_name) }
        cand&.migration_id
      end

      # ----- run / rollback ----------------------------------------------

      def run(id: nil, dry_run: true, limit: nil, actor: 'unknown')
        result = if id && !id.to_s.empty?
                   [runner.run_one(id, dry_run: dry_run)]
                 else
                   runner.run(dry_run: dry_run, limit: limit)
                 end
        AuditLog.record(action: :run_migrations, actor: actor, id: id, dry_run: dry_run) unless dry_run
        { dry_run: dry_run, results: result.map { |r| serialize_result(r) } }
      end

      def rollback(id, actor: 'unknown')
        result = runner.rollback(id)
        AuditLog.record(action: :rollback_migration, actor: actor, id: id)
        { result: serialize_result(result) }
      end

      def serialize_result(r)
        {
          id: r[:migration_id],
          status: r[:status].to_s,
          dry_run: r[:dry_run],
          stats: r[:stats],
          error: r[:error],
        }.compact
      end

      # ----- seeding (demo + tests) --------------------------------------

      # Record the already-applied migrations and store a stale Customer schema
      # baseline so the drift card has something to show. Idempotent.
      def seed!
        reg = registry
        %w[20260101_add_status_field 20260318_backfill_login_count].each do |id|
          reg.record_applied(id, reversible: true) unless reg.applied?(id)
        end

        # Snapshot every model at its current schema, then rewrite the Customer
        # baseline to a pre-rename shape (fullname instead of name, no
        # updated_at) so drift is demonstrable against the live model.
        Familia.members.reject { |m| m.name.nil? }.each { |k| reg.store_schema(k) }
        save_snapshots(Familia.members.reject { |m| m.name.nil? }
          .each_with_object({}) { |k, h| h[k.name] = k.fields.map(&:to_s).sort })

        if (cust = Familia.members.find { |m| m.name == 'Customer' })
          stale = (cust.fields.map(&:to_s) - %w[name updated_at] + %w[fullname]).sort
          merge_snapshot('Customer', stale)
          client.hset(reg.send(:schema_key), 'Customer', Digest::SHA256.hexdigest(stale_digest_source(cust, stale)))
        end
        self
      end

      def reset!
        client.del(SNAPSHOT_KEY)
      end

      # ----- internals ---------------------------------------------------

      def migration_classes
        Familia::Migration.migrations.reject { |k| k.name.nil? }
      end

      def baseline_snapshots
        raw = client.get(SNAPSHOT_KEY)
        raw ? JSON.parse(raw) : {}
      end

      def save_snapshots(hash)
        client.set(SNAPSHOT_KEY, JSON.generate(hash))
      end

      def merge_snapshot(model, fields)
        snaps = baseline_snapshots
        snaps[model] = fields
        save_snapshots(snaps)
      end

      # Recreate the digest source the registry uses (field:type pairs), but
      # against the stale field set, so the stored digest genuinely differs.
      def stale_digest_source(klass, stale_fields)
        types = klass.field_types
        stale_fields.sort.map { |f| "#{f}:#{types[f.to_sym] || 'unknown'}" }.join('|')
      end
    end
  end
end
