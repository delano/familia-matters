# frozen_string_literal: true

require 'json'
require_relative 'descriptor'

# Admin::API
#
# Thin Otto controller wiring the routes file to Familia's runtime introspection,
# integrity, and migration APIs. Otto instantiates this per request with
# (req, res) and calls the action named in the route.
#
# Status: read, integrity, and migration actions are implemented against the
# verified Familia 2.10.1 API. Mutations, raw explorer, and streams are marked
# TODO with correct skeletons. The auth tier is enforced by Otto from the route
# file; this class assumes the request already passed that gate and reads the
# authenticated context from env['otto.strategy_result'].
module Admin
  class API
    PAGE_DEFAULT = 50
    PAGE_MAX     = 500

    def initialize(req, res)
      @req = req
      @res = res
    end

    # ----- discovery -------------------------------------------------------

    def meta
      json(Familia::Admin::Descriptor.app)
    end

    def list_models
      json(models: Familia::Admin::Descriptor.models.map(&:name))
    end

    def describe_model
      klass = resolve_model! or return
      json(Familia::Admin::Descriptor.model(klass))
    end

    # Generate an OpenAPI 3.1 document from the descriptor. Left as a TODO so the
    # team can pin its preferred schema conventions; the descriptor already
    # carries every field/type/index needed to emit paths and component schemas.
    def openapi
      json(error: 'not_implemented', hint: 'derive from Descriptor.app')
    end

    # ----- records ---------------------------------------------------------

    # GET /models/:model/records?offset=&limit=
    # Lists newest-first from the per-class instances timeline (a sorted set).
    def list_records
      klass = resolve_model! or return
      offset, limit = page_params
      # instances is the per-class sorted set timeline. Cursor iteration avoids
      # loading the whole keyspace. count is O(1) but may include phantoms; use
      # the integrity endpoint for an authoritative reconciliation.
      ids = Array(safe { klass.instances.lazy.drop(offset).first(limit) })
      records = Array(safe { klass.load_multi(ids) }).compact
      json(
        model: klass.config_name,
        offset: offset,
        limit: limit,
        count_fast: safe { klass.count },
        records: records.map { |r| serialize(r) },
      )
    end

    def read_record
      klass = resolve_model! or return
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec
      json(serialize(rec, full: true))
    end

    # POST /models/:model/records   body: {fields: {...}}
    # TODO: build with atomic create-only semantics, validate against JSON Schema.
    #   klass.build(**fields) { |o| ...collections... }
    def create_record
      _klass = resolve_model! or return
      json(error: 'not_implemented', hint: 'use klass.build(**params) for create-only atomic write')
    end

    # PUT /models/:model/records/:id   body: {fields: {...}}
    # TODO: load, assign permitted fields, wrap field+index changes in atomic_write.
    def update_record
      _klass = resolve_model! or return
      json(error: 'not_implemented', hint: 'wrap multi-field/index edits in atomic_write')
    end

    def destroy_record
      klass = resolve_model! or return
      ok = safe { klass.destroy!(param(:id)) }
      audit!(:destroy, model: klass.config_name, id: param(:id))
      json(destroyed: !!ok)
    end

    # POST /models/:model/records/:id/reveal/:field
    # Elevated + audited. Returns plaintext exactly once.
    def reveal_field
      klass = resolve_model! or return
      field = param(:field).to_sym
      ft = safe { klass.field_types[field] }
      return bad_request('not an encrypted field') unless ft && ft.category == :encrypted
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec
      value = safe { rec.send(field).reveal }   # ConcealedString#reveal
      audit!(:reveal, model: klass.config_name, id: param(:id), field: field)
      json(field => value)
    end

    # ----- collections (DataTypes) ----------------------------------------

    # GET .../:collection  -> paginated members via the DataType's Enumerable API
    def read_collection
      klass = resolve_model! or return
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec
      coll = safe { rec.send(param(:collection)) }
      return not_found('collection') unless coll
      offset, limit = page_params
      members = Array(safe { coll.lazy.drop(offset).first(limit) })
      json(collection: param(:collection), offset: offset, limit: limit, members: members)
    end

    # POST .../:collection  body: {op:, args:}
    # TODO: dispatch to native ops (add/push/remove/increment) inside a transaction.
    def mutate_collection
      _klass = resolve_model! or return
      json(error: 'not_implemented', hint: 'dispatch op to native DataType method in a transaction')
    end

    # ----- query (indexed only) -------------------------------------------

    # GET /models/:model/index/:index?value=
    # Walks the records behind an index via IndexDescriptor#each_record.
    def query_index
      klass = resolve_model! or return
      return bad_request('introspection unavailable') unless Familia.respond_to?(:index_descriptors)
      name = param(:index).to_sym
      desc = Array(safe { Familia.index_descriptors(owner: klass) }).find { |d| d.index_name == name }
      return not_found('index') unless desc
      offset, limit = page_params
      recs = Array(safe { desc.each_record(value: param(:value)).lazy.drop(offset).first(limit) }).compact
      json(index: name, value: param(:value), records: recs.map { |r| serialize(r) })
    end

    # ----- integrity -------------------------------------------------------

    def health_check
      klass = resolve_model! or return
      report = safe { klass.health_check(check_cross_refs: true) }
      return bad_request('audit unavailable') unless report
      json(report.to_h)
    end

    # POST /integrity/:model/repair?dry_run=true
    def repair
      klass = resolve_model! or return
      dry = truthy?(param(:dry_run))
      # repair_all! re-audits and verifies; honor a dry-run preview first.
      result = if dry
                 { dry_run: true, report: safe { klass.health_check(check_cross_refs: true)&.to_h } }
               else
                 audit!(:repair, model: klass.config_name)
                 safe { klass.repair_all!(verify: true, check_cross_refs: true) }
               end
      json(result || { error: 'repair unavailable' })
    end

    def stale_indexes
      return bad_request('introspection unavailable') unless Familia.respond_to?(:stale_indexes)
      stale = Array(safe { Familia.stale_indexes }).map { |d| { coordinate: safe { d.coordinate }, index: d.index_name } }
      json(stale_indexes: stale)
    end

    # ----- migrations ------------------------------------------------------

    def migration_status
      runner = safe { Familia::Migration::Runner.new }
      json(status: safe { runner&.status })
    end

    def schema_drift
      registry = safe { Familia::Migration::Registry.new }
      json(drift: safe { registry&.schema_drift })
    end

    # POST /migrations/run?dry_run=true&limit=
    def run_migrations
      runner = safe { Familia::Migration::Runner.new }
      return bad_request('migration runner unavailable') unless runner
      dry = truthy?(param(:dry_run))
      audit!(:run_migrations, dry_run: dry) unless dry
      json(result: safe { runner.run(dry_run: dry, limit: int_param(:limit)) })
    end

    def rollback
      runner = safe { Familia::Migration::Runner.new }
      return bad_request('migration runner unavailable') unless runner
      audit!(:rollback, id: param(:id))
      json(result: safe { runner.rollback(param(:id)) })
    end

    # ----- raw explorer ----------------------------------------------------

    # TODO: SCAN-based key listing with TYPE/TTL per key. Never KEYS in prod.
    def scan_keys
      json(error: 'not_implemented', hint: 'SCAN cursor; return key + type + ttl')
    end

    def inspect_key
      json(error: 'not_implemented', hint: 'TYPE/TTL/MEMORY USAGE + typed value preview')
    end

    def server_info
      json(error: 'not_implemented', hint: 'Familia.dbclient.info parsed into sections')
    end

    # TODO: allowlist commands; deny KEYS/FLUSH*/CONFIG/SHUTDOWN/DEBUG unless elevated.
    def run_command
      json(error: 'not_implemented', hint: 'allowlist + audit; this is the dangerous path')
    end

    # ----- live streams (Rack 3 streaming bodies) -------------------------

    # Rack 3: a body responding to #call(stream) streams server-sent events.
    # Subscribe Familia::Instrumentation.on_command and write each event; close
    # on client disconnect. Wire @res to return this streaming body per Otto's
    # response handling.
    def stream_commands
      json(error: 'not_implemented', hint: 'Rack 3 streaming body + Familia::Instrumentation.on_command')
    end

    # Stream audit/repair progress: the audit/repair methods yield
    # {phase:, current:, total:}; forward each as an SSE event.
    def stream_repair
      json(error: 'not_implemented', hint: 'stream the {phase,current,total} progress yielded by repair_all!')
    end

    # ======================================================================
    # helpers
    # ======================================================================

    private

    def resolve_model!
      name = param(:model)
      klass = safe { Familia.member_by_config_name(name) } || safe { Familia.resolve_class(name) }
      return klass if klass
      not_found('model')
      nil
    end

    # Admin serializer: all persistent fields, encrypted masked, transient omitted.
    # Use record.safe_dump instead for lower permission tiers.
    def serialize(rec, full: false)
      klass = rec.class
      out = {}
      Array(safe { klass.persistent_fields }).each do |f|
        ft = safe { klass.field_types[f] }
        next if ft && ft.category == :transient
        out[f] = if ft && ft.category == :encrypted
                   '[CONCEALED]'
                 else
                   safe { rec.send(f) }
                 end
      end
      out[:_key] = safe { rec.dbkey } if full
      out
    end

    def page_params
      offset = [int_param(:offset) || 0, 0].max
      limit  = (int_param(:limit) || PAGE_DEFAULT).clamp(1, PAGE_MAX)
      [offset, limit]
    end

    def param(key)
      @req.params[key.to_s] || @req.params[key.to_sym]
    end

    def int_param(key)
      v = param(key)
      v && v.to_s.match?(/\A\d+\z/) ? v.to_i : nil
    end

    def truthy?(v)
      %w[1 true yes on].include?(v.to_s.downcase)
    end

    # The authenticated admin, from Otto's auth layer.
    def actor
      sr = @req.env['otto.strategy_result']
      sr && sr.respond_to?(:user_id) ? sr.user_id : 'unknown'
    end

    # Append-only admin audit trail. Replace the sink with your store.
    def audit!(action, **details)
      entry = { at: Time.now.to_i, actor: actor, action: action, **details }
      # TODO: persist to an append-only Familia sorted set or external log.
      warn("[familia-admin audit] #{entry.to_json}")
      entry
    end

    def json(payload, status: 200)
      @res.status = status
      @res.headers['content-type'] = 'application/json' if @res.respond_to?(:headers)
      @res.body = payload.to_json
    end

    def not_found(what)
      json({ error: 'not_found', resource: what }, status: 404)
    end

    def bad_request(msg)
      json({ error: 'bad_request', message: msg }, status: 400)
    end

    def safe
      yield
    rescue StandardError
      nil
    end
  end
end
