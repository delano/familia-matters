# frozen_string_literal: true

desc 'Run the Tryouts contract + security suite'
task :test do
  try = "#{`bundle show tryouts`.strip}/exe/try"
  sh "bundle exec ruby #{try} try/*_try.rb"
end

desc 'Seed the dev database (SEED_DRIFT=0 for a clean dataset)'
task :seed do
  ruby 'bin/seed'
end

task default: :test
