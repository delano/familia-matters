# frozen_string_literal: true

module Admin
  # Generates an OpenAPI 3.1 document from the live descriptor + the admin route
  # map. The descriptor already carries every field/type/index, so the schema
  # work is a mechanical projection: one component schema per model and the
  # standard CRUD + integrity paths.
  module OpenAPI
    module_function

    def document(app_descriptor)
      models = Array(app_descriptor[:models])
      {
        openapi: '3.1.0',
        info: {
          title: 'familia-admin API',
          version: app_descriptor[:familia_version].to_s,
          description: 'Model-aware admin API for Familia, generated from runtime reflection.',
        },
        servers: [{ url: '/admin/api' }],
        components: { schemas: models.each_with_object({}) { |m, h| h[m[:class]] = schema_for(m) } },
        paths: models.each_with_object(discovery_paths) { |m, h| h.merge!(model_paths(m)) },
      }
    end

    def discovery_paths
      {
        '/_meta' => get_op('meta', 'Full application descriptor'),
        '/_openapi' => get_op('openapi', 'This document'),
        '/models' => get_op('list_models', 'List model names'),
        '/integrity/_stale_indexes' => get_op('stale_indexes', 'Indexes needing a rebuild'),
        '/migrations' => get_op('migration_status', 'Applied + pending migrations'),
      }
    end

    def model_paths(model)
      name = model[:model]
      base = "/models/#{name}"
      paths = {
        "#{base}/records" => {
          'get' => list_op(model),
          'post' => body_op("Create a #{name}", model[:class], '201'),
        },
        "#{base}/records/{id}" => {
          'get' => get_op("read_#{name}", "Read a #{name}", ref: model[:class]),
          'put' => body_op("Update a #{name}", model[:class]),
          'delete' => get_op("destroy_#{name}", "Destroy a #{name}"),
        },
        "/integrity/#{name}" => get_op("integrity_#{name}", "Integrity report for #{name}"),
      }
      if Array(model[:fields]).any? { |f| f[:category].to_s == 'encrypted' }
        field = Array(model[:fields]).find { |f| f[:category].to_s == 'encrypted' }[:name]
        paths["#{base}/records/{id}/reveal/#{field}"] =
          { 'post' => get_op("reveal_#{name}", 'Reveal one encrypted field (elevated, audited)') }
      end
      paths
    end

    def schema_for(model)
      return model[:json_schema] if model[:json_schema]

      props = Array(model[:fields]).reject { |f| f[:category].to_s == 'transient' }
                                   .each_with_object({}) { |f, h| h[f[:name]] = field_schema(f) }
      { type: 'object', title: model[:class], properties: props }
    end

    def field_schema(field)
      return field[:json_schema] if field[:json_schema]
      return { type: 'string', description: 'encrypted; returned as [CONCEALED]' } if field[:category].to_s == 'encrypted'

      { type: 'string' }
    end

    def get_op(id, summary, ref: nil)
      op = { 'operationId' => id, 'summary' => summary,
             'responses' => { '200' => { 'description' => 'OK' } } }
      if ref
        op['responses']['200']['content'] =
          { 'application/json' => { 'schema' => { '$ref' => "#/components/schemas/#{ref}" } } }
      end
      op
    end

    def list_op(model)
      { 'operationId' => "list_#{model[:model]}", 'summary' => "List #{model[:model]} records",
        'responses' => { '200' => { 'description' => 'OK' } } }
    end

    def body_op(summary, ref, status = '200')
      {
        'summary' => summary,
        'requestBody' => {
          'content' => { 'application/json' => { 'schema' => { '$ref' => "#/components/schemas/#{ref}" } } },
        },
        'responses' => { status => { 'description' => 'OK' } },
      }
    end
  end
end
