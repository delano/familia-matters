export const meta = {
  name: 'wave1-hardening',
  description: 'Wave 1 production hardening: implement, cold-evaluate, and fix T1/T2/T3 serially',
  phases: [
    { title: 'T1 #19', detail: 'deployment safety: implement, evaluate, fix' },
    { title: 'T2 #20', detail: 'boot defers to host Familia config: implement, evaluate, fix' },
    { title: 'T3 #21', detail: 'remove simulator artifacts: implement, evaluate, fix' },
  ],
}

const REPO = '/Users/d/Projects/dev/delano/familia-admin'
const OTS = '/Users/d/Projects/dev/onetimesecret/onetimesecret'

const TICKETS = [
  { id: 'T1', issue: 19, branch: 'claude/t1-deployment-safety', wt: '/Users/d/Projects/dev/delano/familia-admin-wt-t1' },
  { id: 'T2', issue: 20, branch: 'claude/t2-boot-defers', wt: '/Users/d/Projects/dev/delano/familia-admin-wt-t2' },
  { id: 'T3', issue: 21, branch: 'claude/t3-remove-simulator', wt: '/Users/d/Projects/dev/delano/familia-admin-wt-t3' },
]

const IMPL_SCHEMA = {
  type: 'object',
  required: ['ticket', 'stopped', 'branch'],
  properties: {
    ticket: { type: 'string' },
    stopped: { type: 'boolean', description: 'true if a STOP condition triggered and work halted' },
    stop_reason: { type: 'string', description: 'exact STOP condition and observed evidence; empty if not stopped' },
    branch: { type: 'string' },
    pr_number: { type: 'number' },
    pr_url: { type: 'string' },
    gates: { type: 'string', description: 'constants actuals + risk restatement, condensed' },
    baseline_failures: { type: 'string', description: 'verbatim pre-existing failures, or "none"' },
    validations: { type: 'string', description: 'validation suite outcomes, condensed' },
    ci_status: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const EVAL_SCHEMA = {
  type: 'object',
  required: ['ticket', 'blockers', 'ac_results', 'verdict'],
  properties: {
    ticket: { type: 'string' },
    blockers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'title'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          title: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    ac_results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['ac', 'pass'],
        properties: {
          ac: { type: 'string' },
          command: { type: 'string' },
          actual: { type: 'string' },
          pass: { type: 'boolean' },
        },
      },
    },
    ci_status: { type: 'string', description: 'final CI status + run URL' },
    verdict: { type: 'string', description: 'one-paragraph cold verdict' },
  },
}

const FIX_SCHEMA = {
  type: 'object',
  required: ['ticket', 'pushed'],
  properties: {
    ticket: { type: 'string' },
    fixed: { type: 'array', items: { type: 'string' } },
    deferred: { type: 'array', items: { type: 'string' }, description: 'blockers deferred as documented known limitations, with justification' },
    validations: { type: 'string' },
    pushed: { type: 'boolean' },
    ci_status: { type: 'string' },
    notes: { type: 'string' },
  },
}

