# frozen_string_literal: true

# Admin::MCP
#
# The agent-drivable surface declared in the routes file:
#
#   MCP  /models        Admin::MCP.list_models   (read-only resource)
#   MCP  /integrity     Admin::MCP.health        (read-only resource)
#   TOOL /repair        Admin::MCP.repair        (executable tool)
#   TOOL /run_migration Admin::MCP.run_migration (executable tool)
#
# Safe-by-default posture: the read resources mirror the HTTP read endpoints,
# but the TOOLs are DRY-RUN ONLY here. Applying a repair or running a migration
# is destructive and must pass the same dry-run -> confirm -> apply gate and the
# audit trail a human gets, which lives on the elevated HTTP endpoints. The
# agent surface previews; a human (or an explicitly elevated, audited call)
# applies. Methods accept optional args so they work as both MCP resources
# (called with no args) and TOOLs (called with an arguments hash).
#
module Admin
  module MCP
    module_function

    def list_models(*)
      { models: Familia::Admin::Descriptor.models.map { |m| safe { m.config_name } }.compact }
    end

    # Per-model health summary. Read-only.
    def health(*args)
      arguments = args.first.is_a?(Hash) ? args.first : {}
      models = target_models(arguments)
      {
        models: models.map do |m|
          report = safe { m.health_check(check_cross_refs: true) }
          if report
            ser = Familia::Admin::Serializers.audit_report(report)
            { model: safe { m.config_name }, healthy: ser[:healthy], summary: ser[:summary] }
          else
            { model: safe { m.config_name }, healthy: nil, error: 'audit_unavailable' }
          end
        end,
      }
    end

    # Dry-run preview of a repair. Never applies.
    def repair(*args)
      arguments = args.first.is_a?(Hash) ? args.first : {}
      klass = resolve(arguments['model'] || arguments[:model])
      return { error: 'not_found', resource: 'model' } unless klass

      report = safe { klass.health_check(check_cross_refs: true) }
      return { error: 'audit_unavailable' } unless report

      {
        dry_run: true,
        model: safe { klass.config_name },
        report: Familia::Admin::Serializers.audit_report(report),
        note: 'Preview only. Apply via POST /admin/api/integrity/:model/repair (elevated + audited).',
      }
    end

    # Dry-run migration plan. Never applies.
    def run_migration(*args)
      return { error: 'migration_subsystem_unavailable' } unless defined?(Familia::Migration::Runner)

      runner = safe { Familia::Migration::Runner.new }
      return { error: 'migration_runner_unavailable' } unless runner

      {
        dry_run: true,
        result: safe { runner.run(dry_run: true) },
        note: 'Preview only. Apply via POST /admin/api/migrations/run (elevated + audited).',
      }
    end

    # ----- helpers ---------------------------------------------------------

    def target_models(arguments)
      name = arguments['model'] || arguments[:model]
      if name && (k = resolve(name))
        [k]
      else
        Familia::Admin::Descriptor.models
      end
    end

    def resolve(name)
      Familia::Admin::Descriptor.resolve(name)
    end

    def safe
      yield
    rescue StandardError
      nil
    end
  end
end
