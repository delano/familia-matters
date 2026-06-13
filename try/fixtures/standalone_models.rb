# frozen_string_literal: true
#
# Fixture for FAMILIA_ADMIN_MODELS (the STANDALONE model-files path).
#
# It declares Horreum models ONLY — deliberately NO Familia.configure / uri /
# encryption_keys. Under this path the admin owns the connection + encryption
# (Boot.setup! configured them from env before requiring this), so a model-only
# source like this one is exactly the shape the path is built for. The model
# names are intentionally NOT in the demo set (Customer/Session/ApiKey) so a
# boot test can prove the admin reflects THESE and not the bundled fixtures.

require 'familia'

class Widget < Familia::Horreum
  identifier_field :wid

  field :wid
  field :name
  field :color

  list :tags
end
