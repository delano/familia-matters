# ADR 0002 — Proof Discipline for Agent-Assisted Changes

- **Status:** Accepted
- **Date:** 2026-06-11

## Context

Agent-authored changes fail in a characteristic way: the agent produces work
*and* the verdict on that work, so a confident-but-wrong result reads identically
to a correct one. The cost is silent rework — a change lands, looks done, and the
miss surfaces later. We want a standing convention that makes every "done" claim
carry its own evidence, so a reviewer (human or evaluator agent) can disprove it
cheaply rather than re-derive it.

The governing principle: **never let an agent grade its own homework with a rubber
stamp.** Every proof must be either *machine-checkable* (exit code, diff, schema
validation) or *adversarially framed* (critique mode, not confirmation mode). A
proof that is neither is not a proof.

## Decisions

### 1. Task brief carries verification structure, not just a goal

Agent tasks are framed with the template below. The load-bearing parts are the
VERIFIED/ASSUMED split (so unchecked beliefs are visible, not laundered into the
plan) and EVIDENCE REQUIRED (so "done" is a paste, not an assertion).

```md
## Project: [description]

GOAL: [stated concretely]

ASSUMPTIONS:
- [VERIFIED] [thing checked, with the evidence inline]
- [ASSUMED]  [thing believed but not yet checked]

SELF-CHECK TRIGGERS:
- Stop if: first time touching this file / inferring from naming /
  uncertain ("probably", "should be")

VALIDATION:
- [command that exits 0]      e.g. bundle exec rspec spec/
- [smoke check]               e.g. curl localhost:3000/endpoint returns expected shape
- [scope check]               e.g. no files modified outside designated paths
- [golden file diff]          e.g. output matches fixtures/expected.json

EVIDENCE REQUIRED:
- Each modified file: path, line range, what changed
- Test results: paste the failing -> passing transition
- If validation cannot run: state the check, the reason, the next-best
  signal, and the user action needed

ACCEPTANCE CRITERIA (for the evaluator agent):
- AC1: [a command + expected exit code or diff]
- AC2: [a command + expected exit code or diff]

ADVERSARIAL CHECK:
- "What would a senior engineer reject about this?"
- Fix by severity, re-verify, repeat.
```

### 2. Acceptance criteria are executable, or they are not acceptance criteria

Every AC is a command with an expected exit code or a concrete diff — something an
evaluator runs, not something it re-reads and "confirms." Prose criteria rot into
confirmation mode: the evaluator reads the code, agrees with itself, and stamps.
If a criterion cannot be written as `cmd && test $? -eq 0` (or a golden-file diff),
it does not belong in ACCEPTANCE CRITERIA — it belongs in ADVERSARIAL CHECK, where
it is framed as a critique to refute rather than a claim to confirm.

This is the wall between the objective lane (machine-framed, ACCEPTANCE CRITERIA)
and the subjective lane (critique-framed, ADVERSARIAL CHECK). Keeping the wall
clean is what stops the evaluator from rubber-stamping.

### 3. Retrospective self-calibration runs as a separate pass, never self-review

After a session, the log is scanned for rework signals — "fixed", "wrong",
"actually", "turns out", "assumed". A rework event involving an external system
that no existing check caught becomes a proposed new check, so the proof system
improves from actual failures.

That scan is performed by a **fresh agent or a deterministic hook over the
transcript — never by the agent that did the work.** The rework words only appear
when the agent already *admitted* the miss; the failures worth catching are the
silent ones where it never said "turns out." A self-run scan inherits the exact
blind spot that produced the rework, which would re-import the rubber stamp the
rest of this ADR removes.

## Consequences

- A "done" report without an evidence block (decision 1, EVIDENCE REQUIRED) is
  treated as not done, regardless of how confident the prose is.
- Evaluator agents are given ACCEPTANCE CRITERIA as runnable commands; a criterion
  that cannot be made runnable is moved to the adversarial lane rather than
  weakened into a re-read.
- The self-calibration scan (decision 3) is scheduled as its own step against the
  transcript, decoupled from the working agent. New checks it proposes feed back
  into the VALIDATION / ACCEPTANCE CRITERIA of later briefs.
- Cost: briefs are longer to write and tasks are slower to close, paid against the
  silent-rework tail. This is the long-term-codebase-health tradeoff, the same one
  ADR 0001 took on its Open Questions.