function implPrompt(t) {
  const t2extra = t.id !== 'T2' ? '' : '\n\nOTS-INTEGRATION CONSTANTS (this ticket requires them)\nThe OTS checkout is at ' + OTS + ' on branch develop. It is READ-ONLY and outside ticket scope; never modify it. Determine every OTS constant from that checkout and record the git ref you read each value from. Pre-verified for you: its Gemfile.lock pins familia 2.10.1 (still record it yourself). If any OTS constant cannot be determined from the checkout, STOP per the ticket; do not infer from naming.'
  return 'You are the implementing agent for ticket ' + t.id + ' (GitHub issue #' + t.issue + ') of the Familia Admin production-hardening effort. Repo delano/familia-matters; primary checkout at ' + REPO + ' (on main). Never modify the primary checkout or any other worktree.\n\nREAD FIRST, fully, in order. These are the law and override this prompt on any conflict:\n1. ' + REPO + '/docs/0612-familia-admin-production-hardening-plan.md (deployment context section 1, scope section 3, GATES section 4, STOP conditions section 5, validation section 7).\n2. Your ticket: run gh issue view ' + t.issue + ' from inside ' + REPO + '. The issue body is your ticket.' + t2extra + '\n\nWORKSPACE\n- git -C ' + REPO + ' fetch origin main\n- git -C ' + REPO + ' worktree add ' + t.wt + ' -b ' + t.branch + ' origin/main\n  (If the branch or worktree already exists from a prior run, adopt it instead of failing.)\n- Do ALL work inside ' + t.wt + '. Run bundle install, and npm ci (the node validations need it).\n- Valkey is live on 127.0.0.1:6379. It is the dev fixture store; the try suite flushing db0/db1 is expected and fine.\n- Git discipline: use git --no-pager for diff/show. NEVER amend, rebase, or force-push.\n\nPROCESS\n1. GATES before any edit (plan section 4): run every CONSTANTS command and record actual values; capture BASELINE by running the full section-7 validation suite and recording failures verbatim; write the one-sentence RISK RESTATEMENT.\n2. Implement exactly the ticket scope. Obey every STOP IF in the ticket and plan section 5. No opportunistic out-of-scope fixes.\n3. Run the ticket VALIDATION commands plus the full section-7 suite, including SCOPE_FETCH then SCOPE_CHECK (in that order, always).\n4. Commit in small, well-described commits on ' + t.branch + '. Push with git push -u origin ' + t.branch + '.\n5. Open the PR with gh pr create. The PR body must contain: "Closes #' + t.issue + '", the filled GATES (constants actuals, baseline, risk restatement), ASSUMPTIONS with evidence, a per-file change list, and EVIDENCE per the ticket EVIDENCE REQUIRED section (CI link preferred over pasted output).\n6. Watch CI: gh pr checks <number> --watch (allow up to about 10 minutes). If CI fails: diagnose, fix, push, re-watch. At most 2 fix attempts.\n7. Post one comment on issue #' + t.issue + ' with the filled template sections: GATES actuals, BASELINE, RISK RESTATEMENT, ASSUMPTIONS, EVIDENCE.\n\nSTOP DISCIPLINE\nIf any STOP condition triggers, stop immediately and return stopped=true with the exact condition and observed evidence. Never write outside plan section-3 SCOPE. Never hand-edit Gemfile.lock (rewrites by bundle install are fine). Do not merge the PR. Your final output is consumed by an orchestrator, not a human; fill the structured fields accurately.'
}

function evalPrompt(t, pr) {
  return 'COLD EVALUATION PASS (plan section 8). You have fresh context by design.\n\nYou are a senior engineer reviewing this diff for production deployment inside OneTimeSecret. List everything you would block this PR for, ordered by severity. Then verify each acceptance criterion by running its command, not by reading the code.\n\nYour inputs are EXACTLY three things:\n1. The plan: ' + REPO + '/docs/0612-familia-admin-production-hardening-plan.md. Read it fully.\n2. The ticket STOP IF / VALIDATION / ACCEPTANCE CRITERIA sections: gh issue view ' + t.issue + ' (run inside ' + REPO + '). Use the issue BODY only.\n3. The PR diff: gh pr diff ' + pr + '\nDo NOT read issue comments, PR comments, or PR description prose as evidence; they are the implementer advocacy. Exception: you may look at the PR body solely to locate the CI run link.\n\nEXECUTION\n- The branch is checked out in the worktree ' + t.wt + '. cd there; run git fetch origin and git status. If behind origin/' + t.branch + ', run git pull --ff-only. Run bundle install / npm ci if needed.\n- Run every acceptance-criteria command verbatim and record actual output. Run SCOPE_FETCH then SCOPE_CHECK (plan section 7). Run the full section-7 suite and flag any failure the diff introduces.\n- CI: gh pr checks ' + pr + '. If still running, watch up to about 10 minutes; record final status and run URL.\n- Valkey on 127.0.0.1:6379 is the dev fixture store; try-suite flushes are expected.\n- You are read-only with respect to the code: run commands, but do not fix anything, do not commit, do not push.\n\nThe machine-checkable floor, regardless of prose: SCOPE_CHECK exits 0, no new validation failures, CI green. An empty blocker list must mean you verified everything, not that you skipped.'
}

