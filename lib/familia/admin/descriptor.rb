# frozen_string_literal: true

require 'set'

# Familia::Admin::Descriptor
#
# Reflects loaded Familia models into a UI-consumable descriptor. This is the
# single source of truth a frontend uses to build itself: it lists every model,
# its fields and field categories, attached DataTypes, indexes, participations,
# the client-safe field set, TTL policy, and (when present) the JSON Schema.
#
# Design rules:
#   * Pure metadata. This module performs NO database reads, so GET /_meta is
#     cheap and cacheable. Anything that touches Redis (record counts, index
#     staleness, integrity) lives behind the integrity/migration endpoints.
#   * Defensive reflection. Optional Familia features may be absent; every
#     uncertain call is guarded so a partially-featured model still describes.
#   * Verified against Familia 2.10.1 public API.
#
# Two honest caveats baked in here (see fixtures/README.md):
#   1. Index-backing structures (the unique/multi index hashkeys) and the
#      per-class `instances` timeline surface in live reflection as class-scoped
#      datatypes. `datatypes` filters them out by cross-referencing
#      `indexes[].index_name`; they are still reported under `internals` so the
#      UI can show them in a separate group.
#   2. A participation target collection (e.g. Customer's `api_keys`, created
#      because ApiKey `participates_in Customer`) surfaces as an instance
#      datatype on the target. It belongs under `participations`, not the
#      developer-declared collection list, so it is filtered out of `datatypes`
#      too.
#
# Usage:
#   Familia::Admin::Descriptor.app            # whole application
#   Familia::Admin::Descriptor.model(User)    # one model
#   Familia::Admin::Descriptor.resolve('customer') # config_name -> Class (strict)
#
module Familia
  module Admin
    module Descriptor
      module_function

      # Canonical DataType macro names, used to map a DataType class back to a
      # stable wire name (e.g. Familia::SortedSet -> :sorted_set). Derived from
      # the live registry so it self-corrects if Familia changes class names.
      CANONICAL_DATATYPES = %i[
        list set sorted_set hashkey string json_stringkey counter lock
      ].freeze

      # Class-internal structures that surface through related-field reflection
      # but are never user-editable collections: the per-class :instances
      # timeline, and the :participations membership reverse-index every
      # participant model gains. Index-backing hashkeys are added dynamically
      # (per model) by cross-referencing the index names.
      INTERNAL_DATATYPE_NAMES = %i[instances participations].freeze

      # ----- top level -------------------------------------------------------

      # @return [Hash] the full application descriptor
      def app
        {
          generated_at: safe { Familia.now.to_i } || Time.now.to_i,
          familia_version: Familia::VERSION,
          models: models.map { |m| model(m) },
        }
      end

      # @return [Array<Class>] every registered, named Horreum subclass
      def models
        Array(safe { Familia.members }).reject { |m| m.nil? || m.name.nil? }
      end

      # Strict, allowlisted resolution of a wire name to a model class.
      #
      # SECURITY: only registered Horreum members are resolvable, and only by
      # their `config_name` (the wire name, e.g. "customer") or exact class name
      # (e.g. "Customer"). This deliberately does NOT fall through to
      # `Familia.resolve_class`/`const_get`, which would let a `:model` path
      # segment reference arbitrary constants. The route param is attacker-
      # controlled, so this is the gate that keeps it pointed at real models.
      #
      # @param name [String, Symbol]
      # @return [Class, nil]
      def resolve(name)
        return nil if name.nil?

        wanted = name.to_s
        models.find do |m|
          (safe { m.config_name.to_s } == wanted) || m.name == wanted
        end
      end

      # @param klass [Class] a Familia::Horreum subclass
      # @return [Hash] descriptor for one model
      def model(klass)
        flds = fields(klass)
        idx  = indexes(klass)
        {
          model: safe { klass.config_name },
          class: klass.name,
          key_pattern: key_pattern(klass),
          identifier_field: identifier_label(klass),
          logical_database: safe { klass.logical_database },
          fields: flds,
          datatypes: datatypes(klass),
          internals: internals(klass),
          indexes: idx,
          participations: participations(klass),
          safe_dump_fields: safe_dump_fields(klass),
          expiration: expiration(klass),
          json_schema: json_schema(klass),
          actions: actions(flds, idx),
        }.compact
      end

      # ----- fields ----------------------------------------------------------

      # @return [Array<Hash>] one entry per scalar field
      def fields(klass)
        id_field = identifier_label_sym(klass)
        Array(safe { klass.fields }).map do |name|
          ft  = safe { klass.field_types[name] }
          cat = (ft && ft.category) || :field    # :field | :encrypted | :transient
          entry = {
            name: name,
            category: cat,
            persisted: ft ? ft.persistent? : true,
          }
          entry[:identifier]     = true  if name == id_field
          entry[:client_visible] = false if cat == :transient
          disp = display_for(cat)
          entry[:display] = disp if disp
          entry
        end
      end

      # Placeholder shown to the client for non-plain categories.
      def display_for(category)
        case category
        when :encrypted then '[CONCEALED]'
        when :transient then '[REDACTED]'
        end
      end

      # ----- datatypes (relations) ------------------------------------------

      # Developer-declared, instance-scoped collections the operator may browse
      # and edit. Index-backing structures, the instances timeline, and
      # participation-target collections are filtered out (reported under
      # `internals` / `participations` instead). See the caveats above.
      #
      # @return [Array<Hash>] [{name:, type:, scope:}]
      def datatypes(klass)
        excluded = excluded_datatype_names(klass)
        instance = Array(safe { related_entries(klass.related_fields, 'instance') })
        klazz    = Array(safe { related_entries(klass.class_related_fields, 'class') })
        (instance + klazz).reject { |e| excluded.include?(e[:name].to_sym) }
      end

      # The structures we filtered out of `datatypes`: index hashkeys and the
      # instances timeline. Surfaced separately so a power-user UI can offer an
      # "internals" group without conflating them with editable collections.
      #
      # @return [Array<Hash>] [{name:, type:, scope:, kind:}]
      def internals(klass)
        names = internal_datatype_names(klass)
        return [] if names.empty?

        instance = Array(safe { related_entries(klass.related_fields, 'instance') })
        klazz    = Array(safe { related_entries(klass.class_related_fields, 'class') })
        (instance + klazz).select { |e| names.include?(e[:name].to_sym) }.map do |e|
          e.merge(kind: internal_kind(e[:name]))
        end
      end

      def internal_kind(name)
        case name.to_sym
        when :instances then 'timeline'
        when :participations then 'membership'
        else 'index'
        end
      end

      # Names that must never appear as editable collections: the timeline, the
      # index-backing hashkeys, and collections this class is a participation
      # *target* of.
      def excluded_datatype_names(klass)
        internal_datatype_names(klass) | participation_target_names(klass)
      end

      def internal_datatype_names(klass)
        index_names = indexes(klass).map { |i| i[:index_name].to_sym }
        (INTERNAL_DATATYPE_NAMES + index_names).to_set
      end

      # Collection names this class gains because some OTHER model declares
      # `participates_in <this class>, :collection`. They are reported under the
      # owning participant's `participations`, not here.
      def participation_target_names(klass)
        names = Set.new
        models.each do |m|
          Array(safe { m.participation_relationships }).each do |p|
            target = safe { p.target_class_base }
            target_class = target.is_a?(Class) ? target : safe { Familia.resolve_class(target) }
            names << p.collection_name.to_sym if target_class == klass
          end
        end
        names
      rescue StandardError
        Set.new
      end

      # @param map [Hash{Symbol => RelatedFieldDefinition}]
      def related_entries(map, scope)
        (map || {}).map do |name, defn|
          { name: name, type: datatype_name_for(defn.klass), scope: scope }
        end
      end

      # Reverse-map a DataType class to its canonical wire name.
      def datatype_name_for(klass)
        datatype_reverse_map[klass] || klass.name.to_s.split('::').last
      end

      def datatype_reverse_map
        @datatype_reverse_map ||= CANONICAL_DATATYPES.each_with_object({}) do |name, h|
          k = safe { Familia::DataType.registered_type(name) }
          h[k] = name if k
        end
      end

      # ----- indexes ---------------------------------------------------------

      # Pure metadata from IndexDescriptor (no DB hits). Staleness is reported
      # by the integrity endpoint, not here.
      def indexes(klass)
        return [] unless Familia.respond_to?(:index_descriptors)

        Array(safe { Familia.index_descriptors(owner: klass) }).map do |d|
          {
            index_name: d.index_name,
            field: d.field,
            cardinality: d.cardinality,    # :unique | :multi
            class_level: d.class_level?,
            queryable: d.query?,
            coordinate: safe { d.coordinate },
          }.compact
        end
      end

      # ----- participations --------------------------------------------------

      def participations(klass)
        return [] unless klass.respond_to?(:participation_relationships)

        Array(safe { klass.participation_relationships }).map do |p|
          {
            collection: p.collection_name,
            type: p.type,                       # :sorted_set | :set | :list
            target: safe { p.target_class_base },
            scored: !p.score.nil?,
            through: p.through,
          }.compact
        end
      end

      # ----- supporting metadata --------------------------------------------

      def safe_dump_fields(klass)
        return nil unless klass.respond_to?(:safe_dump_field_names)

        safe { klass.safe_dump_field_names }
      end

      def expiration(klass)
        return nil unless klass.respond_to?(:default_expiration)

        ttl = safe { klass.default_expiration }
        ttl ? { policy: 'ttl', default_seconds: ttl.to_i } : { policy: 'none' }
      end

      def json_schema(klass)
        return nil unless defined?(Familia::SchemaRegistry)

        safe { Familia::SchemaRegistry.schema_for(klass) }
      end

      def key_pattern(klass)
        safe { "#{klass.prefix}:{#{identifier_label(klass)}}:#{klass.suffix}" }
      end

      def identifier_label(klass)
        idf = safe { klass.identifier_field }
        idf.is_a?(Proc) ? 'id' : idf.to_s
      end

      def identifier_label_sym(klass)
        idf = safe { klass.identifier_field }
        idf.is_a?(Proc) ? nil : idf
      end

      def actions(flds, idx)
        a = %w[list read create update destroy]
        a << 'reveal'        if flds.any? { |f| f[:category] == :encrypted }
        a << 'rebuild_index' unless idx.empty?
        a
      end

      # ----- util ------------------------------------------------------------

      # Swallow reflection errors so one misbehaving model never breaks /_meta.
      def safe
        yield
      rescue StandardError
        nil
      end
    end
  end
end
