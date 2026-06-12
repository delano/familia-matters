# frozen_string_literal: true

require 'json'
require_relative 'descriptor'
require_relative 'util'

# Admin::API
#
# Thin Otto controller wiring the routes file to Familia's runtime introspection,
# integrity, and migration APIs. Otto instantiates this per request with
# (req, res) and calls the action named in the route.
#
# Response contract: every `response=json` route returns a BARE Ruby Hash. Otto's
# JSONHandler serializes a returned Hash verbatim (no success/data envelope), so
# the frontend reads bare fields (res.records, res.count_fast, ...). The #json
# helper therefore sets the status and RETURNS the hash; it never writes the body
# itself. Stream routes (no response=json) own the Rack body directly.
#
# The auth tier is enforced by Otto from the route file BEFORE the action runs;
# this class assumes the request already passed that gate and reads the
# authenticated context from env['otto.strategy_result'].
module Admin
  class API
    include Familia::Admin::Util

    PAGE_DEFAULT = 50
    PAGE_MAX     = 500

    # Upper bound on the number of elements run_command returns for an Array/Hash
    # result. The raw explorer is permission-gated, but an unbounded read
    # (LRANGE 0 -1 over a huge list, HGETALL of a giant hash) is a memory DoS
    # primitive; cap it and flag truncation, mirroring typed_value_preview.
    RUN_COMMAND_RESULT_MAX = 1000

    # run_command allowlist. Read-only commands only. Anything not here is
    # denied outright (403 command_blocked); there is no override parameter.
    READ_ONLY_COMMANDS = %w[
      GET TYPE TTL PTTL SCAN HSCAN SSCAN ZSCAN HGETALL HGET HKEYS HVALS HLEN
      LRANGE LLEN ZRANGE ZREVRANGE ZCARD ZSCORE ZRANGEBYSCORE SMEMBERS SCARD
      SISMEMBER INFO DBSIZE MEMORY EXISTS OBJECT STRLEN GETRANGE RANDOMKEY
      PING ECHO LINDEX HEXISTS ZRANK ZREVRANK ZCOUNT
    ].freeze

    # Never executable, regardless of permission. Destructive or capable of
    # blocking/altering the server.
    HARD_DENY_COMMANDS = %w[
      KEYS FLUSHALL FLUSHDB CONFIG SHUTDOWN DEBUG SAVE BGSAVE BGREWRITEAOF
      MIGRATE SCRIPT EVAL EVALSHA FUNCTION SLAVEOF REPLICAOF CLUSTER FAILOVER
    ].freeze

    # Collection mutation ops the admin may dispatch. Maps the wire op name to a
    # native DataType method; the value is the arity contract enforced below.
    COLLECTION_OPS = %w[add push unshift remove remove_element increment set].freeze

    def initialize(req, res)
      @req = req
      @res = res
    end

    # ----- discovery -------------------------------------------------------

    def meta
      json(Familia::Admin::Descriptor.app)
    end

    def list_models
      json({ models: Familia::Admin::Descriptor.models.map(&:name) })
    end

    def describe_model
      klass = resolve_model! or return not_found('model')
      json(Familia::Admin::Descriptor.model(klass))
    end

    # Generate an OpenAPI 3.1 document from the descriptor. Left as a TODO so the
    # team can pin its preferred schema conventions; the descriptor already
    # carries every field/type/index needed to emit paths and component schemas.
    def openapi
      json({ error: 'not_implemented', hint: 'derive from Descriptor.app' })
    end

    # ----- records ---------------------------------------------------------

    # GET /models/:model/records?offset=&limit=
    # Lists newest-first from the per-class instances timeline (a sorted set).
    def list_records
      klass = resolve_model! or return not_found('model')
      offset, limit = page_params
      # instances is the per-class sorted set timeline. Cursor iteration avoids
      # loading the whole keyspace. count is O(1) but may include phantoms; use
      # the integrity endpoint for an authoritative reconciliation.
      ids = Array(safe { klass.instances.lazy.drop(offset).first(limit) })
      records = Array(safe { klass.load_multi(ids) }).compact
      json({
        model: klass.config_name,
        offset: offset,
        limit: limit,
        count_fast: safe { klass.count },
        records: records.map { |r| serialize(r) },
      })
    end

    def read_record
      klass = resolve_model! or return not_found('model')
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec
      json(serialize(rec, full: true))
    end

    # POST /models/:model/records   body: {fields: {...}}
    # Atomic create-only via klass.build(**permitted_fields). build raises
    # RecordExistsError when the identifier is taken; surface that as 409 instead
    # of letting it collapse to a generic error.
    def create_record
      klass = resolve_model! or return not_found('model')
      fields = permitted_fields(klass, body_fields)
      return bad_request('no fields given') if fields.empty?

      # Server stamps creation timestamps so the client cannot forge them. Only
      # set fields the model actually declares (ApiKey has no updated_at). Same
      # build() path so they persist and indexes stay consistent.
      now = Familia.now.to_i
      persistent = Array(safe { klass.persistent_fields })
      fields[:created_at] = now if persistent.include?(:created_at)
      fields[:updated_at] = now if persistent.include?(:updated_at)

      rec =
        begin
          klass.build(**fields)
        rescue Familia::RecordExistsError
          return json({ error: 'record_exists' }, status: 409)
        rescue StandardError => e
          return bad_request("create failed: #{e.message}")
        end

      audit!(:create, model: klass.config_name, id: identifier_of(rec))
      # Top-level shape satisfies both res.record/res.created (it IS the record)
      # and res.count_fast for the list-count bump.
      json(serialize(rec, full: true).merge(count_fast: safe { klass.count }))
    end

    # PUT /models/:model/records/:id   body: {fields: {...}}
    # Load, assign permitted fields, persist field+index changes via the
    # instance's atomic_write (single MULTI/EXEC for HMSET + index bookkeeping).
    def update_record
      klass = resolve_model! or return not_found('model')
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec
      fields = permitted_fields(klass, body_fields)
      # The URL :id already identifies the record. The body must not be able to
      # rewrite the identifier field (it would redirect the HMSET onto another
      # record's key and corrupt identity/indexes) nor forge created_at (the
      # server owns it, exactly as create does). Drop both before persisting.
      idf = safe { klass.identifier_field }
      fields.delete(idf.to_sym) if idf.is_a?(Symbol) || idf.is_a?(String)
      fields.delete(:created_at)
      return bad_request('no fields given') if fields.empty?

      # Reject a unique-index field change (e.g. moving this record onto another's
      # email) that would collide with a DIFFERENT record. Mirrors create's
      # uniqueness contract; without it the write silently hijacks the index.
      return json({ error: 'record_exists' }, status: 409) if unique_index_conflict(klass, fields, param(:id))

      # Server re-stamps updated_at on every update; created_at is left intact.
      bump_updated = Array(safe { klass.persistent_fields }).include?(:updated_at)
      now = Familia.now.to_i

      begin
        # Assignments inside the block stay in memory until persist_to_storage
        # runs the HMSET inside the transaction; index updates ride along.
        rec.atomic_write do
          fields.each { |name, value| rec.send("#{name}=", value) }
          rec.updated_at = now if bump_updated
        end
      rescue StandardError => e
        return bad_request("update failed: #{e.message}")
      end

      audit!(:update, model: klass.config_name, id: param(:id))
      json(serialize(rec, full: true))
    end

    def destroy_record
      klass = resolve_model! or return not_found('model')
      ok = safe { klass.destroy!(param(:id)) }
      audit!(:destroy, model: klass.config_name, id: param(:id))
      json({ destroyed: !!ok, count_fast: safe { klass.count } })
    end

    # POST /models/:model/records/:id/reveal/:field
    # Elevated (permission:reveal_secrets) and audited. Returns the plaintext;
    # the field is re-revealable (reloaded from the store), and every call is
    # independently audited.
    def reveal_field
      klass = resolve_model! or return not_found('model')
      field = param(:field).to_sym
      ft = safe { klass.field_types[field] }
      return bad_request('not an encrypted field') unless ft && ft.category == :encrypted
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec
      # ConcealedString#reveal REQUIRES a block; the plaintext is yielded.
      value = safe { rec.send(field).reveal { |v| v } }
      entry = audit!(:reveal, model: klass.config_name, id: param(:id), field: field)
      json({ field => value, _audit: entry })
    end

    # ----- collections (DataTypes) ----------------------------------------

    # GET .../:collection  -> paginated members via the DataType's Enumerable API
    def read_collection
      klass = resolve_model! or return not_found('model')
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec
      coll = collection_for(klass, rec)
      return not_found('collection') unless coll
      offset, limit = page_params
      members = Array(safe { coll.lazy.drop(offset).first(limit) })
      json({ collection: param(:collection), offset: offset, limit: limit, members: members })
    end

    # POST .../:collection  body: {op:, args:}
    # Dispatch an allowlisted op to the native DataType method. A single DataType
    # op is already one atomic Redis command, so we mutate first, then read the
    # post-mutation state (reads inside a transaction return Redis::Future).
    def mutate_collection
      klass = resolve_model! or return not_found('model')
      rec = safe { klass.find_by_identifier(param(:id)) }
      return not_found('record') unless rec
      coll = collection_for(klass, rec)
      return not_found('collection') unless coll

      body = body_json
      op   = body['op'].to_s
      args = Array(body['args'])
      return bad_request("unknown op: #{op.inspect}") unless COLLECTION_OPS.include?(op)

      begin
        dispatch_collection_op(coll, op, args)
      rescue StandardError => e
        return bad_request("mutation failed: #{e.message}")
      end

      audit!(:mutate_collection, model: klass.config_name, id: param(:id),
             collection: param(:collection), op: op)

      size    = safe { coll.size }
      members = Array(safe { coll.lazy.first(PAGE_MAX) })
      json({ collection: param(:collection), op: op, size: size, members: members })
    end

    # ----- query (indexed only) -------------------------------------------

    # GET /models/:model/index/:index?value=
    # Walks the records behind an index via IndexDescriptor#each_record. When the
    # requested field has no queryable index, returns the scan_required contract
    # so the frontend's scan gate fires; forcing past the gate is an explicit
    # error, because there is no scan backend. The old behavior fabricated
    # {forced: true, records: []} -- an empty success an operator reads as
    # "no matching records" -- which is a lie (T5).
    def query_index
      klass = resolve_model! or return not_found('model')
      name  = (param(:index) || param(:field)).to_s

      desc = indexed_descriptor(klass, name)
      unless desc
        if truthy?(param(:force))
          return json({
            error: 'scan_unavailable',
            message: "no queryable index for '#{name}'; ad-hoc scans are not supported",
          }, status: 400)
        end
        return json({
          error: 'scan_required',
          hint: 'add an index; ad-hoc scans are unavailable',
          estimated_rows: safe { klass.count } || 0,
        })
      end

      offset, limit = page_params
      value = param(:value)
      # UNIQUE index: each_record on a class-level unique index returns the WHOLE
      # backing hashkey and ignores value:, leaking every record. Resolve the
      # single record through the generated find_by_<field> finder instead.
      # MULTI index: the _for(value) bucket already filters, so keep each_record.
      recs =
        if desc.unique?
          # find_by_<field> returns a single record or nil. Wrap with [rec] --
          # NOT Array(rec): a Horreum is Enumerable, so Array() would splat its
          # field values into a bogus multi-element list.
          rec = safe { klass.public_send("find_by_#{desc.field}", value) }
          [rec].compact.drop(offset).first(limit)
        else
          Array(safe { desc.each_record(value: value).lazy.drop(offset).first(limit) }).compact
        end
      json({ index: name, value: value, records: recs.map { |r| serialize(r) } })
    end

    # ----- integrity -------------------------------------------------------

    def health_check
      klass = resolve_model! or return not_found('model')
      report = safe { klass.health_check(check_cross_refs: true) }
      return bad_request('audit unavailable') unless report
      json(report.to_h)
    end

    # POST /integrity/:model/repair?dry_run=true
    def repair
      klass = resolve_model! or return not_found('model')
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
      json({ stale_indexes: stale })
    end

    # ----- migrations ------------------------------------------------------

    def migration_status
      runner = safe { Familia::Migration::Runner.new }
      json({ status: safe { runner&.status } })
    end

    def schema_drift
      registry = safe { Familia::Migration::Registry.new }
      json({ drift: safe { registry&.schema_drift } })
    end

    # POST /migrations/run?dry_run=true&limit=
    def run_migrations
      runner = safe { Familia::Migration::Runner.new }
      return bad_request('migration runner unavailable') unless runner
      dry = truthy?(param(:dry_run))
      audit!(:run_migrations, dry_run: dry) unless dry
      json({ result: safe { runner.run(dry_run: dry, limit: int_param(:limit)) } })
    end

    def rollback
      runner = safe { Familia::Migration::Runner.new }
      return bad_request('migration runner unavailable') unless runner
      audit!(:rollback, id: param(:id))
      json({ result: safe { runner.rollback(param(:id)) } })
    end

    # ----- raw explorer ----------------------------------------------------

    # GET /raw/keys?pattern&type&cursor
    # Production-safe SCAN cursor iteration (NEVER KEYS). Per key: TYPE + TTL, and
    # a model/id mapping when the key matches a known class key pattern.
    def scan_keys
      pattern = param(:pattern).to_s
      pattern = '*' if pattern.empty?
      type_filter = param(:type).to_s
      cursor = (param(:cursor) || '0').to_s
      client = Familia.dbclient

      next_cursor, raw_keys = client.scan(cursor, match: pattern, count: 200)
      scanned = raw_keys.size
      keys = []
      raw_keys.each do |k|
        ktype = safe { client.type(k) }
        next if !type_filter.empty? && ktype != type_filter
        entry = { key: k, type: ktype, ttl: safe { client.ttl(k) } }
        if (mapped = map_key_to_model(k))
          entry[:model] = mapped[:model]
          entry[:id]    = mapped[:id]
        end
        keys << entry
      end

      json({ keys: keys, cursor: next_cursor, scanned: scanned, matched: keys.size })
    end

    # GET /raw/key?key=
    # TYPE/TTL + a typed value preview (and MEMORY USAGE when available).
    def inspect_key
      key = param(:key).to_s
      return bad_request('key required') if key.empty?
      client = Familia.dbclient
      ktype = safe { client.type(key) }
      return not_found('key') if ktype.nil? || ktype == 'none'

      out = {
        key: key,
        type: ktype,
        ttl: safe { client.ttl(key) },
        db: safe { client.connection[:db] },
        memory: safe { client.memory('usage', key) },
        value: typed_value_preview(client, key, ktype),
      }
      if (mapped = map_key_to_model(key))
        out[:model] = mapped[:model]
        out[:id]    = mapped[:id]
        # The raw hgetall preview would otherwise expose the at-rest encrypted
        # value, bypassing serialize()'s [CONCEALED] mask, on a role:admin (NOT
        # permission:reveal_secrets) route. Redact encrypted-category fields so
        # the raw path matches the structured path's confidentiality contract.
        mask_encrypted_fields!(out[:value], mapped[:model]) if ktype == 'hash' && out[:value].is_a?(Hash)
      end
      json(out)
    end

    # GET /raw/info -> Familia.dbclient.info parsed into sections.
    def server_info
      raw = safe { Familia.dbclient.info } || {}
      json({
        server:   info_subset(raw, %w[redis_version redis_mode os arch_bits uptime_in_seconds tcp_port run_id]),
        memory:   info_subset(raw, %w[used_memory used_memory_human used_memory_peak_human maxmemory maxmemory_policy mem_fragmentation_ratio]),
        clients:  info_subset(raw, %w[connected_clients blocked_clients maxclients]),
        stats:    info_subset(raw, %w[total_connections_received total_commands_processed instantaneous_ops_per_sec keyspace_hits keyspace_misses expired_keys evicted_keys]),
        keyspace: raw.select { |k, _| k.to_s.start_with?('db') },
      })
    end

    # POST /raw/command  body: {cmd, args}
    # THE DANGEROUS PATH. Read-only commands only; anything else is denied.
    # There is NO escalation parameter: the old override body key was never
    # consulted by the allowlist check, so echoing it back implied an
    # escalation that did not exist -- removed end-to-end in T5 (request,
    # audit entry, response). Every executed command is audited.
    def run_command
      body  = body_json
      cmd   = body['cmd'].to_s.strip.upcase
      args  = Array(body['args'])
      return bad_request('cmd required') if cmd.empty?

      # READ-ONLY ONLY. Anything not in the read allowlist is hard-denied
      # regardless of permission -- this closes the audit-log erasure/forgery
      # and data-corruption paths through the raw explorer. The allowlist
      # already enumerates every permitted read, so there is no elevated write
      # path. The deny returns BEFORE any audit so a blocked command leaves no
      # trace it ran.
      allowed = READ_ONLY_COMMANDS.include?(cmd)
      unless allowed
        return json({ error: 'command_blocked', required_tier: 'permission:raw_command' }, status: 403)
      end

      result =
        begin
          Familia.dbclient.call([cmd, *args])
        rescue StandardError => e
          return bad_request("command failed: #{e.message}")
        end

      # Bound an oversized collection result so an allowlisted read cannot be
      # turned into a memory DoS (LRANGE 0 -1, HGETALL of a huge hash). Scalars
      # pass through untouched.
      truncated = false
      if result.is_a?(Array) && result.size > RUN_COMMAND_RESULT_MAX
        result = result.first(RUN_COMMAND_RESULT_MAX)
        truncated = true
      elsif result.is_a?(Hash) && result.size > RUN_COMMAND_RESULT_MAX
        result = result.first(RUN_COMMAND_RESULT_MAX).to_h
        truncated = true
      end

      audit!(:run_command, cmd: cmd, args: args)
      json({ cmd: cmd, args: args, result: result, simulated: false, truncated: truncated })
    end

    # ----- live streams (Rack 3 streaming bodies) -------------------------
    #
    # The live command stream was removed (T5): its per-request
    # Familia::Instrumentation.on_command hook could never be unregistered
    # (permanent closure accumulation), boot never enabled command capture (the
    # stream emitted only heartbeats), and each open connection pinned a Puma
    # worker for 25 seconds.

    # GET /admin/api/stream/repair/:model (NOT response=json). Emits repair
    # progress as SSE matching resources/00-assets/fixtures/stream_repair.sample.jsonl:
    # a start event, a {phase,current,total,...} event per phase derived from the
    # health_check report, then a done event with a summary.
    def stream_repair
      klass = resolve_model!
      sse_headers!
      unless klass
        @res.body = sse_static('error', { error: 'not_found', resource: 'model' })
        return
      end
      audit!(:repair, model: klass.config_name, via: 'stream')

      @res.body = SSEBody.new do |emit|
        emit.call(sse_event(nil, { event: 'start', model: klass.familia_name, dry_run: false, at: Time.now.to_i }))

        report  = safe { klass.health_check(check_cross_refs: true) }
        summary = {}
        phases  = repair_phases(report)
        phases.each do |ph|
          emit.call(sse_event(nil, ph))
          (ph[:result] || {}).each { |k, v| summary[k] = (summary[k] || 0) + v.to_i if v.is_a?(Numeric) }
        end

        # done.healthy MUST track the SAME signal GET /integrity/:model reports,
        # which is report.healthy?. The old phase-fallback diverged on clean data
        # (instances/cross_references sections carry non-problem keys, so
        # phases.all?{empty?} was false even when healthy) and fabricated true
        # when the report was unreachable (all phases empty). When the report is
        # absent, health_check itself returns bad_request, so false is correct.
        healthy = report.respond_to?(:healthy?) ? !!report.healthy? : false
        emit.call(sse_event(nil, { event: 'done', healthy: healthy, at: Time.now.to_i, summary: summary }))
      end
    end

    # ======================================================================
    # helpers
    # ======================================================================

    private

    # Returns the resolved model class, or nil. Callers MUST do
    # `klass = resolve_model! or return not_found('model')` -- this method no
    # longer writes the 404 itself, because #json now only sets status and
    # returns a hash, so a side-effect 404 would be discarded (the action would
    # return nil and JSONHandler would emit {success:true} with a 404 status).
    def resolve_model!
      name = param(:model)
      # resolve_class snake_cases the name and looks it up in Familia.members;
      # member_by_config_name is private in Familia 2.10, so calling it here
      # only produced a NoMethodError that safe{} would log on every request.
      safe { Familia.resolve_class(name) }
    end

    # Admin serializer: all persistent fields, encrypted masked, transient omitted.
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

    # Filter an incoming {fields:{...}} hash down to the model's writable
    # persistent fields. Encrypted fields ARE writable (you can set a new secret);
    # transient fields are dropped (never persisted).
    def permitted_fields(klass, fields)
      return {} unless fields.is_a?(Hash)
      writable = {}
      Array(safe { klass.persistent_fields }).each do |f|
        ft = safe { klass.field_types[f] }
        next if ft && ft.category == :transient
        key = fields.key?(f.to_s) ? f.to_s : (fields.key?(f.to_sym) ? f.to_sym : nil)
        next unless key
        writable[f.to_sym] = fields[key]
      end
      writable
    end

    # Resolve the :collection path segment to a record's DataType, but ONLY if
    # it names a declared INSTANCE-level relation. The segment is attacker
    # controlled and was previously sent straight to rec.send, letting a path
    # like .../records/:id/destroy! invoke any instance method (delete!, clear,
    # save). Allowlisting against related_fields confines it to real collections;
    # class-level related fields (the instances timeline, unique-index zsets) are
    # excluded on purpose so the index/timeline cannot be tampered through here.
    def collection_for(klass, rec)
      name = param(:collection).to_s
      allowed = Array(safe { klass.related_fields&.keys }).map(&:to_s)
      return nil unless allowed.include?(name)
      safe { rec.send(name) }
    end

    # Dispatch one allowlisted collection op to its native DataType method.
    def dispatch_collection_op(coll, op, args)
      case op
      when 'add'
        # sorted_set add takes (member, score); list/set add takes value(s).
        coll.respond_to?(:add) ? coll.add(*args) : coll.push(*args)
      when 'push'      then coll.push(*args)
      when 'unshift'   then coll.unshift(*args)
      when 'remove', 'remove_element'
        coll.remove(args.first)
      when 'increment'
        # hashkey: increment(field, by); sorted_set/counter: increment(member|by).
        coll.increment(*args)
      when 'set'
        # hashkey field=>value via []= (aliased store/put).
        coll.store(args[0], args[1])
      else
        raise ArgumentError, "unsupported op: #{op}"
      end
    end

    # Best-effort key -> {model, id} mapping using each known class's key pattern.
    def map_key_to_model(key)
      Array(safe { Familia.members }).each do |klass|
        id = safe { klass.extract_identifier_from_key(key) }
        return { model: klass.config_name, id: id } if id && !id.empty?
      end
      nil
    end

    # Redact encrypted-category fields in a raw hash preview so the raw explorer
    # honors the same [CONCEALED] contract serialize() enforces. hgetall returns
    # string keys; the at-rest value is ciphertext, but exposing it through a
    # role:admin (not permission:reveal_secrets) route is the inconsistency we
    # close here.
    def mask_encrypted_fields!(hash, model_name)
      klass = safe { Familia.resolve_class(model_name) }
      return unless klass
      Array(safe { klass.persistent_fields }).each do |f|
        ft = safe { klass.field_types[f] }
        next unless ft && ft.category == :encrypted
        [f.to_s, f.to_sym].each { |k| hash[k] = '[CONCEALED]' if hash.key?(k) }
      end
    end

    # A small typed preview of a key's value, bounded so we never dump huge keys.
    def typed_value_preview(client, key, ktype)
      case ktype
      when 'string' then safe { client.get(key) }
      when 'list'   then safe { client.lrange(key, 0, 24) }
      when 'set'    then safe { client.sscan(key, 0, count: 25)[1] }
      when 'zset'   then safe { client.zrange(key, 0, 24, with_scores: true) }
      when 'hash'   then safe { client.hgetall(key) }
      else safe { client.type(key) }
      end
    end

    # Parse the parsed-INFO hash (redis-rb returns a Hash) down to a subset.
    def info_subset(raw, keys)
      keys.each_with_object({}) { |k, h| h[k] = raw[k] if raw.key?(k) }
    end

    # Build the per-phase progress events for stream_repair from a health_check
    # report. The report's exact shape varies, so we read defensively and always
    # emit the fixture's phase set even when a section is clean.
    def repair_phases(report)
      h = safe { report.respond_to?(:to_h) ? report.to_h : report } || {}
      total = safe { h[:instances] && h[:instances][:total] } || safe { h['total'] } || 0
      [
        { phase: 'instances',       current: total, total: total, result: count_result(h, :instances) },
        { phase: 'unique_indexes',  current: 1, total: 1, result: count_result(h, :unique_indexes) },
        { phase: 'multi_indexes',   current: 1, total: 1, result: count_result(h, :multi_indexes) },
        { phase: 'participations',  current: 1, total: 1, result: count_result(h, :participations) },
        { phase: 'cross_references', current: 1, total: 1, result: count_result(h, :cross_references) },
      ]
    end

    def count_result(h, section)
      v = h[section] || h[section.to_s]
      v.is_a?(Hash) ? v.reject { |k, _| %i[total current].include?(k.to_sym) rescue false } : {}
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

    # body_json comes from Familia::Admin::Util (shared with Admin::Sessions).

    # The {fields:{...}} envelope for create/update.
    def body_fields
      f = body_json['fields']
      f.is_a?(Hash) ? f : {}
    end

    def identifier_of(rec)
      safe { rec.identifier } || safe { rec.send(rec.class.identifier_field) }
    end

    # True when one of the changed fields is a UNIQUE index whose new value
    # already resolves to a DIFFERENT record -- i.e. the update would hijack
    # another record's unique-index slot. Enumerates the same descriptors the
    # query path uses. Returns the offending descriptor (truthy) or nil.
    def unique_index_conflict(klass, fields, id)
      return nil unless Familia.respond_to?(:index_descriptors)
      Array(safe { Familia.index_descriptors(owner: klass) }).find do |d|
        next false unless safe { d.unique? }
        f = safe { d.field }
        next false unless f && fields.key?(f.to_sym)
        other = safe { klass.public_send("find_by_#{f}", fields[f.to_sym]) }
        other && identifier_of(other).to_s != id.to_s
      end
    end

    def indexed_descriptor(klass, name)
      return nil unless Familia.respond_to?(:index_descriptors)
      key = name.to_s
      Array(safe { Familia.index_descriptors(owner: klass) }).find do |d|
        d.index_name.to_s == key || safe { d.field }.to_s == key
      end
    end

    # The authenticated admin, from Otto's auth layer.
    def strategy_result
      @req.env['otto.strategy_result']
    end

    def actor
      sr = strategy_result
      sr && sr.respond_to?(:user_id) ? sr.user_id : 'unknown'
    end

    # Whether the route-granted token carries an elevated permission. Read only
    # from the verified strategy result -- NEVER from any client envelope tier.
    def actor_permission?(name)
      sr = strategy_result
      !!(sr && sr.respond_to?(:has_permission?) && sr.has_permission?(name))
    end

    # Append-only admin audit trail, persisted to the Phase-0 sink.
    def audit!(action, **details)
      entry = Familia::Admin::AuditLog.record(actor: actor, action: action, **details)
      warn("[familia-admin audit] #{entry.to_json}") if Familia.debug?
      entry
    end

    # json (status + bare-hash return) and safe (logging exception guard) come
    # from Familia::Admin::Util; see util.rb for the Otto JSONHandler contract
    # and the T4 truth-telling policy.

    def not_found(what)
      json({ error: 'not_found', resource: what }, status: 404)
    end

    def bad_request(msg)
      json({ error: 'bad_request', message: msg }, status: 400)
    end

    # ----- SSE plumbing ----------------------------------------------------

    def sse_headers!
      @res.status = 200
      @res.headers['content-type']  = 'text/event-stream' if @res.respond_to?(:headers)
      @res.headers['cache-control'] = 'no-cache' if @res.respond_to?(:headers)
      @res.headers['x-accel-buffering'] = 'no' if @res.respond_to?(:headers)
    end

    # An SSE frame. With a named event, emits both `event:` and `data:` lines;
    # without, just `data:` (the fixture's bare-JSON-line shape).
    def sse_event(name, payload)
      json = payload.to_json
      name ? "event: #{name}\ndata: #{json}\n\n" : "data: #{json}\n\n"
    end

    # A single-frame body for the degraded paths (no instrumentation / bad model).
    def sse_static(name, payload)
      SSEBody.new { |emit| emit.call(sse_event(name, payload)) }
    end

    # Rack 3 streaming body: responds to #each, yielding SSE strings. Otto's
    # finalize_response keeps the body as-is when it responds to #each.
    class SSEBody
      def initialize(&block)
        @block = block
      end

      def each
        emit = ->(chunk) { yield chunk }
        @block.call(emit)
      rescue StandardError => e
        yield "event: error\ndata: #{{ error: e.message }.to_json}\n\n"
      end
    end
  end
end
