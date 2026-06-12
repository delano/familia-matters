// src/api/sse.test.ts
//
// The repair-stream helper against a scripted fake EventSource (jsdom has
// none). The property under test is the no-reconnect discipline: EVERY
// terminal condition — done frame, named server error, connection error,
// unparseable frame — must close() the source, because an open EventSource
// auto-reconnects and each reconnect re-runs (and re-audits) the server-side
// stream action.

import { describe, expect, it, vi } from 'vitest'

import { openRepairStream, type RepairStreamHandlers } from './sse'

/** A minimal scriptable EventSource double. */
class FakeEventSource {
  url: string
  closed = false
  private listeners = new Map<string, Array<(event: Event) => void>>()

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    const existing = this.listeners.get(type) ?? []
    existing.push(listener)
    this.listeners.set(type, existing)
  }

  close(): void {
    this.closed = true
  }

  /** Deliver an unnamed frame ('message' event) with the given data string. */
  message(data: string): void {
    this.dispatch('message', { data })
  }

  /** Deliver a named server 'error' event (carries data). */
  serverError(data: string): void {
    this.dispatch('error', { data })
  }

  /** Deliver a browser-level connection error (no data). */
  connectionError(): void {
    this.dispatch('error', {})
  }

  private dispatch(type: string, props: { data?: string }): void {
    const event = { type, data: props.data } as unknown as Event
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

function open(handlers: Partial<RepairStreamHandlers> = {}) {
  const source = { current: null as FakeEventSource | null }
  const onFrame = handlers.onFrame ?? vi.fn()
  const full: RepairStreamHandlers = { ...handlers, onFrame }
  const stream = openRepairStream('customer', full, {
    eventSourceFactory: (url) => {
      source.current = new FakeEventSource(url)
      return source.current as unknown as EventSource
    },
  })
  if (source.current === null) throw new Error('factory not called')
  return { stream, source: source.current, onFrame }
}

describe('openRepairStream', () => {
  it('opens the model-scoped URL with the model encoded', () => {
    const { source } = open()
    expect(source.url).toBe('/admin/api/stream/repair/customer')

    const weird = { current: null as FakeEventSource | null }
    openRepairStream(
      'odd/model name',
      { onFrame: vi.fn() },
      {
        eventSourceFactory: (url) => {
          weird.current = new FakeEventSource(url)
          return weird.current as unknown as EventSource
        },
      },
    )
    expect(weird.current?.url).toBe('/admin/api/stream/repair/odd%2Fmodel%20name')
  })

  it('forwards parsed frames in arrival order (start, phases, done)', () => {
    const frames: unknown[] = []
    const { source } = open({ onFrame: (f) => frames.push(f) })

    source.message(JSON.stringify({ event: 'start', model: 'Customer' }))
    source.message(JSON.stringify({ phase: 'instances', current: 1, total: 5 }))
    source.message(JSON.stringify({ event: 'done', healthy: true, summary: {} }))

    expect(frames).toEqual([
      { event: 'start', model: 'Customer' },
      { phase: 'instances', current: 1, total: 5 },
      { event: 'done', healthy: true, summary: {} },
    ])
  })

  it('closes BEFORE onDone fires, so no auto-reconnect can re-run the repair audit', () => {
    let closedAtDone: boolean | null = null
    const { source } = open({
      onDone: () => {
        closedAtDone = source.closed
      },
    })

    source.message(JSON.stringify({ event: 'done', healthy: true, summary: {} }))

    expect(closedAtDone).toBe(true)
    expect(source.closed).toBe(true)
  })

  it('a named server error frame surfaces its code and closes the stream', () => {
    const onServerError = vi.fn()
    const { source, onFrame } = open({ onServerError })

    source.serverError(JSON.stringify({ error: 'not_found', resource: 'model' }))

    expect(onServerError).toHaveBeenCalledWith('not_found', {
      error: 'not_found',
      resource: 'model',
    })
    expect(source.closed).toBe(true)
    expect(onFrame).not.toHaveBeenCalled()
  })

  it('a connection error (no data) closes the stream and reports it as such', () => {
    const onConnectionError = vi.fn()
    const onServerError = vi.fn()
    const { source } = open({ onConnectionError, onServerError })

    source.connectionError()

    expect(onConnectionError).toHaveBeenCalledTimes(1)
    expect(onServerError).not.toHaveBeenCalled()
    expect(source.closed).toBe(true)
  })

  it('an unparseable frame closes the stream and surfaces a server error', () => {
    const onServerError = vi.fn()
    const onDone = vi.fn()
    const { source, onFrame } = open({ onServerError, onDone })

    source.message('not json at all')

    expect(onServerError).toHaveBeenCalledWith('unparseable_frame', 'not json at all')
    expect(source.closed).toBe(true)
    expect(onFrame).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('frames after a terminal condition are ignored (closed stream stays silent)', () => {
    const { source, onFrame } = open()

    source.message(JSON.stringify({ event: 'done', healthy: true, summary: {} }))
    source.message(JSON.stringify({ phase: 'late', current: 1, total: 1 }))

    expect(onFrame).toHaveBeenCalledTimes(1)
  })

  it('close() is idempotent and abandons a live stream', () => {
    const { stream, source, onFrame } = open()

    stream.close()
    stream.close()
    source.message(JSON.stringify({ phase: 'instances', current: 1, total: 5 }))

    expect(source.closed).toBe(true)
    expect(onFrame).not.toHaveBeenCalled()
  })
})
