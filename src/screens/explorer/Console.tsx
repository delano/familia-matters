// src/screens/explorer/Console.tsx
//
// The bottom command console. The operator types a command; Run sends it to
// /raw/command through useMutation and each run becomes an honest history entry:
//   - success: the result (with a "truncated" note when the server capped an
//     oversized collection), never claiming more than the backend returned.
//   - blocked: a 403 command_blocked rendered with its required_tier via the
//     shared ErrorState — terminal, with NO force button and NO tier toggle. The
//     allowlist has no override.
//   - error:  a 400/other failure (command runtime error) rendered with
//     ErrorState; nothing is fabricated.
// The backend allowlists READ-ONLY commands only; this console offers no way to
// escalate or simulate.

import type React from 'react'
import { useState } from 'react'

import { ErrorState } from '../../components/ErrorState'
import { toResourceError, type ResourceError } from '../../data/resource'
import { useMutation } from '../../data/useMutation'
import type { ApiOutcome } from '../../types'
import { runCommand, type CommandResult } from './api'
import { formatCommandResult } from './format'

/** One settled run, kept in history (newest last, like a terminal). */
type HistoryEntry =
  | { kind: 'result'; line: string; result: CommandResult }
  | { kind: 'error'; line: string; error: ResourceError }

/** Split a raw command line into the verb and its argv. */
function parseLine(line: string): { cmd: string; args: string[] } {
  const parts = line.trim().split(/\s+/).filter((p) => p.length > 0)
  const [cmd, ...args] = parts
  return { cmd: cmd ?? '', args }
}

export function Console(): React.JSX.Element {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const mutation = useMutation()

  const run = async (): Promise<void> => {
    const line = input.trim()
    if (line === '') return
    const { cmd, args } = parseLine(line)
    if (cmd === '') return

    setInput('')
    mutation.reset()

    // Tap the outcome as it passes through the mutation: useMutation.run returns
    // the data on success and null on failure (the 401 reauth side effect still
    // fires inside callOutcome). Capturing the raw outcome here lets us attach
    // the EXACT verdict — blocked vs runtime error — to THIS line, without
    // reading a stale snapshot of mutation.state.
    let outcome: ApiOutcome<CommandResult> | undefined
    const result = await mutation.run<CommandResult>(async (api) => {
      outcome = await runCommand(api, cmd, args)
      return outcome
    })

    setHistory((prev) => {
      if (result !== null) {
        return [...prev, { kind: 'result', line, result }]
      }
      // A failure: map the captured outcome to the renderable ResourceError.
      // The 401 case has no body to show beyond the reauth overlay; default to
      // unreachable only if the outcome somehow never landed.
      const error: ResourceError =
        outcome && !outcome.ok ? toResourceError(outcome) : { kind: 'unreachable' }
      return [...prev, { kind: 'error', line, error }]
    })
  }

  const pending = mutation.state.phase === 'pending'

  return (
    <section className="explorer-console" data-testid="explorer-console">
      <div className="explorer-console-head">
        <span className="explorer-console-label">Command console</span>
        <span className="explorer-console-note">
          read-only allowlist · destructive commands are blocked server-side
        </span>
      </div>

      {history.length > 0 && (
        <ol className="explorer-console-history" data-testid="explorer-console-history">
          {history.map((entry, i) => (
            <ConsoleEntry key={i} entry={entry} />
          ))}
        </ol>
      )}

      <form
        className="explorer-console-input"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <span className="explorer-console-prompt" aria-hidden="true">
          ›
        </span>
        <input
          type="text"
          data-testid="explorer-command-input"
          className="explorer-mono-input"
          placeholder="HGETALL customer:cust_1:object"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
        />
        <button
          type="submit"
          className="explorer-primary-btn"
          data-testid="explorer-command-run"
          disabled={pending || input.trim() === ''}
        >
          {pending ? 'Running…' : 'Run'}
        </button>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------------------

function ConsoleEntry(props: { entry: HistoryEntry }): React.JSX.Element {
  const { entry } = props

  if (entry.kind === 'error') {
    return (
      <li className="explorer-console-entry" data-testid="explorer-console-entry-error">
        <code className="explorer-console-echo">› {entry.line}</code>
        <ErrorState error={entry.error} />
      </li>
    )
  }

  const { result } = entry
  return (
    <li className="explorer-console-entry" data-testid="explorer-console-entry">
      <code className="explorer-console-echo">› {entry.line}</code>
      <pre className="explorer-console-result" data-testid="explorer-console-result">
        {formatCommandResult(result.result)}
      </pre>
      {result.truncated && (
        <p className="explorer-note" data-testid="explorer-console-truncated">
          Result truncated — the server capped an oversized collection. This is a
          partial reading, not the whole value.
        </p>
      )}
    </li>
  )
}
