# Quality Controls Spec

Status: draft
Branch: feature/add-quality

## Goal

Establish local and CI quality gates that catch regressions early and
keep the codebase healthy as it grows. Sequenced as reviewable increments
(stacked PRs or commits), each green before the next lands.

## Current state

| Layer | What exists |
|-------|-------------|
| Ruby tests | 12 tryouts files, in-process Rack::Test harness, live Valkey |
| TS type-checking | `tsconfig.json` strict mode, `noEmit: true` |
| CI | Claude Code Review on PRs (GA workflow) |
| Lint/format | Nothing configured |
| Dependency audit | Nothing configured |
| Pre-commit hooks | None |

Surface area: ~1630 LOC Ruby (`lib/`), ~5620 LOC JSX prototypes
(`resources/01-designs/`), stub TSX app (`src/`, 5 lines).

## Prerequisite: switch otto to the published gem

`Gemfile` currently pins `gem 'otto', path: '../otto'` with a comment
saying the published gem lacked route-level auth. Otto 2.1.0 is now
published and includes that wiring. Before any CI work, update the
Gemfile:

```ruby
gem 'otto', '~> 2.1'
```

Remove the path comment. Verify `bundle update otto` resolves and the
tryouts suite still passes locally. This unblocks CI (no sibling
checkout needed) and is its own reviewable commit.

## Constraint: Valkey service for tryouts

`test_helper.rb` boots against live Valkey (db0 + db1), calls `flushdb`,
and pins `RACK_ENV=development` (boot.rb's production-key guard). The CI
test job must declare a `valkey` (or `redis`) service container and set
`RACK_ENV=development`.

## Implementation sequence

### 1. Ruby lint (rubocop)

**Files:**
- `Gemfile`: add `rubocop` + `rubocop-performance` to `:development` group
- `.rubocop.yml`: project config (target Ruby version, enable performance cops)
- `.rubocop_todo.yml`: auto-generated so the gate is green on day one;
  violations burn down over subsequent PRs

**Validation:** `bundle exec rubocop` exits 0.

### 2. Dependency audit

**Files:**
- `Gemfile`: add `bundler-audit` to `:development` group

**npm:** `npm audit --audit-level=high` (built-in, no new dependency).

**Validation:** `bundle exec bundler-audit check --update` exits 0;
`npm audit --audit-level=high` exits 0.

### 3. TypeScript type-check script

**Files:**
- `package.json`: add `"typecheck": "tsc --noEmit"` to scripts

Covers `src/` (the TSX app). The JSX prototypes under `resources/01-designs/`
use plain JSX with esbuild transform (no TS), so they are outside this
gate. If/when prototypes migrate to TSX, extend `tsconfig.json` includes.

**Validation:** `npm run typecheck` exits 0.

### 4. CI workflow: `ci.yml`

Single workflow, multiple jobs. Runs on push to `main` and on PRs.

```
Jobs:
  ruby-lint      rubocop (no Valkey needed)
  ruby-test      tryouts suite (Valkey service container)
  ruby-audit     bundler-audit
  js-typecheck   tsc --noEmit
  js-audit       npm audit --audit-level=high
  js-build       vite build (catches import/config regressions)
```

**Ruby jobs shared setup:**
- Checkout familia-admin
- Install Ruby (matrix: current project Ruby version)
- `bundle install`

**ruby-test additional setup:**
- Valkey service container
- `RACK_ENV=development`
- `bundle exec try try/*_try.rb`

**JS jobs shared setup:**
- Checkout familia-admin
- Install Node (match local version)
- `npm ci`

**File:** `.github/workflows/ci.yml`

### 5. Pre-commit hooks (lefthook)

Lefthook over husky: repo is polyglot (Ruby + JS), lefthook is
language-agnostic and doesn't require npm to function.

**Files:**
- `Gemfile`: add `lefthook` to `:development` group (or install standalone)
- `lefthook.yml`: hook config

**Hooks:**

```yaml
pre-commit:
  parallel: true
  commands:
    rubocop:
      glob: "*.rb"
      run: bundle exec rubocop --force-exclusion {staged_files}
    typecheck:
      glob: "*.{ts,tsx}"
      run: npm run typecheck
```

**Validation:** `lefthook run pre-commit` exits 0.

### 6. Branch protection (manual GitHub setting)

Not a file change. After CI workflow is green, configure on GitHub:

- Require status checks to pass: `ruby-lint`, `ruby-test`, `ruby-audit`,
  `js-typecheck`, `js-audit`, `js-build`
- Require 1 review (Claude Code Review counts)
- Apply to `main`

Document the required check names in this spec so they can be configured
once the workflow lands.

## Out of scope

- CODEOWNERS
- Changelog enforcement
- Release automation
- eslint/biome for JSX prototypes (plain JSX, esbuild-only; revisit when
  prototypes migrate to production TSX)
