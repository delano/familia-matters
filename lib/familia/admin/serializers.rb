# frozen_string_literal: true

# Familia::Admin::Serializers
#
# Turns live Familia objects into the exact JSON shapes the design prototype
# consumed (see fixtures/*.json). The two non-obvious transforms live here:
#
#   * record  - masks encrypted fields as "[CONCEALED]", omits transient fields,
#               and never lets a ConcealedString reach JSON (its #to_json raises
#               by design, fail-closed).
#   * audit_report - the real Familia::Horreum::AuditReport#to_h SUMMARISES each
#               drift dimension to an integer count. The integrity console binds
#               to the actual offending identifiers (phantom ids, stale index
#               values, ...) plus a summary.by_type. The AuditReport Data object
#               still carries those arrays as attributes, so we serialise from
#               the attributes, not from #to_h, and compute the summary here.
#
module Familia
  module Admin
    module Serializers
      module_function

      MASK = '[CONCEALED]'

      # ----- records ---------------------------------------------------------

      # Admin record serializer: all persistent fields, encrypted masked,
      # transient omitted. Use record.safe_dump for lower permission tiers.
      #
      # @param rec [Familia::Horreum]
      # @param full [Boolean] include the raw dbkey under :_key
      # @return [Hash]
      def record(rec, full: false)
        klass = rec.class
        out = {}
        Array(safe { klass.persistent_fields }).each do |f|
          ft = safe { klass.field_types[f] }
          next if ft && ft.category == :transient

          out[f] = if (ft && ft.category == :encrypted) || concealed?(safe { rec.send(f) })
                     MASK
                   else
                     jsonable(safe { rec.send(f) })
                   end
        end
        out[:_key] = safe { rec.dbkey } if full
        out
      end

      # @return [Array<Hash>]
      def records(list, full: false)
        Array(list).compact.map { |r| record(r, full: full) }
      end

      # ----- collections -----------------------------------------------------

      # Type-aware collection view matching the fixture shapes:
      #   counter    -> { value: N }
      #   hashkey    -> { entries: {..} }
      #   sorted_set -> { members: [{member:, score:}] }     (scores are meaningful)
      #   list/set   -> { members: [..] }
      #
      # @param name [String, Symbol] collection name
      # @param coll [Familia::DataType]
      # @param type [String, Symbol] canonical type (:list/:set/:sorted_set/:hashkey/:counter)
      # @param offset [Integer]
      # @param limit [Integer]
      # @return [Hash]
      def collection(name, coll, type, offset: 0, limit: 50)
        base = { collection: name.to_s, type: type.to_s }
        case type.to_sym
        when :counter
          base.merge(value: safe { coll.value.to_i })
        when :hashkey
          base.merge(entries: safe { coll.all } || {})
        when :sorted_set
          window = Array(safe { coll.range(offset, offset + limit - 1) })
          base.merge(
            offset: offset, limit: limit,
            members: window.map { |m| { member: m, score: safe { coll.score(m) } } },
          )
        when :list
          base.merge(
            offset: offset, limit: limit,
            members: Array(safe { coll.range(offset, offset + limit - 1) }),
          )
        else # :set and anything else enumerable; sets are unordered so paginate in Ruby
          all = Array(safe { coll.members })
          base.merge(offset: offset, limit: limit, members: all.drop(offset).first(limit))
        end
      end

      # ----- integrity report ------------------------------------------------

      # Transform a live AuditReport into the integrity-console contract:
      # identifier ARRAYS (not counts) plus a summary.by_type. A healthy report
      # has the same shape with empty arrays and healthy: true.
      #
      # @param report [Familia::Horreum::AuditReport]
      # @return [Hash]
      def audit_report(report)
        inst = report.instances || {}
        uniq = Array(report.unique_indexes)
        multi = Array(report.multi_indexes)
        parts = Array(report.participations)
        xref = report.cross_references

        out = {
          healthy: bool(safe { report.healthy? }),
          model: report.model_class,
          checked_at: safe { report.audited_at&.to_i },
          complete: bool(safe { report.complete? }),
          instances: {
            count_timeline: inst[:count_timeline],
            count_scan: inst[:count_scan],
            phantoms: Array(inst[:phantoms]),
            missing: Array(inst[:missing]),
          },
          unique_indexes: uniq.map do |idx|
            { index_name: idx[:index_name], stale: Array(idx[:stale]), missing: Array(idx[:missing]) }
          end,
          multi_indexes: multi.map do |idx|
            entry = {
              index_name: idx[:index_name],
              stale_members: Array(idx[:stale_members]),
              orphaned_keys: Array(idx[:orphaned_keys]),
            }
            entry[:missing] = Array(idx[:missing]) if idx.key?(:missing)
            entry[:status] = idx[:status] if idx[:status]
            entry
          end,
          participations: parts.map do |p|
            { collection_name: p[:collection_name], stale_members: Array(p[:stale_members]) }
          end,
          related_fields: related_fields(report.related_fields),
          cross_references: cross_references(xref),
        }
        out[:summary] = summary(out)
        out
      end

      # Computes summary.total_issues + by_type from the serialized arrays so the
      # summary can never disagree with the sections it summarises.
      def summary(serialized)
        by_type = {
          phantoms: serialized[:instances][:phantoms].size,
          missing: serialized[:instances][:missing].size,
          stale_unique_index: serialized[:unique_indexes].sum { |i| i[:stale].size },
          missing_unique_index: serialized[:unique_indexes].sum { |i| i[:missing].size },
          stale_multi_member: serialized[:multi_indexes].sum { |i| i[:stale_members].size },
          orphaned_index_key: serialized[:multi_indexes].sum { |i| i[:orphaned_keys].size },
          stale_participation: serialized[:participations].sum { |p| p[:stale_members].size },
          cross_ref_missing_index: array_size(serialized.dig(:cross_references, :in_instances_missing_unique_index)),
          cross_ref_wrong_target: array_size(serialized.dig(:cross_references, :index_points_to_wrong_identifier)),
        }
        { total_issues: by_type.values.sum, by_type: by_type }
      end

      def related_fields(rf)
        return { status: 'not_checked', healthy: true, checked: [] } if rf.nil?

        healthy = rf.all? { |e| Array(e[:orphaned_keys]).empty? }
        {
          healthy: healthy,
          status: healthy ? 'healthy' : 'issues_found',
          checked: rf.map { |e| e[:field_name] },
          fields: rf.map do |e|
            { field_name: e[:field_name], klass: e[:klass], orphaned_keys: Array(e[:orphaned_keys]), status: e[:status] }
          end,
        }
      end

      def cross_references(xref)
        return { status: 'not_checked' } if xref.nil?

        {
          status: xref[:status],
          in_instances_missing_unique_index: Array(xref[:in_instances_missing_unique_index]),
          index_points_to_wrong_identifier: Array(xref[:index_points_to_wrong_identifier]),
        }
      end

      # ----- util ------------------------------------------------------------

      # True if the value is an encrypted-field wrapper (ConcealedString). Its
      # #to_json raises, so it must never reach JSON.generate.
      def concealed?(value)
        return false if value.nil?

        defined?(ConcealedString) && value.is_a?(ConcealedString) ||
          value.class.name == 'ConcealedString' ||
          value.respond_to?(:encrypted_value)
      end

      # Coerce a scalar field value into something JSON.generate accepts.
      def jsonable(value)
        return MASK if concealed?(value)
        return value if value.nil? || value.is_a?(Numeric) || value == true || value == false

        value.is_a?(String) ? value : value.to_s
      end

      def bool(v)
        v ? true : false
      end

      def array_size(v)
        Array(v).size
      end

      def safe
        yield
      rescue StandardError
        nil
      end
    end
  end
end
