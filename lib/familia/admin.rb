# frozen_string_literal: true

# Familia Admin — a model-aware web admin for applications built on Familia
# (a Ruby object layer over Redis/Valkey), served via Otto.
#
# Requiring this file loads the whole admin: the descriptor/reflection layer,
# the API controller, the auth strategies, the audit sink, the raw explorer,
# the streaming bodies, the migration adapter, and the Otto app builder.
require_relative 'admin/version'
require_relative 'admin/boot'
require_relative 'admin/descriptor'
require_relative 'admin/serializers'
require_relative 'admin/audit_log'
require_relative 'admin/auth'
require_relative 'admin/raw'
require_relative 'admin/streaming'
require_relative 'admin/migrations'
require_relative 'admin/api'
require_relative 'admin/mcp'
require_relative 'admin/app'
