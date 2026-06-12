# Ticket Template — Familia Admin Production Hardening

Paste this into each GitHub Issue (T1–T8). It inherits
`docs/0612-familia-admin-production-hardening-plan.md` (SCOPE, CONSTANTS,
STOP conditions, validation suite, evaluator protocol) — the issue only adds
what is specific to the ticket. The implementing agent fills every `___`
**before its first edit**; blanks at review time fail the ticket.

```markdown
## TICKET <Tn> — <title>
Inherits: docs/0612-familia-admin-production-hardening-plan.md
Branch:   claude/<ticket-slug>
Wave:     <1 parallel | 2 serial — rebase on previous wave-2 ticket | 3 interactive>

GOAL: <one sentence — what DONE looks like>

### GATES (all three before the first edit)

CONSTANTS (run the plan's commands; record ACTUAL; obey ON-MISMATCH):
- FAMILIA_VERSION:  ___        (expected 2.10.x)
- RUBY_MINOR:       ___        (expected >= 3.2)
- SMOKE_BASELINE:   ___        (expected exit=0)
- <ticket-specific constants, e.g. HAS_ATOMIC_WRITE for record tickets,
   OTS_BOOT_FILE for T2>: ___

BASELINE (full validation suite from plan §7, run before any edit):
- Failures already present: ___ (verbatim, or "none")

RISK RESTATEMENT:
- If this ticket is done wrong, the failure is: ___ , affecting: ___

### ASSUMPTIONS
- [VERIFIED] ___ (evidence: command + output)
- [ASSUMED]  ___ (why proceeding anyway is safe)

### STOP IF (in addition to plan §5)
- <anything specific to this ticket's blast radius>

### VALIDATION (ticket-specific; plan §7 suite also required)
- <command that exits 0, e.g. bundle exec ruby try/auth_try.rb>
- SCOPE_CHECK passes (plan §7)
- BASELINE_DIFF: no new failures vs the captured baseline

### EVIDENCE REQUIRED
- Link to green CI run on the PR branch (preferred over pasted output)
- Pasted output ONLY for checks CI cannot run — state which and why
- Each modified file: path, line range, one-line description
- For security-sensitive changes (auth, cookies, headers): before/after
- For new try/ assertions: the failing → passing transition

### ACCEPTANCE CRITERIA (for the cold evaluator)
Evaluator inputs are exactly: the PR diff + this block + the plan document.
Each criterion must be machine-checkable (a command and its expected output).
- AC1: ___
- AC2: ___
- ACn: SCOPE_CHECK exits 0 and BASELINE_DIFF is empty

### ADVERSARIAL CHECK (cold pass, fresh context — plan §8)
"You are a senior engineer reviewing this diff for production deployment
inside OneTimeSecret. List everything you would block this PR for, ordered
by severity. Then verify each acceptance criterion by running its command,
not by reading the code."
Fix by severity → re-run validations → repeat until empty or every item is
a documented known limitation with an owner.
```

## Notes for whoever files the issues

- Wave 2 tickets (T4, T5, T6) all write `api.rb`/`routes.txt`: file them
  with explicit "blocked by" links so they run serially, in that order.
- T7 is the large interactive ticket — run it where a human can see the UI,
  and split into sub-PRs per screen if any single diff gets unwieldy.
- T8 is a decision ticket: no implementation until an option is chosen.
- The try suite flushes Valkey db0/db1 — CI and local runs must never point
  at a Redis holding real data.
