# lib/familia/admin/util.rb
#
# frozen_string_literal: true

require 'json'

module Familia
  module Admin
    # Familia::Admin::Util
    #
    # Shared per-request helpers for the Otto controllers (Admin::API,
    # Admin::Sessions). Each controller is instantiated per request with
    # (req, res); these helpers expect @req / @res to be set by #initialize.
    #
    # safe{} POLICY (T4): an ops tool's job is telling the operator the truth
    # during an incident. A rescued exception is therefore LOGGED (warn, tagged
    # with the rescuing class, exception class + message) before degrading to
    # the nil fallback — never silently swallowed. Two deliberate exceptions to
    # this policy elsewhere in the codebase:
    #   * Descriptor#safe stays quiet by design: /_meta is pure cacheable
    #     metadata and one misbehaving model must not spam stderr on every
    #     descriptor build (see descriptor.rb).
    #   * RateLimit#safe keeps its own fail-open wording ("degraded
    #     (fail-open)") because the message documents a security posture, not
    #     just an error (see rate_limit.rb).
    module Util
      private

      # Run the block; on StandardError log a tagged line to stderr and return
      # nil so the response degrades gracefully instead of 500ing. The optional
      # context string narrows the tag for hot spots (e.g. 'body_json').
      def safe(context = nil)
        yield
      rescue StandardError => e
        where = [self.class.name, context].compact.join(' ')
        warn("[familia-admin #{where}] safe{} rescued #{e.class}: #{e.message}")
        nil
      end

      # JSON helper: set the status and RETURN the bare hash. Otto's JSONHandler
      # serializes a returned Hash verbatim; we must NOT write @res.body here or
      # it would be double-encoded. base.rb#ensure_status_set only fills an
      # unset/zero status, so a pre-set 404/400/409 is preserved.
      def json(payload, status: 200)
        @res.status = status
        payload
      end

      # Parse the JSON request body once. The instance-method route handler does
      # NOT fold the body into @req.params (only the logic-class handler does),
      # so mutating actions read it here. A malformed body degrades to {} (which
      # drives the bad_request path downstream) — and the parse failure is
      # logged via safe{} so "mysteriously empty fields" has a stderr trace.
      def body_json
        @body_json ||= begin
          body = @req.body
          raw = body ? body.read : ''
          body.rewind if body.respond_to?(:rewind)
          raw.to_s.empty? ? {} : (safe('body_json') { JSON.parse(raw) } || {})
        end
      end
    end
  end
end