function fixPrompt(t, pr, blockers, round) {
  return 'You are the fix agent for ticket ' + t.id + ' (issue #' + t.issue + ', PR #' + pr + '), fix round ' + round + '. A cold evaluator returned the blocker list below.\n\nFirst read ' + REPO + '/docs/0612-familia-admin-production-hardening-plan.md (scope section 3, STOP section 5, validation section 7) and gh issue view ' + t.issue + '.\n\nWork in the existing worktree ' + t.wt + ' on branch ' + t.branch + ' (cd there; bundle install / npm ci if needed; Valkey live on 127.0.0.1:6379).\n\nFix blockers in severity order. If a blocker is out of ticket scope or you believe it is wrong, do NOT code around it: list it under deferred with a one-line justification and add it to the PR body under "Known limitations" via gh pr edit. Re-run the ticket VALIDATION commands plus the full section-7 suite (SCOPE_FETCH then SCOPE_CHECK), commit, push. Never amend, rebase, or force-push; use git --no-pager. Then gh pr checks ' + pr + ' --watch (up to about 10 minutes).\n\nBLOCKERS:\n' + JSON.stringify(blockers, null, 2)
}

const results = []
for (const t of TICKETS) {
  phase(t.id + ' #' + t.issue)
  log('Implementing ' + t.id + ' (issue #' + t.issue + ') on ' + t.branch)
  const impl = await agent(implPrompt(t), { label: 'impl:' + t.id, schema: IMPL_SCHEMA })
  if (!impl) {
    results.push({ ticket: t.id, issue: t.issue, status: 'agent_failed' })
    continue
  }
  if (impl.stopped || !impl.pr_number) {
    log(t.id + ' STOPPED: ' + (impl.stop_reason || 'no PR created'))
    results.push({ ticket: t.id, issue: t.issue, status: 'stopped', stop_reason: impl.stop_reason || 'no PR created', gates: impl.gates, baseline: impl.baseline_failures, notes: impl.notes })
    continue
  }
  log(t.id + ': PR #' + impl.pr_number + ' open, CI ' + (impl.ci_status || 'unknown') + '. Starting cold evaluation.')
  let rounds = 0
  let lastEval = null
  while (rounds < 3) {
    lastEval = await agent(evalPrompt(t, impl.pr_number), { label: 'eval:' + t.id + ':r' + (rounds + 1), schema: EVAL_SCHEMA })
    if (!lastEval) break
    if (lastEval.blockers.length === 0) break
    log(t.id + ' eval round ' + (rounds + 1) + ': ' + lastEval.blockers.length + ' blocker(s). Dispatching fix agent.')
    const fix = await agent(fixPrompt(t, impl.pr_number, lastEval.blockers, rounds + 1), { label: 'fix:' + t.id + ':r' + (rounds + 1), schema: FIX_SCHEMA })
    rounds++
    if (!fix || !fix.pushed) {
      log(t.id + ' fix round ' + rounds + ' did not push; stopping the loop for human review.')
      break
    }
  }
  const clean = lastEval && lastEval.blockers.length === 0
  log(t.id + ' finished: ' + (clean ? 'evaluation clean' : 'unresolved items remain') + ' after ' + rounds + ' fix round(s).')
  results.push({
    ticket: t.id,
    issue: t.issue,
    status: clean ? 'clean' : 'unresolved',
    pr: impl.pr_number,
    pr_url: impl.pr_url,
    fix_rounds: rounds,
    final_blockers: lastEval ? lastEval.blockers : 'evaluator failed',
    ac_results: lastEval ? lastEval.ac_results : null,
    ci: lastEval ? lastEval.ci_status : impl.ci_status,
    verdict: lastEval ? lastEval.verdict : null,
    gates: impl.gates,
    baseline: impl.baseline_failures,
  })
}
return results