# resources/00-assets/lib/familia/admin/descriptor.rb
#
# frozen_string_literal: true

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
# Usage:
#   Familia::Admin::Descriptor.app            # whole application
#   Familia::Admin::Descriptor.model(User)    # one model
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
        Familia.members.reject { |m| m.name.nil? }
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

      # Instance-scoped and class-scoped DataTypes attached to the model.
      def datatypes(klass)
        instance = Array(safe { related_entries(klass.related_fields, 'instance') })
        klazz    = Array(safe { related_entries(klass.class_related_fields, 'class') })
        instance + klazz
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
      #
      # QUIET BY DESIGN (T4): unlike Familia::Admin::Util#safe (which logs every
      # rescued exception), this one stays silent. /_meta is pure, cacheable
      # metadata rebuilt frequently; a partially-featured model would otherwise
      # emit the same stderr line on every descriptor build. Request-path
      # failures (the ones that matter mid-incident) go through Util#safe.
      def safe
        yield
      rescue StandardError
        nil
      end
    end
  end
end
