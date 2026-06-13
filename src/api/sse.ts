// src/api/sse.ts
//
// EventSource helper for GET /admin/api/stream/repair/:model (api.rb
// stream_repair). The HttpOnly session cookie rides along automatically —
// EventSource is same-origin here and needs no credentials plumbing.
//
// Server contract (verified against lib/familia/admin/api.rb):
//   - Progress frames are UNNAMED (`data:`-only), so they arrive as 'message'
//     events: {event:'start',...}, then one {phase, current, total, result}
//     per phase, then {event:'done', healthy, summary}.
//   - Failures are NAMED 'error' events with a JSON body: sse_static('error',
//     {error:'not_found',...}) for an unknown model, and SSEBody's rescue
//     emits `event: error` with {error: message} on a mid-stream exception.
//   - A browser-level connection failure also fires 'error', but with NO data
//     — that is how the two are told apart below.
//
// THE LOAD-BEARING RULE — this stream never reconnects: EventSource
// auto-reconnects by default, and every reconnect re-runs the stream action
// server-side, which re-audits :repair and re-runs the health check. So the
// helper close()s the source on EVERY terminal condition: the done frame, a
// named error frame, a connection error, and an unparseable frame. Callers
// re-run a stream only by explicit operator action (a fresh open()).

/** A parsed unnamed frame from the repair stream. Shapes per api.rb. */
export type RepairStreamFrame = Record<string, unknown>

export interface RepairStreamHandlers {
  /** Every parsed unnamed frame, in arrival order (start, phases, done). */
  onFrame(frame: RepairStreamFrame): void
  /** The terminal done frame. The stream is already closed when this fires. */
  onDone?(frame: RepairStreamFrame): void
  /**
   * A server-emitted error frame (named 'error' event), or an unparseable
   * frame. The stream is already closed; it will not reconnect. `code` is the
   * body's `error` string when present (e.g. 'not_found').
   */
  onServerError?(code: string, body?: unknown): void
  /**
   * The connection failed (network drop, backend gone, or an auth-rejected
   * request — EventSource exposes no status, so the caller should confirm via
   * getSession() and route a dead session to the reauth overlay). The stream
   * is already closed; it will not reconnect.
   */
  onConnectionError?(): void
}

export interface RepairStream {
  /** Idempotent. Also safe to call mid-stream to abandon it. */
  close(): void
}

export interface OpenRepairStreamOptions {
  /** Injection point for tests / non-browser environments. */
  eventSourceFactory?(url: string): EventSource
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Open the repair progress stream for a model. */
export function openRepairStream(
  model: string,
  handlers: RepairStreamHandlers,
  opts?: OpenRepairStreamOptions,
): RepairStream {
  const factory = opts?.eventSourceFactory ?? ((url: string) => new EventSource(url))
  const url = `/admin/api/stream/repair/${encodeURIComponent(model)}`
  const source = factory(url)

  let closed = false
  function close(): void {
    if (closed) return
    closed = true
    source.close()
  }

  source.addEventListener('message', (event: MessageEvent) => {
    if (closed) return
    let frame: unknown
    try {
      frame = JSON.parse(String(event.data))
    } catch {
      // Protocol violation. Surface it and stop — acting on a partially
      // garbled stream would misreport repair progress.
      close()
      handlers.onServerError?.('unparseable_frame', event.data)
      return
    }
    if (!isRecord(frame)) {
      close()
      handlers.onServerError?.('unparseable_frame', frame)
      return
    }

    handlers.onFrame(frame)

    if (frame.event === 'done') {
      // Close BEFORE notifying: the server ends the body after done, and an
      // open EventSource would auto-reconnect, re-running (and re-auditing)
      // the whole stream action.
      close()
      handlers.onDone?.(frame)
    }
  })

  source.addEventListener('error', (event: Event) => {
    if (closed) return
    close()

    // A NAMED 'error' event from the server carries data; a browser-level
    // connection failure does not.
    const data = (event as MessageEvent).data as unknown
    if (data === undefined || data === null) {
      handlers.onConnectionError?.()
      return
    }
    let body: unknown
    try {
      body = JSON.parse(String(data))
    } catch {
      body = data
    }
    const code = isRecord(body) && typeof body.error === 'string' ? body.error : 'stream_error'
    handlers.onServerError?.(code, body)
  })

  return { close }
}
