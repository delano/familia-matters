# frozen_string_literal: true

require 'json'
require 'securerandom'
require_relative 'descriptor'
require_relative 'serializers'
require_relative 'audit_log'
require_relative 'auth'
require_relative 'raw'
require_relative 'streaming'
require_relative 'migrations'

# Admin::API
#
# Otto controller wiring the `routes` file to Familia's runtime introspection,
# records CRUD, integrity audit/repair, migrations, and the raw explorer. Otto
# instantiates this per request with (req, res) and calls the route's action;
# the action returns a Hash that Otto's response=json handler serializes (and
# any status set on @res is preserved). Streaming actions instead attach a Rack
# 3 streaming body to @res.
#
# Authorization is two-layer: Otto's AdminStrategy authenticates the bearer
# token and requires the admin role for every route (401 on failure, before we
# run); elevated actions additionally call require_permission! here and return
# 403 {error:'forbidden', required_tier, held} when the tier is missing.
module Admin
  class API
    PAGE_DEFAULT = 50
    PAGE_MAX     = 500

    Descriptor  = Familia::Admin::Descriptor
    Serializers = Familia::Admin::Serializers
    AuditLog    = Familia::Admin::AuditLog
    Auth        = Familia::Admin::Auth
    Raw         = Familia::Admin::Raw
    Streaming   = Familia::Admin::Streaming
    Migrations  = Familia::Admin::Migrations

    def initialize(req, res)
      @req = req
      @res = res
    end

    # ----- discovery -------------------------------------------------------

    def meta
      Descriptor.app
    end

    def list_models
      { models: Descriptor.models.map(&:name) }
    end

    def describe_model
      klass = resolve_model! or return @halt
      Descriptor.model(klass)
    end

    def openapi
      # Left as a documented stub: the descriptor carries every field/type/index
      # needed to emit an OpenAPI 3.1 document; teams pin their own conventions.
      { error: 'not_implemented', hint: 'derive from Descriptor.app' }
    end

    # ----- records ---------------------------------------------------------

    # GET /models/:model/records?offset=&limit=  — newest-first page off the
    # per-class instances timeline (count_fast is O(1); the integrity endpoint
    # reconciles it against a SCAN count).
    def list_records
      klass = resolve_model! or return @halt
      offset, limit = page_params
      ids = Array(safe { klass.instances.members })
      page_ids = ids.reverse.drop(offset).first(limit)
      records = Array(safe { klass.load_multi(page_ids) }).compact
      {
        model: klass.config_name,
        offset: offset,
        limit: limit,
        count_fast: safe { klass.count },
        records: records.map { |r| Serializers.record(r) },
      }
    end

    def read_record
      klass = resolve_model! or return @halt
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec

      Serializers.record(rec, full: true)
    end

    # POST /models/:model/records  body: {fields:{...}} (or flat) — create-only
    # atomic write via klass.build, with mass-assignment protection.
    def create_record
      klass = resolve_model! or return @halt
      fields = with_identifier_and_timestamps(klass, permitted_fields(klass, record_input))
      begin
        rec = klass.build(**fields)
      rescue Familia::RecordExistsError
        @res.status = 409
        return { error: 'already_exists', model: klass.config_name }
      end
      AuditLog.record(action: :create, actor: actor, model: klass.config_name, id: rec.identifier)
      @res.status = 201
      Serializers.record(rec, full: true).merge(created: true, _simulated: false)
    end

    # PUT /models/:model/records/:id  body: {fields:{...}} — atomic multi-field
    # update; only declared, non-identifier fields are assignable.
    def update_record
      klass = resolve_model! or return @halt
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec

      idf = klass.identifier_field
      changes = permitted_fields(klass, record_input).reject { |k, _| k == idf }
      apply_update(rec, changes)
      AuditLog.record(action: :update, actor: actor, model: klass.config_name, id: param(:id),
                      fields: changes.keys)
      Serializers.record(rec, full: true).merge(updated: true, _simulated: false)
    end

    def destroy_record
      klass = resolve_model! or return @halt
      ok = safe { klass.destroy!(param(:id)) }
      AuditLog.record(action: :destroy, actor: actor, model: klass.config_name, id: param(:id))
      { destroyed: !!ok, _simulated: false }
    end

    # POST /models/:model/records/:id/reveal/:field — elevated + audited.
    # Returns plaintext exactly once. The audit records the field name only,
    # never the revealed value.
    def reveal_field
      klass = resolve_model! or return @halt
      gate = require_permission!(:reveal_secrets) and return gate

      field = param(:field).to_sym
      ft = safe { klass.field_types[field] }
      return bad_request('not an encrypted field') unless ft && ft.category == :encrypted

      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec

      plaintext = nil
      safe { rec.send(field).reveal { |value| plaintext = value } }
      return bad_request('no value to reveal') if plaintext.nil?

      entry = AuditLog.record(action: :reveal, actor: actor, model: klass.config_name,
                              id: param(:id), field: field)
      { field => plaintext, _audit: entry.reject { |k, _| k == :_id } }
    end

    # ----- collections (DataTypes) ----------------------------------------

    def read_collection
      klass = resolve_model! or return @halt
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec
      return not_found('collection') unless safe { rec.respond_to?(param(:collection)) && rec.send(param(:collection)) }

      offset, limit = page_params
      Serializers.collection(rec, param(:collection), offset: offset, limit: limit)
    end

    # POST /models/:model/records/:id/:collection  body: {op:, args:[]} —
    # dispatch a native DataType op (add/remove/increment/set).
    def mutate_collection
      klass = resolve_model! or return @halt
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec

      coll = safe { rec.send(param(:collection)) }
      return not_found('collection') unless coll

      payload = body_params
      op = (payload['op'] || payload[:op]).to_s
      args = Array(payload['args'] || payload[:args])
      begin
        result = dispatch_collection_op(coll, op, args)
      rescue ArgumentError => e
        return bad_request(e.message)
      end
      AuditLog.record(action: :mutate_collection, actor: actor, model: klass.config_name,
                      id: param(:id), collection: param(:collection), op: op)
      { collection: param(:collection), op: op, result: result, _simulated: false }
    end

    # ----- query (indexed only) -------------------------------------------

    def query_index
      klass = resolve_model! or return @halt
      return bad_request('introspection unavailable') unless Familia.respond_to?(:index_descriptors)

      name = param(:index).to_sym
      desc = Array(safe { Familia.index_descriptors(owner: klass) }).find { |d| d.index_name == name }
      return not_found('index') unless desc

      offset, limit = page_params
      recs = Array(safe { desc.each_record(value: param(:value)).to_a }).compact
      page = recs.drop(offset).first(limit)
      { index: name, value: param(:value), records: page.map { |r| Serializers.record(r) } }
    end

    # ----- integrity -------------------------------------------------------

    def health_check
      klass = resolve_model! or return @halt
      report = safe { klass.health_check(check_cross_refs: true, audit_collections: true) }
      return bad_request('audit unavailable') unless report

      Serializers.audit_report(report)
    end

    # POST /integrity/:model/repair?dry_run=true — dry-run previews; an actual
    # repair runs repair_all!(verify:true) and is audited.
    def repair
      klass = resolve_model! or return @halt
      gate = require_permission!(:repair) and return gate

      report = safe { klass.health_check(check_cross_refs: true, audit_collections: true) }
      return bad_request('audit unavailable') unless report

      ser = Serializers.audit_report(report)
      if truthy?(param(:dry_run))
        return { dry_run: true, model: klass.config_name, writes: ser[:summary][:total_issues], report: ser }
      end

      result = safe { klass.repair_all!(check_cross_refs: true, audit_collections: true, verify: true) }
      AuditLog.record(action: :repair, actor: actor, model: klass.config_name,
                      writes: ser[:summary][:total_issues])
      { repaired: true, model: klass.config_name, verified: !!(result && result[:verified]),
        summary: Streaming.done_summary(ser) }
    end

    def stale_indexes
      return bad_request('introspection unavailable') unless Familia.respond_to?(:stale_indexes)

      stale = Array(safe { Familia.stale_indexes }).map { |d| { coordinate: safe { d.coordinate }, index: d.index_name } }
      { stale_indexes: stale }
    end

    # ----- migrations ------------------------------------------------------

    def migration_status
      Migrations.status
    end

    def schema_drift
      Migrations.schema_drift
    end

    def run_migrations
      gate = require_permission!(:run_migrations) and return gate

      Migrations.run(id: param(:id), dry_run: truthy?(param(:dry_run)),
                     limit: int_param(:limit), actor: actor)
    end

    def rollback
      gate = require_permission!(:run_migrations) and return gate

      Migrations.rollback(param(:id), actor: actor)
    end

    # ----- raw explorer ----------------------------------------------------

    def scan_keys
      Raw.scan_keys(pattern: param(:pattern), type: param(:type),
                    cursor: (int_param(:cursor) || 0), count: (int_param(:count) || 100))
    end

    def inspect_key
      return bad_request('key required') if param(:key).to_s.empty?

      Raw.inspect_key(param(:key))
    end

    def server_info
      Raw.info
    end

    # POST /raw/command — allowlisted read commands run for real; destructive
    # commands are hard-denied (even forced). Every attempt is audited.
    def run_command
      gate = require_permission!(:raw_command) and return gate

      payload = body_params
      cmd = (payload['cmd'] || payload[:cmd]).to_s
      args = Array(payload['args'] || payload[:args])
      force = truthy?(payload['force'] || payload[:force])

      result = Raw.run_command(cmd, args, force: force, tier: principal&.permissions_list)
      AuditLog.record(action: :raw_command, actor: actor, cmd: cmd.upcase,
                      blocked: !!result[:error], forced: force)
      result
    end

    # ----- live streams (Rack 3 streaming bodies) -------------------------

    def stream_commands
      sse!
      @res.body = Streaming.command_feed(limit: (int_param(:limit) || 30))
      nil
    end

    def stream_repair
      klass = resolve_model!
      return stream_error(404, @halt) unless klass
      return false unless ensure_stream_permission(:repair)

      sse!
      @res.body = Streaming.repair_stream(klass, dry_run: truthy?(param(:dry_run)), actor: actor)
      nil
    end

    # ----- audit -----------------------------------------------------------

    def audit_log
      { entries: AuditLog.recent(limit: (int_param(:limit) || 50)), count: AuditLog.count }
    end

    # ======================================================================
    # helpers
    # ======================================================================

    private

    def principal
      Auth.principal(@req.env)
    end

    def actor
      principal&.actor || 'unknown'
    end

    # Returns nil when permitted; otherwise sets 403 and returns the forbidden
    # body (so callers do: `gate = require_permission!(:x) and return gate`).
    def require_permission!(tier)
      return nil if principal&.has_permission?(tier.to_s)

      @res.status = 403
      { error: 'forbidden', required_tier: "permission:#{tier}", held: (principal&.permissions_list || []) }
    end

    def resolve_model!
      name = param(:model)
      klass = safe { Familia.resolve_class(name) }
      klass ||= safe { Familia.members.find { |m| m.config_name == name.to_s } }
      return klass if klass

      @halt = not_found('model')
      nil
    end

    # Only declared fields are assignable (mass-assignment protection).
    def permitted_fields(klass, input)
      allowed = Array(safe { klass.fields }).map(&:to_s)
      (input || {}).each_with_object({}) do |(k, v), acc|
        acc[k.to_sym] = v if allowed.include?(k.to_s)
      end
    end

    def with_identifier_and_timestamps(klass, fields)
      idf = klass.identifier_field
      if idf.is_a?(Symbol) && fields[idf].to_s.empty?
        fields[idf] = generate_identifier(klass)
      end
      now = Time.now.to_i
      fields[:created_at] = now if klass.fields.include?(:created_at) && fields[:created_at].nil?
      fields[:updated_at] = now if klass.fields.include?(:updated_at) && fields[:updated_at].nil?
      fields
    end

    def generate_identifier(klass)
      stub = klass.config_name.to_s.split('_').first[0, 4]
      "#{stub}_#{SecureRandom.hex(3)}"
    end

    def apply_update(rec, changes)
      now = Time.now.to_i
      changes.each { |k, v| rec.send(:"#{k}=", v) }
      rec.updated_at = now if rec.respond_to?(:updated_at=) && !changes.key?(:updated_at)
      rec.save
    end

    # Dispatch a collection op to the native DataType method, by collection type.
    def dispatch_collection_op(coll, op, args)
      type = Descriptor.datatype_name_for(coll.class).to_s
      case op
      when 'add', 'push', 'append'
        case type
        when 'sorted_set' then coll.add(args[0], (args[1] || Familia.now)); { added: args[0] }
        when 'hashkey'    then coll[args[0]] = args[1]; { set: args[0] }
        when 'counter'    then { value: coll.incrementby(int(args[0], 1)) }
        else coll << args[0]; { added: args[0] }
        end
      when 'set' # hashkey field set
        raise ArgumentError, 'set requires field and value' if args.size < 2

        coll[args[0]] = args[1]
        { set: args[0] }
      when 'remove', 'delete', 'rem'
        case type
        when 'counter' then { value: coll.decrementby(int(args[0], 1)) }
        else remove_member(coll, args[0]); { removed: args[0] }
        end
      when 'increment', 'incr' then { value: coll.incrementby(int(args[0], 1)) }
      when 'decrement', 'decr' then { value: coll.decrementby(int(args[0], 1)) }
      else
        raise ArgumentError, "unsupported op: #{op}"
      end
    end

    def remove_member(coll, member)
      %i[remove delete del rem].each do |m|
        return coll.send(m, member) if coll.respond_to?(m)
      end
      raise ArgumentError, 'collection does not support removal'
    end

    def int(value, default)
      value.to_s.match?(/\A-?\d+\z/) ? value.to_i : default
    end

    # ----- request parsing ------------------------------------------------

    def param(key)
      @req.params[key.to_s] || @req.params[key.to_sym]
    end

    def int_param(key)
      v = param(key)
      v && v.to_s.match?(/\A\d+\z/) ? v.to_i : nil
    end

    def truthy?(value)
      %w[1 true yes on].include?(value.to_s.downcase)
    end

    def page_params
      offset = [int_param(:offset) || 0, 0].max
      limit  = (int_param(:limit) || PAGE_DEFAULT).clamp(1, PAGE_MAX)
      [offset, limit]
    end

    # Parsed JSON request body (POST/PUT). Cached; rewinds the input.
    def body_params
      @body_params ||= begin
        raw = safe { @req.body&.read }
        safe { @req.body&.rewind }
        parsed = (raw && !raw.empty?) ? (safe { JSON.parse(raw) } || {}) : {}
        parsed.is_a?(Hash) ? parsed : {}
      end
    end

    # Record fields can arrive nested under "fields" or flat.
    def record_input
      bp = body_params
      nested = bp['fields'] || bp[:fields]
      nested.is_a?(Hash) ? nested : bp
    end

    # ----- response helpers -----------------------------------------------

    def json(payload, status: nil)
      @res.status = status if status
      payload
    end

    def not_found(what)
      @res.status = 404
      { error: 'not_found', resource: what }
    end

    def bad_request(msg)
      @res.status = 400
      { error: 'bad_request', message: msg }
    end

    # Configure the response for server-sent events (no JSON handler runs for
    # these default-response-type routes; finalize_response keeps the #each body).
    def sse!
      @res.status = 200
      Streaming::SSE_HEADERS.each { |k, v| @res.headers[k] = v }
    end

    def ensure_stream_permission(tier)
      return true if principal&.has_permission?(tier.to_s)

      stream_error(403, error: 'forbidden', required_tier: "permission:#{tier}",
                        held: (principal&.permissions_list || []))
      false
    end

    def stream_error(status, body)
      @res.status = status
      @res.headers['content-type'] = 'application/json'
      @res.body = [body.to_json]
      nil
    end

    def safe
      yield
    rescue StandardError
      nil
    end
  end
end
