# frozen_string_literal: true

require_relative 'descriptor'

module Familia
  module Admin
    # Serializers turn live Familia objects into the JSON shapes the frontend
    # (and the fixtures) consume. Kept separate from the controller so they are
    # unit-testable in isolation.
    module Serializers
      module_function

      # A record as the admin list/detail endpoints return it: every persistent
      # field, encrypted fields masked, transient fields omitted.
      #
      # Use this (not safe_dump) for the admin tier; safe_dump is the lower,
      # client-facing projection.
      def record(rec, full: false)
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

      # A collection (DataType) page, shaped per type to match the fixtures:
      #   sorted_set -> { members: [{member, score}] }
      #   hashkey    -> { entries: {field => value} }
      #   counter    -> { value: N }
      #   list/set   -> { members: [...] }
      def collection(rec, name, offset: 0, limit: 50)
        coll = rec.send(name)
        type = Descriptor.datatype_name_for(coll.class).to_s
        base = { collection: name.to_s, type: type }

        case type
        when 'sorted_set'
          members = Array(safe { coll.members })
          page = members.slice(offset, limit) || []
          base.merge(offset: offset, limit: limit,
                     members: page.map { |m| { member: m, score: safe { coll.score(m) } } })
        when 'hashkey'
          base.merge(entries: (safe { coll.all } || {}))
        when 'counter'
          base.merge(value: (safe { coll.value }).to_i)
        else # list, set, and any other enumerable
          members = Array(safe { coll.members } || safe { coll.to_a })
          page = members.slice(offset, limit) || []
          base.merge(offset: offset, limit: limit, members: page)
        end
      end

      # Map a Familia::Horreum::AuditReport into the integrity contract the
      # console renders: arrays of identifiers (not counts), a computed summary,
      # and the cross-reference / related-field shapes. The gem's #to_h collapses
      # everything to counts, so we read the report's raw attributes instead.
      def audit_report(report)
        inst  = report.instances || {}
        out = {
          model: report.model_class,
          healthy: report.healthy?,
          checked_at: report.audited_at.to_i,
          complete: report.complete?,
          instances: {
            count_timeline: inst[:count_timeline],
            count_scan: inst[:count_scan],
            phantoms: Array(inst[:phantoms]),
            missing: Array(inst[:missing]),
          },
          unique_indexes: Array(report.unique_indexes).map { |ix|
            {
              index_name: ix[:index_name].to_s,
              stale: Array(ix[:stale]).map { |e| field_value_of(e) },
              missing: Array(ix[:missing]).map { |e| field_value_of(e) },
            }
          },
          multi_indexes: Array(report.multi_indexes).map { |ix|
            {
              index_name: ix[:index_name].to_s,
              stale_members: Array(ix[:stale_members]).map { |e| member_id_of(e) },
              orphaned_keys: Array(ix[:orphaned_keys]).map { |e| key_of(e) },
            }
          },
          participations: Array(report.participations).map { |p|
            {
              collection_name: p[:collection_name].to_s,
              stale_members: Array(p[:stale_members]).map { |m| participation_member(m) },
            }
          },
          related_fields: related_fields(report.related_fields),
          cross_references: cross_references(report.cross_references),
        }
        out[:summary] = summary(out)
        out
      end

      # --- audit-report helpers -------------------------------------------

      def field_value_of(entry)
        entry.is_a?(Hash) ? (entry[:field_value] || entry[:identifier] || entry.to_s) : entry
      end

      def member_id_of(entry)
        entry.is_a?(Hash) ? (entry[:indexed_id] || entry[:identifier] || entry[:field_value]) : entry
      end

      def key_of(entry)
        entry.is_a?(Hash) ? (entry[:key] || entry[:field_value]) : entry
      end

      def participation_member(m)
        return { identifier: m.to_s } unless m.is_a?(Hash)

        { identifier: m[:identifier], collection_key: m[:collection_key], reason: m[:reason] }.compact
      end

      def related_fields(related)
        return { healthy: true, checked: [] } if related.nil?

        {
          healthy: Array(related).all? { |rf| Array(rf[:orphaned_keys]).empty? },
          checked: Array(related).map { |rf| rf[:field_name].to_s },
        }
      end

      def cross_references(cross)
        return { status: 'not_checked', in_instances_missing_unique_index: [], index_points_to_wrong_identifier: [] } if cross.nil?

        {
          status: (cross[:status] || :ok).to_s,
          in_instances_missing_unique_index: Array(cross[:in_instances_missing_unique_index]).map { |e|
            e.is_a?(Hash) ? e[:identifier] : e
          },
          index_points_to_wrong_identifier: Array(cross[:index_points_to_wrong_identifier]).map { |w|
            {
              index: (w[:index_name] || w[:index]).to_s,
              field_value: w[:field_value],
              points_to: w[:index_id] || w[:points_to],
              actual: w[:expected_id] || w[:actual],
            }
          },
        }
      end

      # The summary strip the console renders: totals per issue type, derived
      # from the serialized arrays so the strip always agrees with the sections.
      def summary(out)
        by = {
          phantoms: out[:instances][:phantoms].size,
          missing: out[:instances][:missing].size,
          stale_unique_index: out[:unique_indexes].sum { |x| x[:stale].size },
          missing_unique_index: out[:unique_indexes].sum { |x| x[:missing].size },
          stale_multi_member: out[:multi_indexes].sum { |x| x[:stale_members].size },
          orphaned_index_key: out[:multi_indexes].sum { |x| x[:orphaned_keys].size },
          stale_participation: out[:participations].sum { |x| x[:stale_members].size },
          cross_ref_missing_index: out[:cross_references][:in_instances_missing_unique_index].size,
          cross_ref_wrong_target: out[:cross_references][:index_points_to_wrong_identifier].size,
        }
        { total_issues: by.values.sum, by_type: by }
      end

      def safe
        yield
      rescue StandardError
        nil
      end
    end
  end
end
