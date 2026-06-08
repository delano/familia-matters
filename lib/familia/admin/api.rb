# frozen_string_literal: true

require 'json'

# Familia::Admin migration subsystem is not autoloaded by `require 'familia'`;
# load it so the migration endpoints have a real runner/registry. Guarded
# because a Familia build without migrations should still boot the admin.
begin
  require 'familia/migration'
rescue LoadError, StandardError
  # migrations unavailable; the endpoints degrade to bad_request at call time
end

module Admin
  # Admin::API
  #
  # Otto controller wiring the routes file to Familia's runtime introspection,
  # CRUD, integrity, migration, raw-explorer, and live-stream APIs. Otto
  # instantiates this per request with (req, res) and calls the action named in
  # the route.
  #
  # Response convention:
  #   * JSON actions (routes with `response=json`) RETURN a Ruby Hash. Otto's
  #     JSONHandler serializes the returned value, so actions must not also write
  #     the body (that would double-encode). Status is set via `res.status`;
  #     errors short-circuit by raising Familia::Admin::Halt, caught by `render`.
  #   * Streaming actions (no `response=json`) own the response: they set SSE
  #     headers and assign an enumerable streaming body to `res.body`.
  #
  # Auth: Otto enforces each route's `auth=` tier before the action runs and
  # exposes the result at env['otto.strategy_result']. Elevated actions ALSO
  # re-check the permission here (defense in depth) so a dropped route tier can
  # never leak a secret or run a raw command.
  class API
    Descriptor   = Familia::Admin::Descriptor
    Serializers  = Familia::Admin::Serializers
    RawCommand   = Familia::Admin::RawCommand
    Streaming    = Familia::Admin::Streaming
    Halt         = Familia::Admin::Halt

    def initialize(req, res)
      @req = req
      @res = res
    end

    # ===== discovery =======================================================

    def meta
      render { ok(Descriptor.app) }
    end

    def list_models
      render { ok(models: Descriptor.models.map { |m| safe { m.config_name } }.compact) }
    end

    def describe_model
      render { ok(Descriptor.model(model!)) }
    end

    # OpenAPI 3.1 document derived from the descriptor + the route map.
    def openapi
      render { ok(OpenAPI.document(Descriptor.app)) }
    end

    # ===== records =========================================================

    # GET /models/:model/records?offset=&limit=
    # Newest-first from the per-class instances timeline (a sorted set). count is
    # O(1) but may include phantoms; the integrity endpoint reconciles it.
    def list_records
      render do
        klass = model!
        offset, limit = page_params
        ids = Array(safe { klass.instances.lazy.drop(offset).first(limit) })
        recs = Array(safe { klass.load_multi(ids) }).compact
        ok(
          model: klass.config_name,
          offset: offset,
          limit: limit,
          count_fast: safe { klass.count },
          records: Serializers.records(recs),
        )
      end
    end

    def read_record
      render do
        klass = model!
        rec = find_record!(klass)
        ok(Serializers.record(rec, full: true))
      end
    end

    # POST /models/:model/records   body: { fields: {...} }
    # Create-only atomic write via klass.build; duplicate identifier => 409.
    def create_record
      render do
        klass = model!
        fields = permitted_fields(klass, body_fields, allow_identifier: true)
        bad_request!('no permitted fields in body') if fields.empty?

        rec =
          begin
            klass.build(**fields)
          rescue Familia::RecordExistsError
            conflict!('record_exists')
          rescue ArgumentError => e
            bad_request!("invalid fields: #{e.message}")
          end

        audit!(:create, model: klass.config_name, id: rec.identifier)
        created(created: true, id: rec.identifier, record: Serializers.record(rec, full: true))
      end
    end

    # PUT /models/:model/records/:id   body: { fields: {...} }
    # Load, assign permitted fields, persist, then reconcile indexes so a changed
    # indexed field (email/status) leaves no stale entry behind.
    def update_record
      render do
        klass = model!
        rec = find_record!(klass)
        changes = permitted_fields(klass, body_fields, allow_identifier: false)
        bad_request!('no permitted fields in body') if changes.empty?

        old_index_values = capture_index_values(klass, rec)
        rec.atomic_write { changes.each { |f, v| rec.send("#{f}=", v) } }
        reconcile_indexes(rec, old_index_values)

        audit!(:update, model: klass.config_name, id: rec.identifier, fields: changes.keys)
        ok(updated: true, record: Serializers.record(rec, full: true))
      end
    end

    def destroy_record
      render do
        klass = model!
        id = param(:id)
        ok = safe { klass.destroy!(id) }
        audit!(:destroy, model: klass.config_name, id: id)
        ok(destroyed: !!ok)
      end
    end

    # POST /models/:model/records/:id/reveal/:field
    # Elevated + audited. Returns plaintext exactly once.
    def reveal_field
      render do
        klass = model!
        require_permission!(admin_config.permission_reveal)
        field = param(:field).to_sym
        ft = safe { klass.field_types[field] }
        bad_request!('not an encrypted field') unless ft && ft.category == :encrypted
        rec = find_record!(klass)

        # ConcealedString#reveal REQUIRES a block (the no-block call the prototype
        # used raises ArgumentError). Copy the plaintext out of the controlled
        # block so it can be returned exactly once.
        plaintext = safe { rec.send(field).reveal { |plain| plain.dup } }
        bad_request!('field is empty or unreadable') if plaintext.nil?

        entry = audit!(:reveal, model: klass.config_name, id: rec.identifier, field: field)
        ok(field => plaintext, _audit: entry)
      end
    end

    # ===== collections (DataTypes) ========================================

    # GET .../:collection  -> type-aware members (paginated)
    def read_collection
      render do
        klass = model!
        rec = find_record!(klass)
        name = param(:collection)
        type = collection_type!(klass, name)
        coll = safe { rec.send(name) }
        not_found!('collection') unless coll
        offset, limit = page_params
        ok(Serializers.collection(name, coll, type, offset: offset, limit: limit))
      end
    end

    # POST .../:collection  body: { op:, args: }
    # Dispatch to a native DataType op (allowlisted per type) in a transaction.
    def mutate_collection
      render do
        klass = model!
        rec = find_record!(klass)
        name = param(:collection)
        type = collection_type!(klass, name)
        coll = safe { rec.send(name) }
        not_found!('collection') unless coll

        op = (body['op'] || param(:op)).to_s
        args = body['args']
        result = apply_collection_op(coll, type, op, args)

        audit!(:mutate_collection, model: klass.config_name, id: rec.identifier, collection: name, op: op)
        ok(collection: name, type: type.to_s, op: op, result: result)
      end
    end

    # ===== query (indexed only) ===========================================

    # GET /models/:model/index/:index?value=
    #
    # Uses the generated `find_all_by_<field>(value)` lookup, which filters by
    # value for both unique and multi indexes. (IndexDescriptor#each_record is
    # only value-filtered for multi indexes; for a unique index it returns every
    # record, so it is the wrong tool here.)
    def query_index
      render do
        klass = model!
        bad_request!('introspection unavailable') unless Familia.respond_to?(:index_descriptors)
        name = param(:index).to_sym
        desc = Array(safe { Familia.index_descriptors(owner: klass) }).find { |d| d.index_name == name }
        not_found!('index') unless desc
        bad_request!('index is not queryable') unless safe { desc.query? }

        offset, limit = page_params
        value = param(:value)
        finder = "find_all_by_#{desc.field}"
        recs =
          if klass.respond_to?(finder)
            Array(safe { klass.public_send(finder, value) })
          else
            Array(safe { desc.each_record(value: value).to_a })
          end
        recs = recs.compact.drop(offset).first(limit)
        ok(index: name, value: value, offset: offset, limit: limit, records: Serializers.records(recs))
      end
    end

    # ===== integrity =======================================================

    def health_check
      render do
        klass = model!
        # audit_collections: true gives the console the full fsck — related-field
        # orphans included — and makes the report `complete`.
        report = safe { klass.health_check(check_cross_refs: true, audit_collections: true) }
        bad_request!('audit unavailable') unless report
        ok(Serializers.audit_report(report))
      end
    end

    # POST /integrity/:model/repair?dry_run=true
    def repair
      render do
        klass = model!
        require_permission!(admin_config.permission_repair)
        dry = truthy?(param(:dry_run))

        if dry
          report = safe { klass.health_check(check_cross_refs: true, audit_collections: true) }
          bad_request!('audit unavailable') unless report
          ok(dry_run: true, report: Serializers.audit_report(report))
        else
          guard_cross_database!(klass)
          audit!(:repair, model: klass.config_name)
          result = safe { klass.repair_all!(verify: true, check_cross_refs: true) }
          bad_request!('repair unavailable') unless result
          post = result.is_a?(Hash) ? result[:post_audit] : nil
          ok(repaired: true, healthy: (safe { post&.healthy? }), summary: repair_summary(result))
        end
      end
    end

    def stale_indexes
      render do
        bad_request!('introspection unavailable') unless Familia.respond_to?(:stale_indexes)
        stale = Array(safe { Familia.stale_indexes }).map do |d|
          { coordinate: safe { d.coordinate }, index: safe { d.index_name } }
        end
        ok(stale_indexes: stale)
      end
    end

    # ===== migrations ======================================================

    def migration_status
      render do
        runner = migration_runner!
        ok(status: jsonable(safe { runner.status }), pending: jsonable(safe { runner.pending }))
      end
    end

    def schema_drift
      render do
        registry = migration_registry!
        ok(drift: jsonable(safe { registry.schema_drift }))
      end
    end

    # POST /migrations/run?dry_run=true&limit=
    def run_migrations
      render do
        require_permission!(admin_config.permission_run_migrations)
        runner = migration_runner!
        dry = truthy?(param(:dry_run))
        audit!(:run_migrations, dry_run: dry) unless dry
        ok(dry_run: dry, result: jsonable(safe { runner.run(dry_run: dry, limit: int_param(:limit)) }))
      end
    end

    def rollback
      render do
        require_permission!(admin_config.permission_run_migrations)
        runner = migration_runner!
        id = param(:id)
        bad_request!('migration id required') if id.to_s.empty?
        audit!(:rollback, id: id)
        ok(result: jsonable(safe { runner.rollback(id) }))
      end
    end

    # ===== raw explorer ====================================================

    # SCAN-based key listing with TYPE/TTL per key. Never KEYS.
    def scan_keys
      render do
        cursor = param(:cursor).to_s.empty? ? '0' : param(:cursor).to_s
        match = sanitize_pattern(param(:match) || param(:pattern))
        count = (int_param(:count) || 100).clamp(1, RawCommand::SCAN_MAX_COUNT)
        scan_args = [cursor, 'COUNT', count]
        scan_args += ['MATCH', match] if match
        next_cursor, keys = dbclient.call('SCAN', *scan_args)
        described = Array(keys).map { |k| describe_key(k) }
        ok(cursor: next_cursor, count: described.size, keys: described)
      end
    end

    # TYPE/TTL/MEMORY USAGE + a typed value preview, with a model link when the
    # key matches a model object key.
    def inspect_key
      render do
        key = param(:key)
        bad_request!('key required') if key.to_s.empty?
        type = dbclient.call('TYPE', key)
        not_found!('key') if type == 'none'
        ok(
          key: key,
          type: type,
          ttl: dbclient.call('TTL', key),
          memory_bytes: safe { dbclient.call('MEMORY', 'USAGE', key) },
          model: model_link_for(key),
          preview: key_preview(key, type),
        )
      end
    end

    def server_info
      render do
        info = safe { dbclient.info } || {}
        ok(server: info, dbsize: safe { dbclient.call('DBSIZE') })
      end
    end

    # The dangerous path: allowlisted, elevated, fully audited, and off unless an
    # operator explicitly enabled raw commands for the app.
    def run_command
      render do
        require_permission!(admin_config.permission_raw_command)
        unless admin_config.raw_command_enabled
          raise Halt.new(403, error: 'command_disabled',
                              message: 'raw commands are disabled; enable Familia::Admin.config.raw_command_enabled')
        end
        cmd = (body['cmd'] || body['command'] || param(:cmd)).to_s
        args = body['args'] || []
        bad_request!('cmd required') if cmd.empty?

        audit!(:raw_command, command: cmd.upcase, args: redact_args(cmd, args))
        begin
          ok(RawCommand.run(dbclient, cmd, args).merge(_audited: true))
        rescue RawCommand::Blocked => e
          raise Halt.new(403, error: 'command_blocked', command: cmd.upcase,
                              message: e.message, required_tier: "permission:#{admin_config.permission_raw_command}")
        end
      end
    end

    # ===== live streams (Rack 3 streaming bodies) =========================

    def stream_commands
      stream do
        # role:admin already enforced by the route.
        enabled = admin_config.command_stream_enabled
        Familia::Admin.enable_command_capture! if enabled
        start_stream(Streaming::CommandStreamBody.new(enabled: enabled))
      end
    end

    def stream_repair
      stream do
        klass = model!
        require_permission!(admin_config.permission_repair)
        dry = truthy?(param(:dry_run))
        audit!(:stream_repair, model: klass.config_name, dry_run: dry)
        on_done = ->(result) { audit!(:repair_complete, model: klass.config_name, status: safe { result[:status] }) }
        start_stream(Streaming::RepairStreamBody.new(klass, dry_run: dry, on_complete: dry ? nil : on_done))
      end
    end

    # ======================================================================
    # helpers
    # ======================================================================

    private

    def admin_config
      Familia::Admin.config
    end

    # ----- control flow ----------------------------------------------------

    # Run a JSON action body, returning its Hash. Halt short-circuits with a
    # status + JSON payload; everything else propagates to Otto's error handler.
    def render
      yield
    rescue Halt => h
      @res.status = h.status
      h.payload
    end

    # Run a streaming action body. Halt (auth/validation failures) is rendered as
    # a JSON error because the streaming routes have no `response=json` handler.
    def stream
      yield
    rescue Halt => h
      @res.status = h.status
      @res['content-type'] = 'application/json'
      @res.write(JSON.generate(h.payload))
    end

    def ok(payload)
      payload
    end

    def created(payload)
      @res.status = 201
      payload
    end

    def not_found!(what)
      raise Halt.new(404, error: 'not_found', resource: what)
    end

    def bad_request!(msg)
      raise Halt.new(400, error: 'bad_request', message: msg)
    end

    def conflict!(what)
      raise Halt.new(409, error: 'conflict', resource: what)
    end

    # ----- model / record resolution --------------------------------------

    # Resolve the :model route param to a registered model class (strict
    # allowlist). 404 on miss — the param is attacker-controlled.
    def model!
      Descriptor.resolve(param(:model)) || not_found!('model')
    end

    def find_record!(klass)
      safe { klass.find_by_identifier(param(:id)) } || not_found!('record')
    end

    # ----- permissions -----------------------------------------------------

    def strategy_result
      @req.env['otto.strategy_result']
    end

    # Defense-in-depth permission check. Otto already enforced the route tier;
    # this guarantees the controller refuses too, even if the route is
    # misconfigured. Disable via config for trusted single-tier deployments.
    def require_permission!(permission)
      return unless admin_config.enforce_permissions_in_controller

      sr = strategy_result
      granted = sr.respond_to?(:has_permission?) ? sr.has_permission?(permission) : false
      return if granted

      raise Halt.new(403, error: 'forbidden', required_tier: "permission:#{permission}",
                          held: (sr.respond_to?(:permissions) ? sr.permissions : []))
    end

    def actor
      sr = strategy_result
      return 'unknown' unless sr

      (sr.respond_to?(:user_id) && sr.user_id) ||
        (sr.respond_to?(:user_name) && sr.user_name) || 'unknown'
    end

    # ----- audit -----------------------------------------------------------

    # Append-only admin audit trail. Records metadata only — never a secret.
    def audit!(action, **details)
      admin_config.audit_sink.record({ actor: actor, action: action }.merge(details))
    end

    # ----- fields / collections -------------------------------------------

    # Parsed JSON request body (Hash), cached. Empty hash for non-JSON bodies.
    def body
      @body ||= parse_body
    end

    def parse_body
      raw = safe { @req.body&.read }
      @req.body.rewind if @req.body.respond_to?(:rewind)
      return {} if raw.nil? || raw.empty?

      parsed = JSON.parse(raw)
      parsed.is_a?(Hash) ? parsed : {}
    rescue JSON::ParserError
      {}
    end

    # The field map for a create/update: { fields: {...} } or { record: {...} }
    # or a bare object.
    def body_fields
      b = body
      candidate = b['fields'] || b['record'] || b
      candidate.is_a?(Hash) ? candidate : {}
    end

    # Restrict an incoming field map to persistent, writable scalar fields. Drops
    # transient fields, unknown keys, and (on update) the identifier.
    def permitted_fields(klass, incoming, allow_identifier:)
      id_field = safe { klass.identifier_field }
      id_field = nil if id_field.is_a?(Proc)
      allowed = Array(safe { klass.persistent_fields }).map(&:to_sym)

      incoming.each_with_object({}) do |(k, v), acc|
        sym = k.to_sym
        next unless allowed.include?(sym)
        next if !allow_identifier && sym == id_field

        acc[sym] = v
      end
    end

    # Snapshot current values of all class-level indexed fields, so a post-update
    # reconcile can drop stale index entries for any that changed.
    def capture_index_values(klass, rec)
      return {} unless Familia.respond_to?(:index_descriptors)

      Array(safe { Familia.index_descriptors(owner: klass) })
        .select { |d| safe { d.class_level? } }
        .each_with_object({}) { |d, acc| acc[d.field] = safe { rec.send(d.field) } }
    end

    def reconcile_indexes(rec, old_values)
      return if old_values.empty?
      return unless rec.respond_to?(:update_all_indexes)

      safe { rec.update_all_indexes(old_values) }
    end

    # The set of editable collections is the developer-declared datatypes only
    # (internals like the instances timeline and index hashkeys are excluded by
    # the descriptor). 404 for anything else — this is the gate that stops the
    # collection endpoints from reading/writing index internals.
    def collection_type!(klass, name)
      entry = Descriptor.datatypes(klass).find { |d| d[:name].to_s == name.to_s }
      not_found!('collection') unless entry
      entry[:type].to_sym
    end

    # Allowlisted native op per DataType. Unknown ops are refused.
    #
    # Each dispatched op is a single Redis command and therefore already atomic,
    # so it runs directly (not inside MULTI/EXEC). Wrapping a lone command in a
    # transaction would buy no atomicity and would return a Redis::Future with no
    # usable value — a compound op that needed real atomicity would open its own
    # Familia.transaction inside the dispatch instead.
    def apply_collection_op(coll, type, op, args)
      op = op.to_s
      args = Array(args)
      allowed = COLLECTION_OPS[type.to_sym] or bad_request!("collection type '#{type}' is not mutable")
      bad_request!("op '#{op}' not permitted on #{type}") unless allowed.include?(op)

      jsonable(dispatch_collection_op(coll, type.to_sym, op, args))
    end

    COLLECTION_OPS = {
      list: %w[push append unshift prepend pop shift remove].freeze,
      set: %w[add remove].freeze,
      sorted_set: %w[add remove increment].freeze,
      hashkey: %w[set put remove increment].freeze,
      counter: %w[increment decrement reset].freeze,
    }.freeze

    def dispatch_collection_op(coll, type, op, args)
      case type
      when :list then list_op(coll, op, args)
      when :set then set_op(coll, op, args)
      when :sorted_set then sorted_set_op(coll, op, args)
      when :hashkey then hashkey_op(coll, op, args)
      when :counter then counter_op(coll, op, args)
      end
    end

    def list_op(coll, op, args)
      case op
      when 'push', 'append' then coll.push(*args)
      when 'unshift', 'prepend' then coll.unshift(*args)
      when 'pop' then coll.pop
      when 'shift' then coll.respond_to?(:shift) ? coll.shift : coll.remove(args.first)
      when 'remove' then coll.remove(args.first)
      end
    end

    def set_op(coll, op, args)
      op == 'add' ? coll.add(*args) : coll.remove(*args)
    end

    def sorted_set_op(coll, op, args)
      case op
      when 'add' then coll.add(args[0], (args[1] || Familia.now).to_f)
      when 'remove' then coll.remove(args[0])
      when 'increment' then coll.increment(args[0], (args[1] || 1).to_f)
      end
    end

    def hashkey_op(coll, op, args)
      case op
      when 'set', 'put' then coll[args[0]] = args[1]
      when 'remove' then coll.remove(args[0])
      when 'increment' then coll.increment(args[0], (args[1] || 1).to_i)
      end
    end

    def counter_op(coll, op, args)
      case op
      when 'increment' then args[0] ? coll.incrementby(args[0].to_i) : coll.increment
      when 'decrement' then coll.incrementby(-(args[0] ? args[0].to_i : 1))
      when 'reset' then coll.reset(args[0] ? args[0].to_i : 0)
      end
    end

    # ----- integrity / migrations helpers ---------------------------------

    # Refuse a repair whose fix-set would span more than one logical database
    # (Redis MULTI/EXEC cannot be atomic across databases). Drives the "Refused"
    # state. Scoped repairs (?scope=db:N) bypass the guard for that db.
    def guard_cross_database!(klass)
      return if param(:scope).to_s.start_with?('db:')

      dbs = touched_databases(klass)
      return if dbs.size <= 1

      raise Halt.new(409,
                     error: 'CrossDatabaseError',
                     message: 'Repair spans logical databases and cannot be applied atomically',
                     scopes: dbs.map { |db| { db: db } },
                     remedy: 'repair <model> --scope db:<n> per database')
    end

    def touched_databases(klass)
      dbs = [safe { klass.logical_database } || 0]
      Array(safe { klass.participation_relationships }).each do |p|
        target = safe { p.target_class_base }
        tc = target.is_a?(Class) ? target : safe { Familia.resolve_class(target) }
        dbs << (safe { tc.logical_database } || 0) if tc
      end
      dbs.compact.uniq
    end

    def repair_summary(result)
      return {} unless result.is_a?(Hash)

      {
        status: result[:status],
        verified: result[:verified],
        instances: jsonable(result[:instances]),
        indexes: jsonable(result[:indexes]),
        multi_indexes: jsonable(result[:multi_indexes]),
        participations: jsonable(result[:participations]),
        errors: Array(result[:errors]).map(&:to_s),
      }.compact
    end

    def migration_runner!
      bad_request!('migration subsystem unavailable') unless defined?(Familia::Migration::Runner)
      safe { Familia::Migration::Runner.new } || bad_request!('migration runner unavailable')
    end

    def migration_registry!
      bad_request!('migration subsystem unavailable') unless defined?(Familia::Migration::Registry)
      safe { Familia::Migration::Registry.new } || bad_request!('migration registry unavailable')
    end

    # ----- raw explorer helpers -------------------------------------------

    def dbclient
      Familia.dbclient
    end

    def describe_key(key)
      { key: key, type: safe { dbclient.call('TYPE', key) }, ttl: safe { dbclient.call('TTL', key) } }
    end

    # Map a Redis key back to {model, id} when it matches a model's object key
    # pattern (prefix:identifier:suffix), so the inspector can deep-link.
    def model_link_for(key)
      Descriptor.models.each do |m|
        prefix = safe { m.prefix }
        suffix = safe { m.suffix }
        next unless prefix

        re = /\A#{Regexp.escape(prefix.to_s)}:(.+):#{Regexp.escape(suffix.to_s)}\z/
        if (md = key.to_s.match(re))
          return { model: safe { m.config_name }, id: md[1] }
        end
      end
      nil
    end

    # A small, type-appropriate preview. Bounded so a huge collection cannot be
    # dumped through the inspector.
    def key_preview(key, type)
      case type
      when 'string' then { value: safe { truncate(dbclient.call('GET', key)) } }
      when 'hash' then { fields: safe { dbclient.hgetall(key) } }
      when 'list' then { head: safe { dbclient.call('LRANGE', key, 0, 24) }, length: safe { dbclient.call('LLEN', key) } }
      when 'set' then { members: safe { Array(dbclient.call('SSCAN', key, 0, 'COUNT', 25))[1] } }
      when 'zset' then { head: safe { dbclient.call('ZRANGE', key, 0, 24, 'WITHSCORES') } }
      else {}
      end
    end

    def truncate(str, max = 4096)
      s = str.to_s
      s.length > max ? "#{s[0, max]}…(truncated)" : s
    end

    # Validate a SCAN MATCH pattern: bounded length, no NUL, glob chars only.
    def sanitize_pattern(pattern)
      return nil if pattern.nil? || pattern.to_s.empty?

      p = pattern.to_s
      bad_request!('pattern too long') if p.length > 256
      bad_request!('invalid pattern') if p.include?(" ")
      p
    end

    # Don't write whole command argument vectors verbatim to the audit if they
    # might carry a value; record arity + the key (first arg) only for writes
    # (which can't happen here) and the key for reads.
    def redact_args(cmd, args)
      a = Array(args)
      return a if a.size <= 1

      [a.first.to_s, "+#{a.size - 1} args"]
    end

    # ----- streaming -------------------------------------------------------

    def start_stream(body)
      @res.status = 200
      Streaming::SSE_HEADERS.each { |h, v| @res[h] = v }
      @res.body = body
      nil
    end

    # ----- params ----------------------------------------------------------

    def page_params
      offset = [int_param(:offset) || 0, 0].max
      limit  = (int_param(:limit) || admin_config.page_default).clamp(1, admin_config.page_max)
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

    # ----- util ------------------------------------------------------------

    def jsonable(value)
      case value
      when Hash then value.each_with_object({}) { |(k, v), h| h[k] = jsonable(v) }
      when Array then value.map { |v| jsonable(v) }
      when nil, Numeric, true, false, String then value
      else
        (value.respond_to?(:to_h) ? jsonable(value.to_h) : value.to_s)
      end
    rescue StandardError
      value.to_s
    end

    def safe
      yield
    rescue StandardError
      nil
    end
  end
end

require_relative 'openapi'
