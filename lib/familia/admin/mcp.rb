# frozen_string_literal: true

require_relative 'descriptor'
require_relative 'migrations'

# Admin::MCP — the same admin surface, agent-drivable over JSON-RPC.
#
# Minimal read/most-common handlers. The MCP/TOOL routes are wired in `routes`
# but commented out until the Otto MCP server is enabled; these handlers exist
# so enabling it is a one-line change.
module Admin
  module MCP
    module_function

    def list_models(*)
      { models: Familia::Admin::Descriptor.models.map(&:name) }
    end

    def health(params = {})
      model = params[:model] || params['model'] || 'customer'
      klass = Familia.resolve_class(model) rescue nil
      return { error: 'not_found', model: model } unless klass

      report = klass.health_check(check_cross_refs: true)
      Familia::Admin::Serializers.audit_report(report)
    end

    def repair(params = {})
      model = params[:model] || params['model'] || 'customer'
      klass = Familia.resolve_class(model) rescue nil
      return { error: 'not_found', model: model } unless klass

      ser = Familia::Admin::Serializers.audit_report(klass.health_check(check_cross_refs: true))
      { dry_run: true, model: klass.config_name, writes: ser[:summary][:total_issues] }
    end

    def run_migration(params = {})
      Familia::Admin::Migrations.run(id: (params[:id] || params['id']),
                                     dry_run: params.fetch(:dry_run, params.fetch('dry_run', true)))
    end
  end
end
