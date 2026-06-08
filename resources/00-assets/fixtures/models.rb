# frozen_string_literal: true
#
# Design fixtures: three worked Familia models.
#
# These are the source the descriptor and sample payloads are derived from. They
# exercise the cases a designer must see: plain fields, an encrypted field, a
# transient field, every collection DataType, a unique and a multi index, a
# participation, a TTL policy, and a second logical database. Valid Familia
# 2.10.1 DSL.

require 'familia'

# The rich model. Touches almost every feature the admin must render.
class Customer < Familia::Horreum
  feature :safe_dump
  feature :encrypted_fields
  feature :relationships
  feature :expiration

  identifier_field :custid

  field :custid
  field :email
  field :name
  field :status          # active | inactive | pending
  field :created_at
  field :updated_at

  encrypted_field :api_secret   # shown as [CONCEALED]
  transient_field :password     # never persisted, never sent to the client

  list       :recent_logins     # ordered, duplicates allowed
  set        :feature_flags      # unique membership
  sorted_set :domains            # member => domain, score => added_at (timestamp)
  hashkey    :metadata           # field => value
  counter    :login_count        # atomic integer

  unique_index :email,  :email_lookup    # 1:1, class-level, queryable
  multi_index  :status, :status_index    # 1:many bucket, class-level

  safe_dump_field :custid
  safe_dump_field :email
  safe_dump_field :name
  safe_dump_field :status
  safe_dump_field :created_at

  default_expiration 90 * 24 * 60 * 60   # 90 days
end

# A TTL-dominated model on a separate logical database. Demonstrates the
# multi-database constraint the admin must respect (no cross-db atomic writes).
class Session < Familia::Horreum
  feature :expiration

  logical_database 1

  identifier_field :sessid

  field :sessid
  field :custid
  field :ip_address
  field :user_agent
  field :created_at

  default_expiration 24 * 60 * 60        # 24 hours
end

# An encrypted-secret model that participates in a Customer collection.
# Demonstrates participations (ApiKey is the participant; Customer is the target
# and gains an :api_keys sorted set of its keys).
class ApiKey < Familia::Horreum
  feature :safe_dump
  feature :encrypted_fields
  feature :relationships

  identifier_field :keyid

  field :keyid
  field :custid
  field :label
  field :created_at
  field :last_used_at

  encrypted_field :secret        # shown as [CONCEALED]

  participates_in Customer, :api_keys, type: :sorted_set, score: :created_at

  safe_dump_field :keyid
  safe_dump_field :label
  safe_dump_field :created_at
end
