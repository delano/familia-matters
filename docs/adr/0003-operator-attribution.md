# ADR 0003 — Operator Attribution via SSH-Log Correlation

- **Status:** Accepted
- **Date:** 2026-06-12
- **Decision record:** issue #24 (Option 3), chosen by @delano

## Context

Familia Admin authenticates with **one shared passphrase**. A successful
login mints the session under a single subject claim — `admin` by default, or
`FAMILIA_ADMIN_SESSION_SUBJECT` when set — and that subject is written
verbatim into the `actor` field of every audit entry
(`lib/familia/admin/audit_log.rb`). Consequently the audit trail records
`actor: "admin"` for **every** operator: it proves that an authenticated
session acted, never which human acted.

For a tool that can reveal customer secrets and destroy/repair production
records, this is a real accountability gap. Issue #24 ("T8 — Attribution:
operator identity in audit trail") laid out three options and gated all
implementation behind a recorded human decision:

1. **Operator-name field at login**, recorded as the token `sub` —
   honor-system, corroborated by SSH/jumphost logs. Cheapest; anyone can claim
   any name.
2. **Per-operator Bearer tokens** minted via `rake auth:token` for elevated
   actions; the shared browser session stays for reads. Hard attribution for
   the dangerous operations, but each operator must manage a token and every
   deployment must run the rake task.
3. **Accept SSH-log correlation only; document it as a known limitation.** No
   change to the admin tool's code; name an owner for the correlation process.

## Decision

**Option 3 is chosen** (recorded by @delano on issue #24, 2026-06-12
~21:15 UTC). The shared-passphrase `actor: "admin"` principal stays as-is; no
operator-identity capture is added to the tool. This ADR and the README
"Operator attribution" subsection are the deliverable.

This is appropriate here because the deployment context already provides a
strong corroborating trail: operators reach the tool only through an SSH
tunnel, SSH is reachable only over VPN via a jumphost, and the jumphost holds
per-individual keyed SSH session logs. Attribution becomes a correlation
between the audit entry (timestamp + action) and the SSH/jumphost session open
against the admin port at that wall-clock time.

The rejected options were rejected on cost/benefit, not principle: Option 1
adds a spoofable field that could be mistaken for verified identity (the exact
failure this ADR guards against); Option 2 is meaningfully more engineering and
operational burden than a small team with strong SSH auditing needs today. Both
remain available if the threat model changes.

## Consequences

- **Attribution is a process control, not a technical control.** The tool
  cannot distinguish two operators who both hold the shared passphrase; in the
  audit trail they are indistinguishable, both recorded as the shared `actor`
  principal. A future reader must not mistake the `actor` field for a verified
  individual identity — the README states this explicitly.
- **The correlation has a named owner: @delano.** The owner is accountable for
  keeping SSH/jumphost audit logging enabled, retained at least as long as the
  audit trail (`FAMILIA_ADMIN_AUDIT_LIMIT`), and time-synchronised with the
  admin host, and for performing the correlation when an audit entry must be
  attributed to a person.
- **Residual gap (accepted):** attribution depends entirely on the integrity,
  retention, and clock-alignment of the SSH/jumphost logs. If those logs are
  disabled, lost, or skewed, an audit entry cannot be tied to an individual.
  This is the limitation Option 3 explicitly accepts.
- **No code, routes, middleware, or tests changed.** This is a documentation
  decision; the validation suite is unchanged byte-for-byte.
